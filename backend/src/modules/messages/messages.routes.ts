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
 * GET  /api/audit-logs                    ?actorId, search, role, action, entityType, entityId, from, to, page, pageSize
 * GET  /api/audit-logs.csv?lang=so|en     ADMIN: the same filters as a CSV in the chosen language
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

const auditFilters = {
  actorId: zid.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["ADMIN", "LECTURER", "STUDENT", "INVIGILATOR"]).optional(),
  action: z.string().max(60).optional(),
  entityType: z.string().max(60).optional(),
  entityId: zid.optional(),
  ...range,
};

messagesRouter.get(
  "/audit-logs",
  authenticate(),
  requireRole("ADMIN"),
  validate({ query: pageQuery.extend(auditFilters) }),
  async (req, res) => {
    res.json(await messages.listAudit(req.valid.query));
  },
);

/** Response: CSV file (newest first, at most AUDIT_EXPORT_LIMIT rows) in ?lang (default: the registrar's language). */
messagesRouter.get(
  "/audit-logs.csv",
  authenticate(),
  requireRole("ADMIN"),
  validate({ query: z.object({ ...auditFilters, lang: z.enum(["so", "en"]).optional() }) }),
  async (req, res) => {
    const user = currentUser(req);
    const { lang, ...filters } = req.valid.query;
    const { filename, csv } = await messages.auditCsv(filters, lang ?? user.preferredLanguage, user.id, req);
    res.type("text/csv").attachment(filename).send(csv);
  },
);
