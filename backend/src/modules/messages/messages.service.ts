/**
 * In-app notifications, the simulated SMS outbox and the audit log (read side).
 *
 * - Notifications are stored as template + params and translated into the
 *   reader's language here, so they follow a language switch (P10).
 * - The SMS outbox and the audit log are read by the admin only. Both are
 *   written by other services (services/messaging.ts, services/audit.ts).
 */
import { now } from "../../db/clock.ts";
import { renderNotification } from "../../i18n/messages.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { notFound } from "../../lib/errors.ts";
import { paged } from "../../lib/format.ts";
import { listAuditLogs } from "../../repositories/audit.repository.ts";
import * as messagesRepo from "../../repositories/messages.repository.ts";

type DateRange = { from?: Date; to?: Date };
const createdIn = (r: DateRange) => (r.from || r.to ? { createdAt: { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lte: r.to } : {}) } } : {});

/** The user's notifications, newest first, translated. */
export async function listNotifications(user: AuthUser, unreadOnly: boolean) {
  const rows = await messagesRepo.listNotifications(user.id, unreadOnly);
  return rows.map((n) => ({
    id: n.id,
    templateKey: n.templateKey,
    params: n.params,
    ...renderNotification(n.templateKey, user.preferredLanguage, n.params as Record<string, string>),
    readAt: n.readAt,
    createdAt: n.createdAt,
  }));
}

/** Number of the user's unread notifications. */
export function unreadCount(user: AuthUser) {
  return messagesRepo.countUnread(user.id);
}

/** Marks all of the user's notifications read. @returns how many changed. */
export function markAllRead(user: AuthUser) {
  return messagesRepo.markNotificationsRead(user.id, now());
}

/** Marks one of the user's own notifications read. @throws 404 NOTIFICATION_NOT_FOUND */
export async function markRead(user: AuthUser, id: string) {
  if ((await messagesRepo.markNotificationsRead(user.id, now(), id)) !== 1) throw notFound("NOTIFICATION_NOT_FOUND");
}

/** The simulated SMS outbox with filters and counts per status. */
export async function listSms(q: { status?: "QUEUED" | "SENT" | "DELIVERED" | "FAILED"; templateKey?: string; recipientId?: string; page: number; pageSize: number } & DateRange) {
  const where = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.templateKey ? { templateKey: q.templateKey } : {}),
    ...(q.recipientId ? { recipientId: q.recipientId } : {}),
    ...createdIn(q),
  };
  const [rows, total, byStatus] = await messagesRepo.listSms(where, (q.page - 1) * q.pageSize, q.pageSize);
  return { ...paged(rows, total, q.page, q.pageSize), counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])), simulated: true };
}

/** One outbox message. @throws 404 SMS_NOT_FOUND */
export async function getSms(id: string) {
  const m = await messagesRepo.findSms(id);
  if (!m) throw notFound("SMS_NOT_FOUND");
  return m;
}

/** Audit log entries with filters, newest first. */
export async function listAudit(q: { actorId?: string; action?: string; entityType?: string; entityId?: string; page: number; pageSize: number } & DateRange) {
  const where = {
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.action ? { actionCode: q.action } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...createdIn(q),
  };
  const [rows, total] = await listAuditLogs(where, (q.page - 1) * q.pageSize, q.pageSize);
  return paged(rows, total, q.page, q.pageSize);
}
