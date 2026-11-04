/** SMS outbox (simulated) and in-app notifications. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";

const recipient = { select: { id: true, fullName: true, studentNumber: true } };

export function insertSms(data: Prisma.SmsOutboxUncheckedCreateInput, db: Db = prisma) {
  return db.smsOutbox.create({ data });
}

export function findSmsByStatus(status: "QUEUED" | "SENT", take: number, sentBefore?: Date, db: Db = prisma) {
  return db.smsOutbox.findMany({
    where: { status, ...(sentBefore ? { sentAt: { lt: sentBefore } } : {}) },
    orderBy: { createdAt: "asc" },
    take,
  });
}

/** Changes a message only if it still has the expected status. @returns rows changed (0 or 1). */
export async function updateSmsIfStatus(id: string, status: "QUEUED" | "SENT", data: Prisma.SmsOutboxUpdateManyMutationInput, db: Db = prisma) {
  return (await db.smsOutbox.updateMany({ where: { id, status }, data })).count;
}

export function listSms(where: Prisma.SmsOutboxWhereInput, skip: number, take: number, db: Db = prisma) {
  return Promise.all([
    db.smsOutbox.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { recipient } }),
    db.smsOutbox.count({ where }),
    db.smsOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
}

export function findSms(id: string, db: Db = prisma) {
  return db.smsOutbox.findUnique({ where: { id }, include: { recipient } });
}

export function insertNotification(data: Prisma.NotificationUncheckedCreateInput, db: Db = prisma) {
  return db.notification.create({ data });
}

export function insertNotifications(data: Prisma.NotificationCreateManyInput[], db: Db = prisma) {
  return db.notification.createMany({ data });
}

export function listNotifications(userId: string, unreadOnly: boolean, db: Db = prisma) {
  return db.notification.findMany({ where: { userId, ...(unreadOnly ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
}

export function countUnread(userId: string, db: Db = prisma) {
  return db.notification.count({ where: { userId, readAt: null } });
}

/** Marks the user's notifications read (one, or all unread). @returns rows changed. */
export async function markNotificationsRead(userId: string, at: Date, id?: string, db: Db = prisma) {
  return (await db.notification.updateMany({ where: { userId, ...(id ? { id } : { readAt: null }) }, data: { readAt: at } })).count;
}
