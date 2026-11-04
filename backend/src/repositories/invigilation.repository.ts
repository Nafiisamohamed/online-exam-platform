/** Invigilation: sessions, live-view data, notes and time extensions. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";

export function findScheduleWithInvigilators(id: string, db: Db = prisma) {
  return db.examSchedule.findUnique({
    where: { id },
    include: { invigilators: true, exam: { select: { id: true, title: true, courseId: true, course: { select: { code: true, name: true } } } } },
  });
}

export function findAttemptWithInvigilators(id: string, db: Db = prisma) {
  return db.examAttempt.findUnique({ where: { id }, include: { schedule: { include: { invigilators: true } }, exam: { select: { title: true } } } });
}

/** Approved sessions, optionally only those assigned to one invigilator. Newest first. */
export function findApprovedSessions(invigilatorId: string | null, db: Db = prisma) {
  return db.examSchedule.findMany({
    where: { status: "APPROVED", ...(invigilatorId ? { invigilators: { some: { invigilatorId } } } : {}) },
    include: { exam: { select: { id: true, title: true, course: { select: { code: true, name: true } } } }, rooms: { include: { room: { select: { name: true } } } }, _count: { select: { attempts: true } } },
    orderBy: { windowStart: "desc" },
    take: 100,
  });
}

/** Everything the live view needs for one session, in parallel. */
export function findLiveViewData(scheduleId: string, courseId: string, db: Db = prisma) {
  return Promise.all([
    db.examAttempt.findMany({
      where: { scheduleId },
      include: { student: { select: { id: true, studentNumber: true, fullName: true } }, _count: { select: { questions: true } } },
    }),
    db.user.findMany({ where: { enrolments: { some: { courseId, status: "ACTIVE" } } }, select: { id: true, studentNumber: true, fullName: true } }),
    db.answer.groupBy({
      by: ["attemptId"],
      where: { attempt: { scheduleId }, OR: [{ selectedOptionId: { not: null } }, { textAnswer: { not: null } }] },
      _count: { _all: true },
    }),
    db.focusEvent.findMany({ where: { attempt: { scheduleId, status: "IN_PROGRESS" }, returnedAt: null }, select: { attemptId: true, lostAt: true } }),
    db.invigilatorNote.groupBy({ by: ["studentId"], where: { scheduleId }, _count: { _all: true } }),
  ]);
}

export function findFocusEvents(attemptId: string, db: Db = prisma) {
  return db.focusEvent.findMany({ where: { attemptId }, orderBy: { lostAt: "asc" } });
}

/** True when the student is enrolled in the course or has an attempt in the session. */
export async function isStudentInSession(studentId: string, courseId: string, scheduleId: string, db: Db = prisma) {
  return (await db.user.count({ where: { id: studentId, OR: [{ enrolments: { some: { courseId } } }, { attempts: { some: { scheduleId } } }] } })) > 0;
}

export function insertNote(data: { scheduleId: string; studentId: string | null; authorId: string; text: string }, db: Db = prisma) {
  return db.invigilatorNote.create({ data });
}

export function findNotes(scheduleId: string, db: Db = prisma) {
  return db.invigilatorNote.findMany({
    where: { scheduleId },
    include: { author: { select: { id: true, fullName: true } }, student: { select: { id: true, studentNumber: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Locks the attempt (FOR UPDATE) and returns its status, extension total and base deadline. */
export async function lockAttemptForExtension(attemptId: string, db: Db) {
  const [row] = await db.$queryRaw<{ status: string; total: number; base_ms: number }[]>`
    SELECT status::text, total_extension_minutes AS total, (extract(epoch FROM base_deadline) * 1000)::float8 AS base_ms
      FROM exam_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
  return { status: row.status, total: Number(row.total), baseDeadline: new Date(Number(row.base_ms)) };
}

/** Saves the new extension total and deadline, and the extension record. */
export async function applyExtension(attemptId: string, grantedById: string, minutes: number, reason: string, totalMinutes: number, deadline: Date, db: Db = prisma) {
  await db.examAttempt.update({ where: { id: attemptId }, data: { totalExtensionMinutes: totalMinutes, deadline } });
  return db.timeExtension.create({ data: { attemptId, grantedById, minutes, reason } });
}
