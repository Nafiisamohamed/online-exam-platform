/**
 * Messaging service: simulated SMS outbox and in-app notifications.
 *
 * - queueSms() translates an SMS template into the recipient's language and
 *   stores it in sms_outbox as QUEUED. The database also requires bodies to
 *   start with "[DEMO]" and params to contain no password or PIN keys.
 * - notify() stores an in-app notification as template + params; it is
 *   translated when the user reads it, so it follows a language switch.
 * - deliverQueuedSms() is run by the background job: it hands queued messages
 *   to the SMS gateway adapter and records the simulated delivery status.
 */
import { env } from "../config/env.ts";
import { now } from "../db/clock.ts";
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import { renderSms } from "../i18n/messages.ts";
import { smsGateway } from "../adapters/sms-gateway.ts";
import type { Language } from "../generated/prisma/enums.ts";

type Params = Record<string, string | number>;

export interface Recipient {
  id: string;
  phone: string;
  preferredLanguage: Language;
}

/** Writes one SMS to the outbox (status QUEUED). */
export async function queueSms(
  db: Db,
  recipient: Recipient,
  templateKey: string,
  params: Params,
  related?: { type: string; id: string },
): Promise<void> {
  const body = renderSms(templateKey, recipient.preferredLanguage, params);
  await db.smsOutbox.create({
    data: {
      recipientId: recipient.id,
      phone: recipient.phone,
      language: recipient.preferredLanguage,
      templateKey,
      params,
      body,
      senderId: env.SMS_SENDER_ID,
      segments: Math.max(1, Math.ceil(body.length / 160)),
      relatedType: related?.type ?? null,
      relatedId: related?.id ?? null,
    },
  });
}

/** Writes one in-app notification. */
export async function notify(db: Db, userId: string, templateKey: string, params: Params): Promise<void> {
  await db.notification.create({ data: { userId, templateKey, params } });
}

/** Writes notifications for many users at once. */
export async function notifyMany(db: Db, userIds: string[], templateKey: string, params: Params): Promise<void> {
  if (userIds.length === 0) return;
  await db.notification.createMany({ data: userIds.map((userId) => ({ userId, templateKey, params })) });
}

/**
 * Background step: QUEUED -> SENT/FAILED, and SENT (older than 3 seconds) -> DELIVERED.
 * @returns the number of messages that changed status.
 */
export async function deliverQueuedSms(limit = 50): Promise<number> {
  let changed = 0;
  const queued = await prisma.smsOutbox.findMany({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: limit });
  for (const m of queued) {
    const result = await smsGateway.send({ phone: m.phone, body: m.body });
    const at = now();
    const updated = await prisma.smsOutbox.updateMany({
      where: { id: m.id, status: "QUEUED" },
      data: result.status === "SENT"
        ? { status: "SENT", sentAt: at }
        : { status: "FAILED", failureReason: result.failureReason ?? "SEND_FAILED" },
    });
    changed += updated.count;
  }
  const sent = await prisma.smsOutbox.findMany({
    where: { status: "SENT", sentAt: { lt: new Date(now().getTime() - 3000) } },
    take: limit,
  });
  for (const m of sent) {
    if (await smsGateway.delivered({ phone: m.phone })) {
      const updated = await prisma.smsOutbox.updateMany({ where: { id: m.id, status: "SENT" }, data: { status: "DELIVERED", deliveredAt: now() } });
      changed += updated.count;
    }
  }
  return changed;
}
