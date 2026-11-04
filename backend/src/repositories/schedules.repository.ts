/** Exam schedules, rooms and invigilator assignments. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";

const scheduleInclude = {
  exam: { select: { id: true, title: true, status: true, course: { select: { id: true, code: true, name: true, lecturerId: true } } } },
  requestedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
  rooms: { include: { room: { select: { id: true, name: true, building: true, networkRanges: true } } } },
  invigilators: { include: { invigilator: { select: { id: true, fullName: true } } } },
};

/** The exam's approved schedule with its rooms (for the network check). */
export function findApprovedSchedule(examId: string, db: Db = prisma) {
  return db.examSchedule.findFirst({ where: { examId, status: "APPROVED" }, include: { rooms: { include: { room: true } } } });
}

/** A schedule with its exam, people, rooms and invigilators. */
export function findScheduleDetail(id: string, db: Db = prisma) {
  return db.examSchedule.findUnique({ where: { id }, include: scheduleInclude });
}

export function listSchedules(where: Prisma.ExamScheduleWhereInput, db: Db = prisma) {
  return db.examSchedule.findMany({ where, include: scheduleInclude, orderBy: { windowStart: "asc" } });
}

/** The exam's REQUESTED or APPROVED schedule, if any. */
export function findOpenSchedule(examId: string, db: Db = prisma) {
  return db.examSchedule.findFirst({ where: { examId, status: { in: ["REQUESTED", "APPROVED"] } } });
}

export function insertSchedule(
  s: { examId: string; requestedById: string; windowStart: Date; windowEnd: Date; durationMinutes: number; roomIds: string[]; invigilatorIds: string[] },
  db: Db = prisma,
) {
  return db.examSchedule.create({
    data: {
      examId: s.examId, requestedById: s.requestedById, windowStart: s.windowStart, windowEnd: s.windowEnd, durationMinutes: s.durationMinutes,
      rooms: { create: s.roomIds.map((roomId) => ({ roomId })) },
      invigilators: { create: s.invigilatorIds.map((invigilatorId) => ({ invigilatorId })) },
    },
  });
}

export function findScheduleWithExam(id: string, db: Db = prisma) {
  return db.examSchedule.findUniqueOrThrow({ where: { id }, include: { exam: { include: { course: true } } } });
}

export function updateSchedule(id: string, data: Prisma.ExamScheduleUncheckedUpdateInput, db: Db = prisma) {
  return db.examSchedule.update({ where: { id }, data });
}

/** Changes the schedule only if it still has `status`. @returns rows changed. */
export async function updateScheduleIfStatus(id: string, status: "REQUESTED", data: Prisma.ExamScheduleUncheckedUpdateManyInput, db: Db = prisma) {
  return (await db.examSchedule.updateMany({ where: { id, status }, data })).count;
}

export function countAttemptsOfSchedule(scheduleId: string, db: Db = prisma) {
  return db.examAttempt.count({ where: { scheduleId } });
}

type ClashRow = { id: string; title: string; n: bigint };

/**
 * Approved schedules overlapping this one that share at least one actively
 * enrolled student, room or invigilator.
 */
export async function findScheduleClashes(scheduleId: string, db: Db = prisma) {
  const students = await db.$queryRaw<ClashRow[]>`
    SELECT o.id, oe.title, count(DISTINCT mine.student_id) AS n
      FROM exam_schedules s
      JOIN exams e ON e.id = s.exam_id
      JOIN enrolments mine ON mine.course_id = e.course_id AND mine.status = 'ACTIVE'
      JOIN enrolments theirs ON theirs.student_id = mine.student_id AND theirs.status = 'ACTIVE'
      JOIN exams oe ON oe.course_id = theirs.course_id
      JOIN exam_schedules o ON o.exam_id = oe.id
     WHERE s.id = ${scheduleId}::uuid AND o.id <> s.id AND o.status = 'APPROVED'
       AND o.window_start < s.window_end AND o.window_end > s.window_start
     GROUP BY o.id, oe.title`;
  const rooms = await db.$queryRaw<ClashRow[]>`
    SELECT o.id, oe.title, count(DISTINCT sr.room_id) AS n
      FROM exam_schedules s
      JOIN schedule_rooms sr ON sr.schedule_id = s.id
      JOIN schedule_rooms osr ON osr.room_id = sr.room_id
      JOIN exam_schedules o ON o.id = osr.schedule_id
      JOIN exams oe ON oe.id = o.exam_id
     WHERE s.id = ${scheduleId}::uuid AND o.id <> s.id AND o.status = 'APPROVED'
       AND o.window_start < s.window_end AND o.window_end > s.window_start
     GROUP BY o.id, oe.title`;
  const invigilators = await db.$queryRaw<ClashRow[]>`
    SELECT o.id, oe.title, count(DISTINCT si.invigilator_id) AS n
      FROM exam_schedules s
      JOIN schedule_invigilators si ON si.schedule_id = s.id
      JOIN schedule_invigilators osi ON osi.invigilator_id = si.invigilator_id
      JOIN exam_schedules o ON o.id = osi.schedule_id
      JOIN exams oe ON oe.id = o.exam_id
     WHERE s.id = ${scheduleId}::uuid AND o.id <> s.id AND o.status = 'APPROVED'
       AND o.window_start < s.window_end AND o.window_end > s.window_start
     GROUP BY o.id, oe.title`;
  return { students, rooms, invigilators };
}

// --- Rooms --------------------------------------------------------------------------

export function listRooms(db: Db = prisma) {
  return db.room.findMany({ orderBy: { name: "asc" } });
}

export function findRoom(id: string, db: Db = prisma) {
  return db.room.findUnique({ where: { id } });
}

export function countRooms(ids: string[], db: Db = prisma) {
  return db.room.count({ where: { id: { in: ids } } });
}

export function insertRoom(data: { name: string; building: string; networkRanges: string[] }, db: Db = prisma) {
  return db.room.create({ data });
}

export function updateRoom(id: string, data: { name?: string; building?: string; networkRanges?: string[] }, db: Db = prisma) {
  return db.room.update({ where: { id }, data });
}
