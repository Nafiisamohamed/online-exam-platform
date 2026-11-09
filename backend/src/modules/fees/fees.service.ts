/**
 * Semester fees (Phase 4).
 *
 * - The registrar sets the fee of each faculty, academic year and semester (1-8). No amount is
 *   invented: nothing exists until the registrar adds it.
 * - A student sees, for each of their registrations, the fee, what they paid (successful
 *   simulated payments only), the outstanding balance and their payment history.
 * - The registrar sees who has paid in full, in part or not at all, can filter, and can send
 *   simulated SMS + in-app payment reminders.
 * - Historical exam-fee payments stay as they are and are shown as history.
 */
import type { Request } from "express";
import { env } from "../../config/env.ts";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { transaction } from "../../db/prisma.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { paged } from "../../lib/format.ts";
import { findAcademicYear } from "../../repositories/academic.repository.ts";
import { findFaculty } from "../../repositories/courses.repository.ts";
import * as feesRepo from "../../repositories/fees.repository.ts";
import { audit } from "../../services/audit.ts";
import { notifyMany, queueSms } from "../../services/messaging.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;
type FeeRow = NonNullable<Awaited<ReturnType<typeof feesRepo.findFee>>>;
const toFee = (f: FeeRow) => ({ ...f, amount: Number(f.amount) });

export async function listFees(q: { academicYearId?: string; facultyId?: string }) {
  return (await feesRepo.listFees({ ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}), ...(q.facultyId ? { facultyId: q.facultyId } : {}) })).map(toFee);
}

/** @throws 400 ACADEMIC_YEAR_NOT_FOUND / FACULTY_NOT_FOUND / CURRENCY_NOT_SUPPORTED, 409 FEE_EXISTS */
export async function createFee(data: { academicYearId: string; facultyId: string; semesterNumber: number; amount: number; currency?: string }, actorId: string, req: Request) {
  if (!(await findAcademicYear(data.academicYearId))) throw badRequest("ACADEMIC_YEAR_NOT_FOUND", "Academic year not found");
  if (!(await findFaculty(data.facultyId))) throw badRequest("FACULTY_NOT_FOUND", "Faculty not found");
  const currency = data.currency ?? env.DEFAULT_CURRENCY;
  if (!env.SUPPORTED_CURRENCIES.includes(currency)) throw badRequest("CURRENCY_NOT_SUPPORTED", "Choose a supported currency", { supported: env.SUPPORTED_CURRENCIES });
  try {
    return await transaction(async (tx) => {
      const f = await feesRepo.insertFee({ ...data, currency }, tx);
      await audit(tx, { actorId, action: "SEMESTER_FEE_CREATED", entityType: "semester_fee", entityId: f.id, details: { year: f.academicYear.name, faculty: f.faculty.code, semester: f.semesterNumber, amount: data.amount, currency }, req });
      return toFee(f);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("FEE_EXISTS", "This faculty, year and semester already has a fee; edit it instead");
    throw error;
  }
}

/** Changes the amount or currency (audited with the previous values). @throws 404 FEE_NOT_FOUND */
export async function updateFee(id: string, data: { amount?: number; currency?: string }, actorId: string, req: Request) {
  const before = await feesRepo.findFee(id);
  if (!before) throw notFound("FEE_NOT_FOUND");
  if (data.currency && !env.SUPPORTED_CURRENCIES.includes(data.currency)) throw badRequest("CURRENCY_NOT_SUPPORTED", "Choose a supported currency", { supported: env.SUPPORTED_CURRENCIES });
  return transaction(async (tx) => {
    const f = await feesRepo.updateFee(id, data, tx);
    await audit(tx, { actorId, action: "SEMESTER_FEE_UPDATED", entityType: "semester_fee", entityId: id, details: { previous: { amount: Number(before.amount), currency: before.currency }, now: { amount: Number(f.amount), currency: f.currency } }, req });
    return toFee(f);
  });
}

type Status = "PAID" | "PARTIAL" | "UNPAID" | "NO_FEE";

/** One row per registration of the year: fee, paid, outstanding and status. */
async function feeRows(q: { academicYearId: string; facultyId?: string; semesterNumber?: number; search?: string }) {
  const regs = await feesRepo.listYearRegistrations({
    academicYearId: q.academicYearId,
    ...(q.facultyId ? { facultyId: q.facultyId } : {}),
    ...(q.semesterNumber ? { semesterNumber: q.semesterNumber } : {}),
    ...(q.search ? { student: { OR: [{ fullName: { contains: q.search, mode: "insensitive" as const } }, { username: { contains: q.search, mode: "insensitive" as const } }] } } : {}),
  });
  const fees = await feesRepo.listFees({ academicYearId: q.academicYearId });
  const feeOf = new Map(fees.map((f) => [`${f.facultyId}|${f.semesterNumber}`, f]));
  const paid = await feesRepo.paidByStudentAndFee([...new Set(regs.map((r) => r.studentId))], fees.map((f) => f.id));
  return regs.map((r) => {
    const fee = feeOf.get(`${r.facultyId}|${r.semesterNumber}`);
    if (!fee) return { registrationId: r.id, student: r.student, faculty: r.faculty, academicYear: r.academicYear, semesterNumber: r.semesterNumber, fee: null, paid: 0, outstanding: 0, status: "NO_FEE" as Status };
    const amount = Number(fee.amount);
    const p = round2(paid.get(`${r.studentId}|${fee.id}`) ?? 0);
    const status: Status = p + 0.005 >= amount ? "PAID" : p > 0 ? "PARTIAL" : "UNPAID";
    return { registrationId: r.id, student: r.student, faculty: r.faculty, academicYear: r.academicYear, semesterNumber: r.semesterNumber, fee: { id: fee.id, amount, currency: fee.currency }, paid: p, outstanding: round2(Math.max(0, amount - p)), status };
  });
}

/** Registrar: who has paid in full, in part, not at all (or has no fee configured), with totals. */
export async function feeStatus(q: { academicYearId: string; facultyId?: string; semesterNumber?: number; status?: Status; search?: string; page: number; pageSize: number }) {
  const all = await feeRows(q);
  const counts = { PAID: 0, PARTIAL: 0, UNPAID: 0, NO_FEE: 0 } as Record<Status, number>;
  for (const r of all) counts[r.status]++;
  const rows = q.status ? all.filter((r) => r.status === q.status) : all;
  const missing = [...new Map(all.filter((r) => r.status === "NO_FEE").map((r) => [`${r.faculty.id}|${r.semesterNumber}`, { faculty: r.faculty, semesterNumber: r.semesterNumber }])).values()];
  const start = (q.page - 1) * q.pageSize;
  return { ...paged(rows.slice(start, start + q.pageSize), rows.length, q.page, q.pageSize), counts, missingFees: missing };
}

/**
 * Sends a simulated SMS and an in-app reminder to every student of the filter who still owes
 * money (UNPAID or PARTIAL). Returns how many were reminded.
 */
export async function sendReminders(q: { academicYearId: string; facultyId?: string; semesterNumber?: number; studentIds?: string[] }, actorId: string, req: Request) {
  const rows = (await feeRows(q)).filter((r) => (r.status === "UNPAID" || r.status === "PARTIAL") && r.student.isActive && (!q.studentIds || q.studentIds.includes(r.student.id)));
  await transaction(async (tx) => {
    for (const r of rows) {
      const params = { year: r.academicYear.name, semester: r.semesterNumber, amount: `${r.outstanding.toFixed(2)} ${r.fee!.currency}` };
      await queueSms(tx, { id: r.student.id, phone: r.student.phone, preferredLanguage: r.student.preferredLanguage }, "PAYMENT_REMINDER", params, { type: "semester_fee", id: r.fee!.id });
      await notifyMany(tx, [r.student.id], "PAYMENT_REMINDER", params);
    }
    await audit(tx, { actorId, action: "PAYMENT_REMINDERS_SENT", entityType: "academic_year", entityId: q.academicYearId, details: { students: rows.length, facultyId: q.facultyId, semester: q.semesterNumber }, req });
  });
  return { reminded: rows.length };
}

/**
 * The student's fees: one entry per registration (newest year first) with the fee, paid,
 * outstanding and percentage paid, plus all their payments (semester fees and historical exam fees).
 */
export async function myFees(user: AuthUser) {
  const regs = await feesRepo.listYearRegistrations({ studentId: user.id });
  const entries = [];
  const feeIds: string[] = [];
  for (const r of regs) {
    const fee = await feesRepo.findGroupFee({ academicYearId: r.academicYearId, facultyId: r.facultyId, semesterNumber: r.semesterNumber });
    if (fee) feeIds.push(fee.id);
    entries.push({ r, fee });
  }
  const paid = await feesRepo.paidTowards(user.id, feeIds);
  const payments = await feesRepo.listStudentPayments(user.id);
  return {
    semesters: entries
      .sort((a, b) => b.r.academicYear.name.localeCompare(a.r.academicYear.name) || b.r.semesterNumber - a.r.semesterNumber)
      .map(({ r, fee }) => {
        const amount = fee ? Number(fee.amount) : 0;
        const p = fee ? round2(paid.get(fee.id) ?? 0) : 0;
        return {
          academicYear: r.academicYear, faculty: r.faculty, semesterNumber: r.semesterNumber,
          fee: fee ? { id: fee.id, amount, currency: fee.currency } : null,
          paid: p, outstanding: fee ? round2(Math.max(0, amount - p)) : 0, percentPaid: fee ? Math.min(100, Math.round((p / amount) * 100)) : 0,
        };
      }),
    payments: payments.map((p) => ({
      id: p.id, status: p.status, amount: Number(p.amount), currency: p.currency, provider: p.provider, receiptNumber: p.receiptNumber,
      createdAt: p.createdAt, completedAt: p.completedAt, kind: p.semesterFeeId ? "SEMESTER_FEE" as const : "EXAM_FEE" as const,
      semesterFeeId: p.semesterFeeId, exam: p.exam ? { title: p.exam.title, course: p.exam.course.code } : null,
    })),
  };
}

/**
 * Checks a semester-fee payment request: the fee exists, belongs to one of the student's
 * registrations, and the amount (2 decimals) is positive and at most the outstanding balance.
 * @throws 404 FEE_NOT_FOUND, 400 AMOUNT_INVALID, 409 FEE_ALREADY_PAID, 409 AMOUNT_EXCEEDS_BALANCE { outstanding }
 */
export async function checkFeePayment(studentId: string, semesterFeeId: string, amount: number) {
  const fee = await feesRepo.findFee(semesterFeeId);
  if (!fee) throw notFound("FEE_NOT_FOUND");
  const reg = await feesRepo.findRegistrationFor(studentId, fee.academicYearId, fee.semesterNumber);
  if (!reg || reg.facultyId !== fee.facultyId) throw notFound("FEE_NOT_FOUND");
  if (!(amount > 0) || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) throw badRequest("AMOUNT_INVALID", "Enter an amount above zero with at most 2 decimals");
  const paid = (await feesRepo.paidTowards(studentId, [fee.id])).get(fee.id) ?? 0;
  const outstanding = round2(Number(fee.amount) - paid);
  if (outstanding <= 0) throw conflict("FEE_ALREADY_PAID", "This semester fee is already paid in full");
  if (amount > outstanding + 0.005) throw conflict("AMOUNT_EXCEEDS_BALANCE", "The amount is more than the outstanding balance", { outstanding });
  return { fee, currency: fee.currency };
}
