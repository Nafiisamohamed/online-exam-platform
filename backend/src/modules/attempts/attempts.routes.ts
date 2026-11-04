/**
 * Student exam-taking endpoints (STUDENT only, own attempts only). See docs/api.md#taking-an-exam.
 *
 * GET  /api/my/exams                                   exams I can see, with window, fee and attempt state
 * POST /api/exams/:examId/attempts                     start, or resume the existing attempt
 * GET  /api/attempts/:id                               reload: same questions, saved answers, remaining time
 * PUT  /api/attempts/:id/questions/:questionId/answer  save immediately { selectedOptionId } or { textAnswer }
 * PUT  /api/attempts/:id/questions/:questionId/flag    { flagged }
 * POST /api/attempts/:id/heartbeat                     keep-alive + fresh timing (every ~5 s)
 * POST /api/attempts/:id/focus-events                  { clientEventId, type: "LOST" | "RETURNED" }
 * POST /api/attempts/:id/submit                        submit (safe to repeat)
 *
 * Late saves: 409 ATTEMPT_DEADLINE_PASSED. After submission: 409 ATTEMPT_ALREADY_SUBMITTED.
 */
import { Router } from "express";
import { z } from "zod";
import { registerJob } from "../../jobs/scheduler.ts";
import { clientIp } from "../../lib/network.ts";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, validate, zid } from "../../middleware/validate.ts";
import { autoSubmitExpired } from "../../services/submission.ts";
import * as attempts from "./attempts.service.ts";

// P6: the background job submits attempts at their deadline, even for disconnected students.
registerJob({ name: "auto-submit", run: () => autoSubmitExpired() });

export const attemptsRouter = Router();

const student = [authenticate(), requireRole("STUDENT")];
const questionParams = z.object({ id: zid, questionId: zid });

attemptsRouter.get("/my/exams", ...student, async (req, res) => {
  res.json({ items: await attempts.listMyExams(currentUser(req)) });
});

/** Response 201 { resumed: false, attempt } for a new attempt, 200 { resumed: true, attempt } when resuming. */
attemptsRouter.post("/exams/:examId/attempts", ...student, validate({ params: z.object({ examId: zid }) }), async (req, res) => {
  const result = await attempts.startAttempt(currentUser(req), req.valid.params.examId, clientIp(req));
  res.status(result.resumed ? 200 : 201).json(result);
});

attemptsRouter.get("/attempts/:id", ...student, validate({ params: idParams }), async (req, res) => {
  res.json({ attempt: await attempts.getAttempt(currentUser(req), req.valid.params.id) });
});

attemptsRouter.put(
  "/attempts/:id/questions/:questionId/answer",
  ...student,
  validate({ params: questionParams, body: z.object({ selectedOptionId: zid.nullable().optional(), textAnswer: z.string().max(20_000).nullable().optional() }) }),
  async (req, res) => {
    res.json(await attempts.saveAnswer(currentUser(req), req.valid.params.id, req.valid.params.questionId, req.valid.body));
  },
);

attemptsRouter.put(
  "/attempts/:id/questions/:questionId/flag",
  ...student,
  validate({ params: questionParams, body: z.object({ flagged: z.boolean() }) }),
  async (req, res) => {
    res.json(await attempts.setFlag(currentUser(req), req.valid.params.id, req.valid.params.questionId, req.valid.body.flagged));
  },
);

attemptsRouter.post("/attempts/:id/heartbeat", ...student, validate({ params: idParams }), async (req, res) => {
  res.json(await attempts.heartbeat(currentUser(req), req.valid.params.id));
});

attemptsRouter.post(
  "/attempts/:id/focus-events",
  ...student,
  validate({ params: idParams, body: z.object({ clientEventId: zid, type: z.enum(["LOST", "RETURNED"]) }) }),
  async (req, res) => {
    res.json(await attempts.recordFocusEvent(currentUser(req), req.valid.params.id, req.valid.body.clientEventId, req.valid.body.type));
  },
);

attemptsRouter.post("/attempts/:id/submit", ...student, validate({ params: idParams }), async (req, res) => {
  res.json({ attempt: await attempts.submit(currentUser(req), req.valid.params.id) });
});
