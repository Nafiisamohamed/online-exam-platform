/**
 * Exam builder and scheduling endpoints. See docs/api.md#exams and #schedules.
 *
 * Exams (staff):
 * GET   /api/exams                       ADMIN, LECTURER   list (courseId, status)
 * POST  /api/exams                       LECTURER          create (own course)
 * GET   /api/exams/:id                   ADMIN, LECTURER   details, rules with available counts, schedules
 * PATCH /api/exams/:id                   LECTURER          settings
 * PUT   /api/exams/:id/rules             LECTURER          replace rules (DRAFT only, checked for enough questions)
 * GET   /api/exams/:id/preview           LECTURER          one sample generated exam (nothing saved)
 * POST  /api/exams/:id/publish           LECTURER          DRAFT -> PUBLISHED
 * POST  /api/exams/:id/schedules         LECTURER          request a schedule
 *
 * Schedules:
 * GET   /api/schedules                   ADMIN, LECTURER, INVIGILATOR (status, from, to)
 * GET   /api/schedules/:id               ADMIN, owner lecturer, assigned invigilator
 * POST  /api/schedules/:id/approve       ADMIN   (409 SCHEDULE_CONFLICT lists clashes)
 * POST  /api/schedules/:id/reject        ADMIN   { reason }
 * POST  /api/schedules/:id/cancel        ADMIN, owner lecturer
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, trimmed, validate, zid } from "../../middleware/validate.ts";
import * as schedules from "../schedules/schedules.service.ts";
import * as exams from "./exams.service.ts";

export const examsRouter = Router();
export const schedulesRouter = Router();

const money = z.number().min(0).max(100_000).refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "at most 2 decimals");
const ruleBody = z.object({
  questionType: z.enum(["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  marksPerQuestion: z.number().positive().max(1000),
  questionCount: z.number().int().min(1).max(200),
  topicIds: z.array(zid).max(50).optional(),
});
const settings = {
  instructions: z.string().trim().max(5000).optional(),
  examType: z.enum(["QUIZ", "MIDTERM", "FINAL"]).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  allowAnswerReview: z.boolean().optional(),
  feeAmount: money.optional(),
  feeCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  secondGraderId: zid.nullable().optional(),
};

examsRouter.use(authenticate());

examsRouter.get(
  "/",
  requireRole("ADMIN", "LECTURER"),
  validate({ query: z.object({ courseId: zid.optional(), status: z.enum(["DRAFT", "PUBLISHED"]).optional() }) }),
  async (req, res) => {
    res.json({ items: await exams.listExams(currentUser(req), req.valid.query) });
  },
);

/** Body: { courseId, title, instructions?, shuffle..., allowAnswerReview?, feeAmount?, feeCurrency?, secondGraderId?, rules? }. */
examsRouter.post(
  "/",
  requireRole("LECTURER"),
  validate({ body: z.object({ courseId: zid, title: trimmed(200), ...settings, examType: z.enum(["QUIZ", "MIDTERM", "FINAL"]), rules: z.array(ruleBody).max(30).optional() }) }),
  async (req, res) => {
    const { courseId, ...rest } = req.valid.body;
    res.status(201).json({ exam: await exams.createExam(currentUser(req), courseId, rest, req) });
  },
);

examsRouter.get("/:id", requireRole("ADMIN", "LECTURER"), validate({ params: idParams }), async (req, res) => {
  res.json({ exam: await exams.getExam(currentUser(req), req.valid.params.id) });
});

examsRouter.patch(
  "/:id",
  requireRole("LECTURER"),
  validate({ params: idParams, body: z.object({ title: trimmed(200).optional(), ...settings }).refine((v) => Object.keys(v).length > 0, "send at least one field") }),
  async (req, res) => {
    res.json({ exam: await exams.updateExam(currentUser(req), req.valid.params.id, req.valid.body, req) });
  },
);

/** Body: { rules: [...] }. Error 400 EXAM_NOT_ENOUGH_QUESTIONS { rules: [{ position, required, available }] }. */
examsRouter.put("/:id/rules", requireRole("LECTURER"), validate({ params: idParams, body: z.object({ rules: z.array(ruleBody).min(1).max(30) }) }), async (req, res) => {
  res.json({ exam: await exams.setRules(currentUser(req), req.valid.params.id, req.valid.body.rules, req) });
});

/** The lecturer's tick list: per rule, the reviewed questions that match and whether each is included. */
examsRouter.get("/:id/question-pool", requireRole("LECTURER"), validate({ params: idParams }), async (req, res) => {
  res.json(await exams.questionPool(currentUser(req), req.valid.params.id));
});

/** Body: { questionIds } = the questions unticked for this draft exam. */
examsRouter.put("/:id/excluded-questions", requireRole("LECTURER"), validate({ params: idParams, body: z.object({ questionIds: z.array(zid).max(2000) }) }), async (req, res) => {
  res.json({ exam: await exams.setExcludedQuestions(currentUser(req), req.valid.params.id, req.valid.body.questionIds, req) });
});

examsRouter.get("/:id/preview", requireRole("LECTURER"), validate({ params: idParams }), async (req, res) => {
  res.json(await exams.previewExam(currentUser(req), req.valid.params.id));
});

examsRouter.post("/:id/publish", requireRole("LECTURER"), validate({ params: idParams }), async (req, res) => {
  res.json({ exam: await exams.publishExam(currentUser(req), req.valid.params.id, req) });
});

const scheduleBody = z.object({
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
  // durationMinutes is not sent: the server uses the window length (end - start).
  roomIds: z.array(zid).max(20).default([]),
  invigilatorIds: z.array(zid).max(20).default([]),
});

examsRouter.post("/:id/schedules", requireRole("LECTURER"), validate({ params: idParams, body: scheduleBody }), async (req, res) => {
  res.status(201).json({ schedule: await schedules.requestSchedule(currentUser(req), req.valid.params.id, req.valid.body, req) });
});

schedulesRouter.use(authenticate(), requireRole("ADMIN", "LECTURER", "INVIGILATOR"));

schedulesRouter.get(
  "/",
  validate({ query: z.object({ status: z.enum(["REQUESTED", "APPROVED", "REJECTED", "CANCELLED"]).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }),
  async (req, res) => {
    res.json({ items: await schedules.listSchedules(currentUser(req), req.valid.query) });
  },
);

schedulesRouter.get("/:id", validate({ params: idParams }), async (req, res) => {
  res.json({ schedule: await schedules.getSchedule(currentUser(req), req.valid.params.id) });
});

/** Body (optional): { confirmUnknownCapacity: true } when a chosen room's capacity is unknown. */
schedulesRouter.post("/:id/approve", requireRole("ADMIN"), validate({ params: idParams, body: z.object({ confirmUnknownCapacity: z.boolean().optional() }).default({}) }), async (req, res) => {
  res.json({ schedule: await schedules.approveSchedule(currentUser(req), req.valid.params.id, req, req.valid.body) });
});

schedulesRouter.post("/:id/reject", requireRole("ADMIN"), validate({ params: idParams, body: z.object({ reason: trimmed(500) }) }), async (req, res) => {
  res.json({ schedule: await schedules.rejectSchedule(currentUser(req), req.valid.params.id, req.valid.body.reason, req) });
});

schedulesRouter.post("/:id/cancel", requireRole("ADMIN", "LECTURER"), validate({ params: idParams }), async (req, res) => {
  res.json({ schedule: await schedules.cancelSchedule(currentUser(req), req.valid.params.id, req) });
});
