/**
 * In-app notifications, the simulated SMS outbox and the audit log. See docs/api.md.
 *
 * Notifications (any logged-in user, own only; translated into the user's language when read):
 * GET  /api/notifications                 ?unread=true
 * GET  /api/notifications/unread-count
 * POST /api/notifications/:id/read
 * POST /api/notifications/read-all
 *
 * SMS outbox (ADMIN; messages are simulated and never leave the server):
 * GET  /api/sms-outbox                    ?status, templateKey, recipientId, from, to, page, pageSize
 * GET  /api/sms-outbox/:id
 *
 * Audit log (ADMIN; append-only):
 * GET  /api/audit-logs                    ?actorId, action, entityType, entityId, from, to, page, pageSize
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, pageQuery, validate, zid } from "../../middleware/validate.ts";
import * as messages from "./messages.service.ts";

export const messagesRouter = Router();

messagesRouter.get("/notifications", authenticate(), validate({ query: z.object({ unread: z.enum(["true", "false"]).optional() }) }), async (req, res) => {
  res.json({ items: await messages.listNotifications(currentUser(req), req.valid.query.unread === "true") });
});

messagesRouter.get("/notifications/unread-count", authenticate(), async (req, res) => {
  res.json({ unread: await messages.unreadCount(currentUser(req)) });
});

messagesRouter.post("/notifications/read-all", authenticate(), async (req, res) => {
  res.json({ marked: await messages.markAllRead(currentUser(req)) });
});

messagesRouter.post("/notifications/:id/read", authenticate(), validate({ params: idParams }), async (req, res) => {
  await messages.markRead(currentUser(req), req.valid.params.id);
  res.json({ read: true });
});

const range = { from: z.coerce.date().optional(), to: z.coerce.date().optional() };

messagesRouter.get(
  "/sms-outbox",
  authenticate(),
  requireRole("ADMIN"),
  validate({ query: pageQuery.extend({ status: z.enum(["QUEUED", "SENT", "DELIVERED", "FAILED"]).optional(), templateKey: z.string().max(50).optional(), recipientId: zid.optional(), ...range }) }),
  async (req, res) => {
    res.json(await messages.listSms(req.valid.query));
  },
);

messagesRouter.get("/sms-outbox/:id", authenticate(), requireRole("ADMIN"), validate({ params: idParams }), async (req, res) => {
  res.json({ message: await messages.getSms(req.valid.params.id) });
});

messagesRouter.get(
  "/audit-logs",
  authenticate(),
  requireRole("ADMIN"),
  validate({ query: pageQuery.extend({ actorId: zid.optional(), action: z.string().max(60).optional(), entityType: z.string().max(60).optional(), entityId: zid.optional(), ...range }) }),
  async (req, res) => {
    res.json(await messages.listAudit(req.valid.query));
  },
);
