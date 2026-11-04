/**
 * Simulated exam-fee payments (section 7, D1). No real money and no real
 * provider: the mobile-money adapter (adapters/mobile-money.ts) is simulated.
 *
 * Flow (enforced here and by the payments database triggers):
 *   create  -> PENDING_CONFIRMATION   amount, currency and recipient copied from the exam/settings,
 *                                     never taken from the browser; expires after 5 minutes
 *   confirm -> PENDING_PIN (Yes) | CANCELLED (No)
 *   pin     -> SUCCESS (correct demo PIN, receipt number, SMS) | wrong PIN (+1 attempt)
 *              | FAILED (third wrong PIN)
 *   cancel  -> CANCELLED (while confirming or entering the PIN)
 *   5 min   -> EXPIRED (background job, or the next request that touches it)
 * All four outcomes are final.
 *
 * Duplicates (P7): the browser sends an idempotency key, so a resent request
 * returns the same payment; a student has at most one open and one successful
 * payment per exam (partial unique indexes); the PIN check locks the row.
 * Ownership: a student only ever sees their own payments (404 otherwise).
 * The demo PIN is never stored, logged or returned.
 */
import type { Request } from "express";
import { env } from "../../config/env.ts";
import { now } from "../../db/clock.ts";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { transaction } from "../../db/prisma.ts";
import { findEnrolment } from "../../repositories/courses.repository.ts";
import { findExam } from "../../repositories/exams.repository.ts";
import * as paymentsRepo from "../../repositories/payments.repository.ts";
import type { PaymentProvider, PaymentStatus } from "../../generated/prisma/enums.ts";
import { formatDateTime, LABELS, PROVIDER_NAMES } from "../../i18n/messages.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { num, num0 } from "../../lib/format.ts";
import { buildPdf } from "../../lib/pdf.ts";
import { makeReceiptNumber, mobileMoneyFor, randomCode } from "../../adapters/mobile-money.ts";
import { audit } from "../../services/audit.ts";
import { notify, queueSms } from "../../services/messaging.ts";

export const MAX_PIN_ATTEMPTS = 3;
const OPEN = ["PENDING_CONFIRMATION", "PENDING_PIN"] as const;

type PaymentRow = NonNullable<Awaited<ReturnType<typeof find>>>;
const find = (id: string) => paymentsRepo.findPayment(id);

/** Public shape of a payment. Never contains a PIN. */
export function serializePayment(p: PaymentRow) {
  const open = (OPEN as readonly string[]).includes(p.status);
  return {
    id: p.id,
    exam: p.exam,
    provider: p.provider,
    providerName: PROVIDER_NAMES[p.provider],
    phone: p.phone,
    amount: num(p.amount),
    currency: p.currency,
    status: p.status,
    merchantName: p.merchantName,
    merchantNumber: p.merchantNumber,
    pinAttemptsLeft: MAX_PIN_ATTEMPTS - p.pinAttempts,
    failureReason: p.failureReason,
    receiptNumber: p.receiptNumber,
    expiresAt: p.expiresAt,
    secondsUntilExpiry: open ? Math.max(0, Math.ceil((p.expiresAt.getTime() - now().getTime()) / 1000)) : 0,
    createdAt: p.createdAt,
    confirmedAt: p.confirmedAt,
    completedAt: p.completedAt,
    isSimulated: p.isSimulated,
  };
}

/** Marks an open payment EXPIRED once its 5 minutes are over. Returns true when it did. */
async function expireIfDue(p: { id: string; status: string; expiresAt: Date }): Promise<boolean> {
  if (!(OPEN as readonly string[]).includes(p.status) || now() < p.expiresAt) return false;
  try {
    return (await paymentsRepo.updatePaymentIfStatus(p.id, [...OPEN], { status: "EXPIRED", completedAt: now() })) === 1;
  } catch {
    return false; // the database clock has not quite reached expires_at yet
  }
}

/** Loads the student's own payment (expiring it first if due), or 404. */
async function ownPayment(user: AuthUser, id: string) {
  const p = await find(id);
  if (!p || p.studentId !== user.id) throw notFound("PAYMENT_NOT_FOUND");
  if (await expireIfDue(p)) return (await find(id))!;
  return p;
}

/**
 * Starts a payment for an exam fee (or returns the same payment for a resent request).
 * @returns { payment, reused }
 * @throws 400 EXAM_HAS_NO_FEE, 403 NOT_ENROLLED, 409 PAYMENT_ALREADY_PAID, 409 IDEMPOTENCY_KEY_REUSED
 */
export async function createPayment(user: AuthUser, input: { examId: string; provider: PaymentProvider; phone: string; idempotencyKey: string }, req: Request) {
  const byKey = await paymentsRepo.findPaymentByKey(input.idempotencyKey);
  if (byKey) {
    if (byKey.studentId !== user.id || byKey.examId !== input.examId) throw conflict("IDEMPOTENCY_KEY_REUSED", "Use a new request key for a new payment");
    return { payment: serializePayment(await ownPayment(user, byKey.id)), reused: true };
  }
  const exam = await findExam(input.examId);
  if (!exam || exam.status !== "PUBLISHED") throw notFound("EXAM_NOT_FOUND");
  const enrolment = await findEnrolment(user.id, exam.courseId);
  if (enrolment?.status !== "ACTIVE") throw notFound("EXAM_NOT_FOUND");
  if (num0(exam.feeAmount) <= 0) throw badRequest("EXAM_HAS_NO_FEE", "This exam is free");
  if (await paymentsRepo.findSuccessfulPayment(user.id, exam.id)) {
    throw conflict("PAYMENT_ALREADY_PAID", "This exam fee is already paid");
  }
  const open = await paymentsRepo.findOpenPayment(user.id, exam.id);
  if (open && !(await expireIfDue(open))) return { payment: serializePayment(await ownPayment(user, open.id)), reused: true };

  try {
    const id = await transaction(async (tx) => {
      const p = await paymentsRepo.insertPayment(
        {
          studentId: user.id, examId: exam.id, provider: input.provider, phone: input.phone,
          amount: exam.feeAmount, currency: exam.feeCurrency,
          merchantName: env.PAYMENT_MERCHANT_NAME, merchantNumber: env.PAYMENT_MERCHANT_NUMBER,
          idempotencyKey: input.idempotencyKey, mockReference: `MOCK-REQ-${randomCode(8)}`,
        },
        tx,
      );
      await audit(tx, { actorId: user.id, action: "PAYMENT_STARTED", entityType: "payment", entityId: p.id, details: { examId: exam.id, provider: input.provider, simulated: true }, req });
      return p.id;
    });
    return { payment: serializePayment((await find(id))!), reused: false };
  } catch (error) {
    // A parallel request created the open payment first: return that one.
    if (isUniqueViolation(error)) {
      const again = await paymentsRepo.findOpenPayment(user.id, exam.id);
      if (again) return { payment: serializePayment((await find(again.id))!), reused: true };
    }
    throw error;
  }
}

/** The Yes / No step of the simulated phone prompt. */
export async function confirmPayment(user: AuthUser, id: string, accept: boolean, req: Request) {
  const p = await ownPayment(user, id);
  if (p.status === "EXPIRED") throw conflict("PAYMENT_EXPIRED", "The payment expired; start a new one");
  if (p.status !== "PENDING_CONFIRMATION") throw conflict("PAYMENT_NOT_AWAITING_CONFIRMATION", "This payment is not waiting for confirmation");
  await transaction(async (tx) => {
    const n = await paymentsRepo.updatePaymentIfStatus(id, ["PENDING_CONFIRMATION"], accept ? { status: "PENDING_PIN", confirmedAt: now() } : { status: "CANCELLED", completedAt: now() }, tx);
    if (n !== 1) throw conflict("PAYMENT_NOT_AWAITING_CONFIRMATION", "This payment is not waiting for confirmation");
    await audit(tx, { actorId: user.id, action: accept ? "PAYMENT_CONFIRMED" : "PAYMENT_CANCELLED", entityType: "payment", entityId: id, req });
  });
  return serializePayment((await find(id))!);
}

/**
 * Checks the demo PIN (server side only).
 * @returns { result: "SUCCESS" | "WRONG_PIN" | "FAILED", payment }
 * @throws 409 PAYMENT_NOT_CONFIRMED, 409 PAYMENT_EXPIRED, 409 PAYMENT_NOT_AWAITING_PIN
 */
export async function submitPin(user: AuthUser, id: string, pin: string, req: Request) {
  const p = await ownPayment(user, id);
  if (p.status === "EXPIRED") throw conflict("PAYMENT_EXPIRED", "The payment expired; start a new one");
  if (p.status === "PENDING_CONFIRMATION") throw conflict("PAYMENT_NOT_CONFIRMED", "Confirm the payment first");
  if (p.status !== "PENDING_PIN") throw conflict("PAYMENT_NOT_AWAITING_PIN", "This payment is not waiting for a PIN");

  const adapter = mobileMoneyFor(p.provider);
  const auth = await adapter.authorize(pin);
  const result = await transaction(async (tx) => {
    // Lock the payment: two PIN submissions at once are handled one after the other.
    const row = await paymentsRepo.lockPayment(id, tx);
    if (row.status !== "PENDING_PIN") throw conflict("PAYMENT_NOT_AWAITING_PIN", "This payment is not waiting for a PIN");
    const t = now();
    if (auth.ok) {
      const receiptNumber = makeReceiptNumber(adapter, t);
      await paymentsRepo.updatePayment(id, { status: "SUCCESS", receiptNumber, mockReference: auth.reference, completedAt: t }, tx);
      const student = await paymentsRepo.findPayer(user.id, tx);
      // The SMS goes to the paying phone number, in the student's language.
      await queueSms(tx, { ...student, phone: p.phone }, "PAYMENT_SUCCESS", {
        amount: `${num0(p.amount).toFixed(2)} ${p.currency}`, merchant: p.merchantName, merchantNumber: p.merchantNumber, receipt: receiptNumber,
      }, { type: "payment", id });
      await notify(tx, user.id, "PAYMENT_SUCCESS", { receipt: receiptNumber, exam: p.exam.title });
      await audit(tx, { actorId: user.id, action: "PAYMENT_SUCCEEDED", entityType: "payment", entityId: id, details: { receiptNumber, simulated: true }, req });
      return "SUCCESS" as const;
    }
    const attempts = row.pinAttempts + 1;
    const failed = attempts >= MAX_PIN_ATTEMPTS;
    await paymentsRepo.updatePayment(id, failed ? { pinAttempts: attempts, status: "FAILED", failureReason: "PIN_ATTEMPTS_EXCEEDED", completedAt: t } : { pinAttempts: attempts }, tx);
    await audit(tx, { actorId: user.id, action: failed ? "PAYMENT_FAILED" : "PAYMENT_WRONG_PIN", entityType: "payment", entityId: id, details: { attempts }, req });
    return failed ? ("FAILED" as const) : ("WRONG_PIN" as const);
  });
  return { result, payment: serializePayment((await find(id))!) };
}

/** Cancels an open payment (at the Yes/No step or during PIN entry). */
export async function cancelPayment(user: AuthUser, id: string, req: Request) {
  const p = await ownPayment(user, id);
  if (!(OPEN as readonly string[]).includes(p.status)) throw conflict("PAYMENT_NOT_OPEN", "Only open payments can be cancelled");
  await transaction(async (tx) => {
    const n = await paymentsRepo.updatePaymentIfStatus(id, [...OPEN], { status: "CANCELLED", completedAt: now() }, tx);
    if (n !== 1) throw conflict("PAYMENT_NOT_OPEN", "Only open payments can be cancelled");
    await audit(tx, { actorId: user.id, action: "PAYMENT_CANCELLED", entityType: "payment", entityId: id, req });
  });
  return serializePayment((await find(id))!);
}

/** One payment: the admin sees any, a student only their own. @throws 404 PAYMENT_NOT_FOUND */
export async function getPayment(user: AuthUser, id: string) {
  if (user.role === "ADMIN") {
    const p = await find(id);
    if (!p) throw notFound("PAYMENT_NOT_FOUND");
    await expireIfDue(p);
    return serializePayment((await find(id))!);
  }
  return serializePayment(await ownPayment(user, id));
}

/** Student: own payments. Admin: all, with filters. */
export async function listPayments(user: AuthUser, q: { examId?: string; status?: PaymentStatus; provider?: PaymentProvider }) {
  const rows = await paymentsRepo.listPayments({
    ...(user.role === "ADMIN" ? {} : { studentId: user.id }),
    ...(q.examId ? { examId: q.examId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.provider ? { provider: q.provider } : {}),
  });
  return rows.map((p) => ({ ...serializePayment(p), ...(user.role === "ADMIN" ? { student: p.student } : {}) }));
}

/** Background job step: expires open payments whose 5 minutes are over. */
export async function expireDuePayments(): Promise<number> {
  // One second of margin, so the database clock has certainly passed expires_at.
  const due = await paymentsRepo.findDuePayments(new Date(now().getTime() - 1000));
  let n = 0;
  for (const p of due) if (await expireIfDue(p)) n++;
  return n;
}

/** Receipt PDF of a successful payment, in the user's language, watermarked DEMO. */
export async function receiptPdf(user: AuthUser, id: string, lang: "so" | "en") {
  const p = user.role === "ADMIN" ? await find(id) : await ownPayment(user, id);
  if (!p || p.status !== "SUCCESS") throw notFound("RECEIPT_NOT_FOUND");
  const student = await paymentsRepo.findPayer(p.studentId);
  const L = LABELS[lang];
  const pdf = await buildPdf({
    title: L.receiptTitle,
    demoBanner: L.demoWatermark,
    rows: [
      [L.receiptNumber, p.receiptNumber!],
      [L.date, formatDateTime(p.completedAt!, env.APP_TIMEZONE)],
      [L.student, student.fullName],
      [L.studentNumber, student.studentNumber ?? ""],
      [L.exam, `${p.exam.course.code} - ${p.exam.title}`],
      [L.provider, `${PROVIDER_NAMES[p.provider]} (DEMO)`],
      [L.phone, p.phone],
      [L.amount, `${num0(p.amount).toFixed(2)} ${p.currency}`],
      [L.merchant, `${p.merchantName} (${p.merchantNumber})`],
      [L.status, L.statusSuccess],
    ],
    footer: L.demoWatermark,
  });
  return { pdf, filename: `receipt-${p.receiptNumber}.pdf` };
}
