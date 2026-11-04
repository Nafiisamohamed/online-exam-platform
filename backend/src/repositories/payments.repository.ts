/** Simulated payments. Status changes are also checked by the payments database triggers. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { PaymentStatus } from "../generated/prisma/enums.ts";

const paymentInclude = { exam: { select: { id: true, title: true, course: { select: { code: true, name: true } } } } };

export function findSuccessfulPayment(studentId: string, examId: string, db: Db = prisma) {
  return db.payment.findFirst({ where: { studentId, examId, status: "SUCCESS" } });
}

export function findOpenPayment(studentId: string, examId: string, db: Db = prisma) {
  return db.payment.findFirst({ where: { studentId, examId, status: { in: ["PENDING_CONFIRMATION", "PENDING_PIN"] } } });
}

/** A payment with its exam and course. */
export function findPayment(id: string, db: Db = prisma) {
  return db.payment.findUnique({ where: { id }, include: paymentInclude });
}

export function findPaymentByKey(idempotencyKey: string, db: Db = prisma) {
  return db.payment.findUnique({ where: { idempotencyKey } });
}

export function insertPayment(data: Prisma.PaymentUncheckedCreateInput, db: Db = prisma) {
  return db.payment.create({ data });
}

/** Changes the payment only if its status is one of `from`. @returns rows changed (0 or 1). */
export async function updatePaymentIfStatus(id: string, from: PaymentStatus[], data: Prisma.PaymentUpdateManyMutationInput, db: Db = prisma) {
  return (await db.payment.updateMany({ where: { id, status: { in: from } }, data })).count;
}

export function updatePayment(id: string, data: Prisma.PaymentUpdateInput, db: Db = prisma) {
  return db.payment.update({ where: { id }, data });
}

/** Locks the payment row (FOR UPDATE) and returns its status and PIN attempts. */
export async function lockPayment(id: string, db: Db) {
  const [row] = await db.$queryRaw<{ status: string; pin_attempts: number }[]>`
    SELECT status::text, pin_attempts FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
  return { status: row.status, pinAttempts: Number(row.pin_attempts) };
}

export function listPayments(where: Prisma.PaymentWhereInput, db: Db = prisma) {
  return db.payment.findMany({
    where,
    include: { ...paymentInclude, student: { select: { id: true, studentNumber: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

/** Open payments whose expiry time is before `before`. */
export function findDuePayments(before: Date, db: Db = prisma) {
  return db.payment.findMany({
    where: { status: { in: ["PENDING_CONFIRMATION", "PENDING_PIN"] }, expiresAt: { lt: before } },
    select: { id: true, status: true, expiresAt: true },
    take: 100,
  });
}

/** Name and number of the paying student (for the receipt). */
export function findPayer(studentId: string, db: Db = prisma) {
  return db.user.findUniqueOrThrow({ where: { id: studentId }, select: { id: true, fullName: true, studentNumber: true, phone: true, preferredLanguage: true } });
}
