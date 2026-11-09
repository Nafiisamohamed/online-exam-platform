/**
 * Grading and results endpoints. See docs/api.md#grading and #results.
 *
 * Grading (LECTURER: course lecturer, or the exam's second grader for essays):
 * GET  /api/exams/:id/grading                 queue of answers to grade (?status=)
 * GET  /api/grading/answers/:id               one answer with rubric / answer key
 * PUT  /api/grading/answers/:id/marks         course lecturer: { marks, comment? } for non-essay answers
 * PUT  /api/grading/answers/:id/essay         { criteria: [{ criterionId, marks }], comment? }
 * POST /api/grading/answers/:id/resolve       course lecturer: { marks } for a DISCREPANCY
 *
 * Results:
 * GET  /api/exams/:id/results                 ADMIN, course lecturer: table incl. absent students
 * POST /api/exams/:id/results/publish         course lecturer { reason? } (reason required from the 2nd publication)
 * POST /api/exams/:id/results/reopen          course lecturer { reason }
 * GET  /api/exams/:id/grades.csv?lang=so|en   ADMIN, course lecturer
 * GET  /api/results-search                   ADMIN, read only: ?search, facultyId, academicYearId, semesterNumber,
 *                                             courseId, examType, examId, publication, page, pageSize
 * GET  /api/my/results                        STUDENT: published results
 * GET  /api/my/results/:examId                STUDENT: one result with answers (correct answers if review allowed)
 * GET  /api/my/results/:examId/slip.pdf       STUDENT: result slip PDF (?lang=so|en, default: user's language)
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, pageQuery, trimmed, validate, zid } from "../../middleware/validate.ts";
import * as results from "../results/results.service.ts";
import * as grading from "./grading.service.ts";

export const gradingRouter = Router();

const lecturer = [authenticate(), requireRole("LECTURER")];
const marks = z.number().min(0).max(1000);
const langQuery = z.object({ lang: z.enum(["so", "en"]).optional() });

gradingRouter.get(
  "/exams/:id/grading",
  ...lecturer,
  validate({ params: idParams, query: z.object({ status: z.enum(["NEEDS_REVIEW", "PENDING_ESSAY", "AWAITING_SECOND_GRADE", "DISCREPANCY", "GRADED", "AUTO_CORRECT", "AUTO_INCORRECT", "NOT_ANSWERED"]).optional() }) }),
  async (req, res) => {
    res.json(await grading.gradingQueue(currentUser(req), req.valid.params.id, req.valid.query));
  },
);

gradingRouter.get("/grading/answers/:id", ...lecturer, validate({ params: idParams }), async (req, res) => {
  res.json({ answer: await grading.getAnswerForGrading(currentUser(req), req.valid.params.id) });
});

gradingRouter.put(
  "/grading/answers/:id/marks",
  ...lecturer,
  validate({ params: idParams, body: z.object({ marks, comment: z.string().trim().max(2000).optional() }) }),
  async (req, res) => {
    res.json({ answer: await grading.setMarks(currentUser(req), req.valid.params.id, req.valid.body.marks, req.valid.body.comment, req) });
  },
);

gradingRouter.put(
  "/grading/answers/:id/essay",
  ...lecturer,
  validate({ params: idParams, body: z.object({ criteria: z.array(z.object({ criterionId: zid, marks })).min(1).max(20), comment: z.string().trim().max(5000).optional() }) }),
  async (req, res) => {
    res.json({ answer: await grading.markEssay(currentUser(req), req.valid.params.id, req.valid.body, req) });
  },
);

gradingRouter.post("/grading/answers/:id/resolve", ...lecturer, validate({ params: idParams, body: z.object({ marks }) }), async (req, res) => {
  res.json({ answer: await grading.resolveDiscrepancy(currentUser(req), req.valid.params.id, req.valid.body.marks, req) });
});

gradingRouter.get("/exams/:id/results", authenticate(), requireRole("ADMIN", "LECTURER"), validate({ params: idParams }), async (req, res) => {
  res.json(await results.examResults(currentUser(req), req.valid.params.id));
});

/** Response 200: { publicationNumber, attempts, notifiedStudents }. Errors: 409 GRADING_INCOMPLETE { ungraded }, 409 ATTEMPTS_IN_PROGRESS. */
/** Read-only review of one closed attempt's saved answers (submitted or terminated). Response 200: { attempt, questions }. */
gradingRouter.get("/exams/:id/attempts/:attemptId/answers", authenticate(), requireRole("ADMIN", "LECTURER"), validate({ params: z.object({ id: zid, attemptId: zid }) }), async (req, res) => {
  res.json(await results.attemptReview(currentUser(req), req.valid.params.id, req.valid.params.attemptId));
});

gradingRouter.post("/exams/:id/results/publish", ...lecturer, validate({ params: idParams, body: z.object({ reason: z.string().trim().max(1000).optional() }) }), async (req, res) => {
  res.json(await results.publishResults(currentUser(req), req.valid.params.id, req.valid.body.reason, req));
});

gradingRouter.post("/exams/:id/results/reopen", ...lecturer, validate({ params: idParams, body: z.object({ reason: trimmed(1000) }) }), async (req, res) => {
  res.json(await results.reopenResults(currentUser(req), req.valid.params.id, req.valid.body.reason, req));
});

gradingRouter.get("/exams/:id/grades.csv", authenticate(), requireRole("ADMIN", "LECTURER"), validate({ params: idParams, query: langQuery }), async (req, res) => {
  const user = currentUser(req);
  const { filename, csv } = await results.gradesCsv(user, req.valid.params.id, req.valid.query.lang ?? user.preferredLanguage, req);
  res.type("text/csv").attachment(filename).send(csv);
});

gradingRouter.get("/my/results", authenticate(), requireRole("STUDENT"), async (req, res) => {
  res.json({ items: await results.myResults(currentUser(req)) });
});

gradingRouter.get("/my/results/:examId", authenticate(), requireRole("STUDENT"), validate({ params: z.object({ examId: zid }) }), async (req, res) => {
  res.json({ result: await results.myResult(currentUser(req), req.valid.params.examId) });
});

gradingRouter.get("/my/results/:examId/slip.pdf", authenticate(), requireRole("STUDENT"), validate({ params: z.object({ examId: zid }), query: langQuery }), async (req, res) => {
  const user = currentUser(req);
  const { pdf, filename } = await results.resultSlipPdf(user, req.valid.params.examId, req.valid.query.lang ?? user.preferredLanguage);
  res.type("application/pdf").attachment(filename).send(pdf);
});

gradingRouter.get(
  "/results-search",
  authenticate(), requireRole("ADMIN"),
  validate({
    query: pageQuery.extend({
      search: z.string().trim().min(1).max(100).optional(),
      facultyId: zid.optional(),
      academicYearId: zid.optional(),
      semesterNumber: z.coerce.number().int().min(1).max(8).optional(),
      courseId: zid.optional(),
      examType: z.enum(["QUIZ", "MIDTERM", "FINAL"]).optional(),
      examId: zid.optional(),
      publication: z.enum(["UNPUBLISHED", "PUBLISHED", "REOPENED"]).optional(),
    }),
  }),
  async (req, res) => {
    res.json(await results.searchResults(req.valid.query));
  },
);
