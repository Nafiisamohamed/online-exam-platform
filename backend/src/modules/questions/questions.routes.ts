/**
 * Question bank endpoints (LECTURER, own courses only). See docs/api.md#question-bank.
 *
 * GET  /api/courses/:courseId/questions          list (type, difficulty, topicId, search, archived, page)
 * POST /api/courses/:courseId/questions          create
 * GET  /api/courses/:courseId/question-summary   counts per type / difficulty / marks
 * GET  /api/courses/:courseId/topics             topics
 * POST /api/courses/:courseId/topics             add a topic { name }
 * POST /api/courses/:courseId/question-imports   CSV upload (field "file") -> preview
 * GET  /api/questions/:id                        question, current version, version list
 * PUT  /api/questions/:id                        edit (new version if the current one is locked)
 * GET  /api/questions/:id/versions/:versionId    one version
 * POST /api/questions/:id/archive | /restore
 * POST /api/question-images                      upload an image (field "image") -> { imagePath }
 * GET  /api/question-images/:name                any logged-in user (students see images in exams)
 * GET  /api/imports/templates/questions.csv      the CSV template
 */
import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { notFound } from "../../lib/errors.ts";
import { csvUpload, imageUpload, questionImageDir, saveQuestionImage, toCsv } from "../../lib/uploads.ts";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, pageQuery, trimmed, validate, zid } from "../../middleware/validate.ts";
import { previewQuestionImport, QUESTION_COLUMNS, TEMPLATE_ROWS } from "./question-import.ts";
import * as questions from "./questions.service.ts";

export const questionsRouter = Router();

const marks = z.number().positive().max(1000);
/** Request body for create and edit. The detailed rules are checked in question-content.ts. */
const questionBody = z.object({
  type: z.enum(["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"]),
  text: trimmed(5000),
  marks,
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  topic: trimmed(100),
  imagePath: z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/, "upload the image first").nullable().optional(),
  options: z.array(z.object({ text: z.string().max(1000), isCorrect: z.boolean() })).max(5).optional(),
  acceptedAnswers: z.array(z.string().max(500)).max(20).optional(),
  rubric: z.array(z.object({ description: z.string().max(1000), maxMarks: marks })).max(20).optional(),
});
const courseParams = z.object({ courseId: zid });

questionsRouter.get("/imports/templates/questions.csv", authenticate(), requireRole("LECTURER"), (_req, res) => {
  res.type("text/csv").attachment("question-template.csv").send(toCsv(QUESTION_COLUMNS, TEMPLATE_ROWS));
});

questionsRouter.get("/question-images/:name", authenticate(), validate({ params: z.object({ name: z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/) }) }), (req, res) => {
  const file = path.join(questionImageDir(), req.valid.params.name);
  if (!fs.existsSync(file)) throw notFound("IMAGE_NOT_FOUND");
  // The name is validated above (uuid + extension), so it cannot leave the image folder.
  res.sendFile(req.valid.params.name, { root: questionImageDir(), dotfiles: "allow", headers: { "Cache-Control": "private, max-age=3600" } });
});

questionsRouter.use(["/courses/:courseId/questions", "/courses/:courseId/question-summary", "/courses/:courseId/topics", "/courses/:courseId/question-imports", "/questions", "/question-images"], authenticate(), requireRole("LECTURER"));

questionsRouter.get(
  "/courses/:courseId/questions",
  validate({
    params: courseParams,
    query: pageQuery.extend({
      type: z.enum(["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"]).optional(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
      topicId: zid.optional(),
      search: z.string().trim().max(200).optional(),
      archived: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
      review: z.enum(["REVIEWED", "DRAFT"]).optional(),
    }),
  }),
  async (req, res) => {
    res.json(await questions.listQuestions(currentUser(req), req.valid.params.courseId, req.valid.query));
  },
);

/** Response 201: { question }. Errors: 400 QUESTION_INVALID { errors: [{code}] }, 409 DUPLICATE_QUESTION. */
questionsRouter.post("/courses/:courseId/questions", validate({ params: courseParams, body: questionBody }), async (req, res) => {
  res.status(201).json({ question: await questions.createQuestion(currentUser(req), req.valid.params.courseId, req.valid.body, req) });
});

questionsRouter.get("/courses/:courseId/question-summary", validate({ params: courseParams }), async (req, res) => {
  res.json({ items: await questions.bankSummary(currentUser(req), req.valid.params.courseId) });
});

questionsRouter.get("/courses/:courseId/topics", validate({ params: courseParams }), async (req, res) => {
  res.json({ items: await questions.listTopics(currentUser(req), req.valid.params.courseId) });
});

questionsRouter.post("/courses/:courseId/topics", validate({ params: courseParams, body: z.object({ name: trimmed(100) }) }), async (req, res) => {
  res.status(201).json({ topic: await questions.createTopic(currentUser(req), req.valid.params.courseId, req.valid.body.name) });
});

/** Multipart field "file". Response 201: { batch, rows: [{ row, status, errors }] }. Then POST /api/imports/:id/confirm. */
questionsRouter.post("/courses/:courseId/question-imports", csvUpload, validate({ params: courseParams }), async (req, res) => {
  res.status(201).json(await previewQuestionImport(currentUser(req), req.valid.params.courseId, req.file));
});

questionsRouter.post("/question-images", imageUpload, (req, res) => {
  const name = saveQuestionImage(req.file);
  res.status(201).json({ imagePath: name, imageUrl: `/api/question-images/${name}` });
});

questionsRouter.get("/questions/:id", validate({ params: idParams }), async (req, res) => {
  res.json({ question: await questions.getQuestion(currentUser(req), req.valid.params.id) });
});

/** Response 200: { question, newVersionCreated }. */
questionsRouter.put("/questions/:id", validate({ params: idParams, body: questionBody }), async (req, res) => {
  res.json(await questions.updateQuestion(currentUser(req), req.valid.params.id, req.valid.body, req));
});

questionsRouter.get("/questions/:id/versions/:versionId", validate({ params: z.object({ id: zid, versionId: zid }) }), async (req, res) => {
  res.json({ version: await questions.getVersion(currentUser(req), req.valid.params.id, req.valid.params.versionId) });
});

/** Marks the current version reviewed (POST) or back to draft (DELETE). Response: { question }. */
questionsRouter.post("/questions/:id/review", validate({ params: idParams }), async (req, res) => {
  res.json({ question: await questions.setReviewed(currentUser(req), req.valid.params.id, true, req) });
});
questionsRouter.delete("/questions/:id/review", validate({ params: idParams }), async (req, res) => {
  res.json({ question: await questions.setReviewed(currentUser(req), req.valid.params.id, false, req) });
});

questionsRouter.post("/questions/:id/archive", validate({ params: idParams }), async (req, res) => {
  res.json({ question: await questions.setArchived(currentUser(req), req.valid.params.id, true, req) });
});

questionsRouter.post("/questions/:id/restore", validate({ params: idParams }), async (req, res) => {
  res.json({ question: await questions.setArchived(currentUser(req), req.valid.params.id, false, req) });
});
