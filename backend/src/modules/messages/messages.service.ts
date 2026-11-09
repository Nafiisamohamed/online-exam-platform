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
import type { Request } from "express";
import { findAuditLogsForExport, listAuditLogs } from "../../repositories/audit.repository.ts";
import { ACTIVITY_CSV_HEADER, AUDIT_ACTION_LABELS, ENTITY_LABELS, ROLE_LABELS, SYSTEM_ACTOR } from "../../i18n/audit-actions.ts";
import { formatDateTime } from "../../i18n/messages.ts";
import { toCsv } from "../../lib/uploads.ts";
import type { Language, RoleName } from "../../generated/prisma/enums.ts";
import { audit } from "../../services/audit.ts";
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

/** Activity History filters: person (id, or a search in name, username and email), their role, action, record and dates. */
export type AuditFilter = { actorId?: string; search?: string; role?: RoleName; action?: string; entityType?: string; entityId?: string } & DateRange;

function auditWhere(q: AuditFilter) {
  const actor = [
    ...(q.role ? [{ role: { name: q.role } }] : []),
    ...(q.search
      ? [{
          OR: [
            { fullName: { contains: q.search, mode: "insensitive" as const } },
            { username: { contains: q.search, mode: "insensitive" as const } },
            { email: { contains: q.search, mode: "insensitive" as const } },
          ],
        }]
      : []),
  ];
  return {
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(actor.length ? { actor: { AND: actor } } : {}),
    ...(q.action ? { actionCode: q.action } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...createdIn(q),
  };
}

/** Audit log entries with filters, newest first. */
export async function listAudit(q: AuditFilter & { page: number; pageSize: number }) {
  const [rows, total] = await listAuditLogs(auditWhere(q), (q.page - 1) * q.pageSize, q.pageSize);
  return paged(rows, total, q.page, q.pageSize);
}

/** Most entries one export may contain (newest first). */
export const AUDIT_EXPORT_LIMIT = 5000;

/**
 * Activity History as CSV in the chosen language: headings, role names and action names are
 * translated; times are Mogadishu time. The export itself is recorded in the audit log.
 */
export async function auditCsv(q: AuditFilter, lang: Language, actorId: string, req: Request) {
  const rows = await findAuditLogsForExport(auditWhere(q), AUDIT_EXPORT_LIMIT);
  const csv = toCsv(ACTIVITY_CSV_HEADER[lang], rows.map((r) => [
    formatDateTime(r.createdAt, "Africa/Mogadishu"),
    r.actor?.fullName ?? SYSTEM_ACTOR[lang],
    r.actor?.username ?? "",
    r.actor ? ROLE_LABELS[lang][r.actor.role.name] : "",
    AUDIT_ACTION_LABELS[lang][r.actionCode] ?? r.actionCode,
    ENTITY_LABELS[lang][r.entityType] ?? r.entityType,
    r.entityId ?? "",
  ]));
  await audit(null, { actorId, action: "AUDIT_EXPORTED", entityType: "audit_log", entityId: null, details: { rows: rows.length, lang }, req });
  const [d, m, y] = formatDateTime(now(), "Africa/Mogadishu").slice(0, 10).split("/");
  return { filename: `${lang === "so" ? "taariikhda-hawlaha" : "activity-history"}-${y}-${m}-${d}.csv`, csv };
}
