/**
 * Exam eligibility from the semester fee (Phase 4), calculated only on the server.
 *
 * A student may sit an exam when they have paid at least this share of the semester fee of the
 * course's academic year and semester (their registration gives the faculty):
 *   Quiz 30%, Midterm 50%, Final 100%.
 * Only SUCCESSFUL simulated payments towards that semester fee count.
 *
 * The student is NOT blocked (and the reason is reported) when the rule cannot be applied:
 *   NO_OFFERING   the course has no academic year/semester yet (created before Phase 2);
 *   NOT_REGISTERED the student has no registration for that year and semester;
 *   NO_FEE        no fee is configured for that faculty, year and semester (the registrar is notified).
 */
import { now } from "../db/clock.ts";
import type { Db } from "../db/prisma.ts";
import * as feesRepo from "../repositories/fees.repository.ts";

export const REQUIRED_SHARE = { QUIZ: 0.3, MIDTERM: 0.5, FINAL: 1 } as const;
export type ExamTypeName = keyof typeof REQUIRED_SHARE;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Eligibility {
  eligible: boolean;
  reason: "PAID_ENOUGH" | "NOT_ENOUGH_PAID" | "NO_OFFERING" | "NOT_REGISTERED" | "NO_FEE";
  examType: ExamTypeName;
  requiredPercent: number;
  fee: { id: string; amount: number; currency: string } | null;
  paid: number;
  outstanding: number;
  requiredAmount: number;
  /** How much more must be paid before the exam can be started. */
  stillToPay: number;
}

export async function examEligibility(
  studentId: string,
  exam: { examType: ExamTypeName; course: { academicYearId: string | null; semesterNumber: number | null } },
  db?: Db,
): Promise<Eligibility> {
  const requiredPercent = Math.round(REQUIRED_SHARE[exam.examType] * 100);
  const base = { examType: exam.examType, requiredPercent, fee: null, paid: 0, outstanding: 0, requiredAmount: 0, stillToPay: 0 };
  const { academicYearId, semesterNumber } = exam.course;
  if (!academicYearId || !semesterNumber) return { ...base, eligible: true, reason: "NO_OFFERING" };
  const reg = await feesRepo.findRegistrationFor(studentId, academicYearId, semesterNumber, db);
  if (!reg) return { ...base, eligible: true, reason: "NOT_REGISTERED" };
  const fee = await feesRepo.findGroupFee({ academicYearId, facultyId: reg.facultyId, semesterNumber }, db);
  if (!fee) {
    await notifyMissingFee({ academicYearId, facultyId: reg.facultyId, semesterNumber }, db);
    return { ...base, eligible: true, reason: "NO_FEE" };
  }
  const amount = Number(fee.amount);
  const paid = (await feesRepo.paidTowards(studentId, [fee.id], db)).get(fee.id) ?? 0;
  const requiredAmount = round2(amount * REQUIRED_SHARE[exam.examType]);
  const eligible = paid + 0.005 >= requiredAmount;
  return {
    eligible, reason: eligible ? "PAID_ENOUGH" : "NOT_ENOUGH_PAID", examType: exam.examType, requiredPercent,
    fee: { id: fee.id, amount, currency: fee.currency }, paid: round2(paid), outstanding: round2(Math.max(0, amount - paid)),
    requiredAmount, stillToPay: round2(Math.max(0, requiredAmount - paid)),
  };
}

/** Tells the registrars (once a day per group) that a fee is missing, so students are not blocked silently. */
async function notifyMissingFee(group: { academicYearId: string; facultyId: string; semesterNumber: number }, db?: Db) {
  try {
    const admins = await feesRepo.findActiveAdmins(db);
    const since = new Date(now().getTime() - 24 * 3600_000);
    const params = { academicYearId: group.academicYearId, facultyId: group.facultyId, semester: group.semesterNumber };
    const due = [];
    for (const a of admins) if (!(await feesRepo.findRecentNotification(a.id, "FEE_NOT_CONFIGURED", params, since, db))) due.push(a.id);
    if (due.length) await feesRepo.insertNotifications(due, "FEE_NOT_CONFIGURED", params, db);
  } catch {
    // A notification problem must never stop a student.
  }
}
