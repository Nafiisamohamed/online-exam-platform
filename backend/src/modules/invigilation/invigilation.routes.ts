/**
 * Invigilation endpoints. See docs/api.md#invigilation.
 *
 * GET  /api/invigilation/sessions                         INVIGILATOR (assigned), ADMIN (all)
 * GET  /api/invigilation/sessions/:id/live                live student list (poll every ~5 s)
 * GET  /api/invigilation/sessions/:id/notes               notes of the session
 * POST /api/invigilation/sessions/:id/notes               INVIGILATOR { text, studentId? }
 * GET  /api/invigilation/attempts/:id/focus-events        focus-loss log of one attempt
 * POST /api/invigilation/attempts/:id/extensions          INVIGILATOR { minutes: 1-15, reason }
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, trimmed, validate, zid } from "../../middleware/validate.ts";
import * as inv from "./invigilation.service.ts";

export const invigilationRouter = Router();

invigilationRouter.use(authenticate(), requireRole("INVIGILATOR", "ADMIN"));

invigilationRouter.get("/sessions", async (req, res) => {
  res.json({ items: await inv.mySessions(currentUser(req)) });
});

invigilationRouter.get("/sessions/:id/live", validate({ params: idParams }), async (req, res) => {
  res.json(await inv.liveView(currentUser(req), req.valid.params.id));
});

invigilationRouter.get("/sessions/:id/notes", validate({ params: idParams }), async (req, res) => {
  res.json({ items: await inv.listNotes(currentUser(req), req.valid.params.id) });
});

invigilationRouter.post(
  "/sessions/:id/notes",
  requireRole("INVIGILATOR"),
  validate({ params: idParams, body: z.object({ text: trimmed(2000), studentId: zid.optional() }) }),
  async (req, res) => {
    res.status(201).json({ note: await inv.addNote(currentUser(req), req.valid.params.id, req.valid.body.text, req.valid.body.studentId, req) });
  },
);

invigilationRouter.get("/attempts/:id/focus-events", validate({ params: idParams }), async (req, res) => {
  res.json({ items: await inv.focusEvents(currentUser(req), req.valid.params.id) });
});

/** Response 201: { extension, totalExtensionMinutes, deadline }. Errors: 409 EXTENSION_LIMIT_EXCEEDED, 409 ATTEMPT_NOT_IN_PROGRESS. */
invigilationRouter.post(
  "/attempts/:id/extensions",
  requireRole("INVIGILATOR"),
  validate({ params: idParams, body: z.object({ minutes: z.number().int().min(1).max(15), reason: trimmed(500) }) }),
  async (req, res) => {
    res.status(201).json(await inv.grantExtension(currentUser(req), req.valid.params.id, req.valid.body.minutes, req.valid.body.reason, req));
  },
);
