/**
 * SMS Management (Phase 6, registrar only).
 *
 * - Templates: named Somali + English texts with a category (upcoming exam, schedule approval,
 *   payment reminder, payment confirmation, published results, revised results, general).
 *   They are switched off, never deleted. {name} and {username} are filled in per recipient.
 * - Group messages: pick roles (students, lecturers, invigilators), narrow them by faculty,
 *   academic year, semester or course, and/or pick people one by one. Each recipient gets a
 *   simulated SMS in their own language (SIMULATED: nothing leaves the system) and the same text
 *   as an in-app notification.
 * - Retry: a FAILED message can be queued again (for example after the phone number was fixed).
 */
import type { Request } from "express";
import { env } from "../../config/env.ts";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { transaction } from "../../db/prisma.ts";
import type { SmsTemplateCategory } from "../../generated/prisma/enums.ts";
import { renderSms } from "../../i18n/messages.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import * as messagesRepo from "../../repositories/messages.repository.ts";
import * as smsRepo from "../../repositories/sms.repository.ts";
import type { RecipientFilter } from "../../repositories/sms.repository.ts";
import { audit } from "../../services/audit.ts";

/** The most people one group message may reach. */
export const MAX_RECIPIENTS = 2000;

type TemplateRow = NonNullable<Awaited<ReturnType<typeof smsRepo.findTemplate>>>;
function toTemplate(t: TemplateRow) {
  return { id: t.id, name: t.name, category: t.category, bodySo: t.bodySo, bodyEn: t.bodyEn, isActive: t.isActive, createdBy: t.createdBy, updatedBy: t.updatedBy, createdAt: t.createdAt, updatedAt: t.updatedAt };
}

export async function listTemplates(active?: boolean) {
  return { items: (await smsRepo.listTemplates(active)).map(toTemplate) };
}

/** @throws 409 SMS_TEMPLATE_EXISTS */
export async function createTemplate(data: { name: string; category: SmsTemplateCategory; bodySo: string; bodyEn: string }, actorId: string, req: Request) {
  try {
    return await transaction(async (tx) => {
      const t = await smsRepo.insertTemplate({ ...data, createdById: actorId, updatedById: actorId }, tx);
      await audit(tx, { actorId, action: "SMS_TEMPLATE_CREATED", entityType: "sms_template", entityId: t.id, details: { name: t.name, category: t.category }, req });
      return toTemplate(t);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("SMS_TEMPLATE_EXISTS", "A template with this name already exists");
    throw error;
  }
}

/** Changes a template (audited with the previous texts). @throws 404 SMS_TEMPLATE_NOT_FOUND, 409 SMS_TEMPLATE_EXISTS */
export async function updateTemplate(id: string, data: Partial<{ name: string; category: SmsTemplateCategory; bodySo: string; bodyEn: string; isActive: boolean }>, actorId: string, req: Request) {
  const before = await smsRepo.findTemplate(id);
  if (!before) throw notFound("SMS_TEMPLATE_NOT_FOUND");
  try {
    return await transaction(async (tx) => {
      const t = await smsRepo.updateTemplate(id, { ...data, updatedById: actorId }, tx);
      const changed = Object.fromEntries(Object.keys(data).map((k) => [k, (before as Record<string, unknown>)[k]]));
      await audit(tx, { actorId, action: "SMS_TEMPLATE_UPDATED", entityType: "sms_template", entityId: id, details: { name: t.name, previous: changed, now: data }, req });
      return toTemplate(t);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("SMS_TEMPLATE_EXISTS", "A template with this name already exists");
    throw error;
  }
}

/** Fills in {name} and {username}; anything else in braces stays as written. */
export function fillPlaceholders(text: string, user: { fullName: string; username: string }) {
  return text.replace(/\{\s*name\s*\}/gi, user.fullName).replace(/\{\s*username\s*\}/gi, user.username);
}

function validFilter(f: RecipientFilter) {
  if (f.roles.length === 0 && !f.userIds?.length) throw badRequest("NO_RECIPIENTS_CHOSEN", "Choose at least one role or person");
}

/** Who a group message would reach: the total, how many have no phone number, and the first 50 names. */
export async function previewRecipients(f: RecipientFilter) {
  validFilter(f);
  const people = await smsRepo.findRecipients(f, MAX_RECIPIENTS + 1);
  return {
    total: Math.min(people.length, MAX_RECIPIENTS),
    tooMany: people.length > MAX_RECIPIENTS,
    max: MAX_RECIPIENTS,
    withoutPhone: people.filter((p) => !p.phone?.trim()).length,
    byRole: people.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.role.name]: (acc[p.role.name] ?? 0) + 1 }), {}),
    sample: people.slice(0, 50).map((p) => ({ id: p.id, fullName: p.fullName, username: p.username, role: p.role.name, phone: p.phone })),
  };
}

/**
 * Sends one group message: a simulated SMS (in the recipient's language) to everyone with a phone
 * number, and an in-app notification to everyone.
 * @throws 400 NO_RECIPIENTS_CHOSEN, TOO_MANY_RECIPIENTS, NO_RECIPIENTS, SMS_TEXT_REQUIRED; 404 SMS_TEMPLATE_NOT_FOUND
 */
export async function sendGroupMessage(
  input: RecipientFilter & { templateId?: string; bodySo?: string; bodyEn?: string; sendSms: boolean; sendNotification: boolean },
  actorId: string,
  req: Request,
) {
  validFilter(input);
  let bodySo = input.bodySo?.trim();
  let bodyEn = input.bodyEn?.trim();
  let template: TemplateRow | null = null;
  if (input.templateId) {
    template = await smsRepo.findTemplate(input.templateId);
    if (!template || !template.isActive) throw notFound("SMS_TEMPLATE_NOT_FOUND");
    bodySo ||= template.bodySo;
    bodyEn ||= template.bodyEn;
  }
  if (!bodySo || !bodyEn) throw badRequest("SMS_TEXT_REQUIRED", "Write the message in Somali and in English");
  if (!input.sendSms && !input.sendNotification) throw badRequest("NO_CHANNEL_CHOSEN", "Choose SMS, in-app notification or both");
  const people = await smsRepo.findRecipients(input, MAX_RECIPIENTS + 1);
  if (people.length > MAX_RECIPIENTS) throw badRequest("TOO_MANY_RECIPIENTS", `At most ${MAX_RECIPIENTS} people per message`, { max: MAX_RECIPIENTS });
  if (people.length === 0) throw badRequest("NO_RECIPIENTS", "Nobody matches these choices");

  const withPhone = input.sendSms ? people.filter((p) => p.phone?.trim()) : [];
  const templateKey = "CUSTOM_MESSAGE";
  const related = template ? { relatedType: "sms_template", relatedId: template.id } : { relatedType: null, relatedId: null };
  await transaction(async (tx) => {
    if (withPhone.length) {
      await messagesRepo.insertSmsMany(
        withPhone.map((p) => {
          const text = fillPlaceholders(p.preferredLanguage === "en" ? bodyEn : bodySo, p);
          const body = renderSms(templateKey, p.preferredLanguage, { text });
          return { recipientId: p.id, phone: p.phone, language: p.preferredLanguage, templateKey, params: { text }, body, senderId: env.SMS_SENDER_ID, segments: Math.max(1, Math.ceil(body.length / 160)), ...related };
        }),
        tx,
      );
    }
    if (input.sendNotification) {
      await messagesRepo.insertNotifications(people.map((p) => ({ userId: p.id, templateKey, params: { textSo: fillPlaceholders(bodySo, p), textEn: fillPlaceholders(bodyEn, p) } })), tx);
    }
    await audit(tx, {
      actorId, action: "SMS_GROUP_SENT", entityType: template ? "sms_template" : "sms", entityId: template?.id,
      details: { template: template?.name, roles: input.roles, facultyId: input.facultyId, academicYearId: input.academicYearId, semester: input.semesterNumber, courseId: input.courseId, people: people.length, sms: withPhone.length, notifications: input.sendNotification ? people.length : 0 },
      req,
    });
  });
  return { recipients: people.length, sms: withPhone.length, notifications: input.sendNotification ? people.length : 0, withoutPhone: input.sendSms ? people.length - withPhone.length : 0, simulated: true };
}

/** Queues a FAILED message again. @throws 404 SMS_NOT_FOUND, 409 SMS_NOT_FAILED */
export async function retrySms(id: string, actorId: string, req: Request) {
  const m = await messagesRepo.findSms(id);
  if (!m) throw notFound("SMS_NOT_FOUND");
  return transaction(async (tx) => {
    const changed = await messagesRepo.updateSmsIfStatus(id, "FAILED", { status: "QUEUED", failureReason: null, sentAt: null, deliveredAt: null }, tx);
    if (changed !== 1) throw conflict("SMS_NOT_FAILED", "Only a failed message can be retried");
    await audit(tx, { actorId, action: "SMS_RETRIED", entityType: "sms", entityId: id, details: { previousFailure: m.failureReason, recipient: m.recipient.fullName }, req });
    return { id, status: "QUEUED" as const };
  });
}
