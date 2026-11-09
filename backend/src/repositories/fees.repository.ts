/** Semester fees and the payments made towards them (Phase 4). */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";

const feeInclude = {
  academicYear: { select: { id: true, name: true, isCurrent: true } },
  faculty: { select: { id: true, code: true, name: true } },
} as const;

export function listFees(where: Prisma.SemesterFeeWhereInput, db: Db = prisma) {
  return db.semesterFee.findMany({ where, include: feeInclude, orderBy: [{ academicYear: { name: "desc" } }, { faculty: { code: "asc" } }, { semesterNumber: "asc" }] });
}

export function findFee(id: string, db: Db = prisma) {
  return db.semesterFee.findUnique({ where: { id }, include: feeInclude });
}

/** The fee of one group (academic year, faculty, semester), if configured. */
export function findGroupFee(g: { academicYearId: string; facultyId: string; semesterNumber: number }, db: Db = prisma) {
  return db.semesterFee.findUnique({ where: { academicYearId_facultyId_semesterNumber: g }, include: feeInclude });
}

export function insertFee(data: { academicYearId: string; facultyId: string; semesterNumber: number; amount: number; currency: string }, db: Db = prisma) {
  return db.semesterFee.create({ data, include: feeInclude });
}

export function updateFee(id: string, data: { amount?: number; currency?: string }, db: Db = prisma) {
  return db.semesterFee.update({ where: { id }, data, include: feeInclude });
}

/** Sum of a student's successful payments towards each of these fees. */
export async function paidTowards(studentId: string, feeIds: string[], db: Db = prisma) {
  if (!feeIds.length) return new Map<string, number>();
  const rows = await db.payment.groupBy({ by: ["semesterFeeId"], where: { studentId, semesterFeeId: { in: feeIds }, status: "SUCCESS" }, _sum: { amount: true } });
  return new Map(rows.map((r) => [r.semesterFeeId!, Number(r._sum.amount ?? 0)]));
}

/** Sum of successful payments per (student, fee) for many students at once. */
export async function paidByStudentAndFee(studentIds: string[], feeIds: string[], db: Db = prisma) {
  if (!studentIds.length || !feeIds.length) return new Map<string, number>();
  const rows = await db.payment.groupBy({ by: ["studentId", "semesterFeeId"], where: { studentId: { in: studentIds }, semesterFeeId: { in: feeIds }, status: "SUCCESS" }, _sum: { amount: true } });
  return new Map(rows.map((r) => [`${r.studentId}|${r.semesterFeeId}`, Number(r._sum.amount ?? 0)]));
}

/** A student's semester-fee payments (newest first), and the historical exam-fee payments. */
export function listStudentPayments(studentId: string, db: Db = prisma) {
  return db.payment.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, status: true, amount: true, currency: true, provider: true, receiptNumber: true, createdAt: true, completedAt: true, semesterFeeId: true,
      exam: { select: { title: true, course: { select: { code: true } } } },
    },
  });
}

/** All registrations of an academic year (with student) for the registrar's fee status. */
export function listYearRegistrations(where: Prisma.StudentRegistrationWhereInput, db: Db = prisma) {
  return db.studentRegistration.findMany({
    where,
    include: {
      student: { select: { id: true, fullName: true, username: true, studentNumber: true, phone: true, preferredLanguage: true, isActive: true } },
      faculty: { select: { id: true, code: true, name: true } },
      academicYear: { select: { id: true, name: true } },
    },
    orderBy: [{ faculty: { code: "asc" } }, { semesterNumber: "asc" }, { student: { fullName: "asc" } }],
  });
}

/** The registration that matches a course offering (academic year and semester), if any. */
export function findRegistrationFor(studentId: string, academicYearId: string, semesterNumber: number, db: Db = prisma) {
  return db.studentRegistration.findUnique({ where: { studentId_academicYearId_semesterNumber: { studentId, academicYearId, semesterNumber } } });
}

/** Admin ids, for notifications about missing fee configuration. */
export function findActiveAdmins(db: Db = prisma) {
  return db.user.findMany({ where: { role: { name: "ADMIN" }, isActive: true }, select: { id: true } });
}

/** Whether an in-app notification with this template and parameters was already sent to the user recently. */
export function findRecentNotification(userId: string, templateKey: string, params: Prisma.InputJsonValue, since: Date, db: Db = prisma) {
  return db.notification.findFirst({ where: { userId, templateKey, params: { equals: params }, createdAt: { gte: since } } });
}

/** In-app notifications for several users (template + parameters; rendered when read). */
export function insertNotifications(userIds: string[], templateKey: string, params: Prisma.InputJsonValue, db: Db = prisma) {
  return db.notification.createMany({ data: userIds.map((userId) => ({ userId, templateKey, params })) });
}
