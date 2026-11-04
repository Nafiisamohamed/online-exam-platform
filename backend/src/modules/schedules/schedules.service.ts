/**
 * Examination scheduling (section 4.5): the lecturer requests, the admin approves.
 *
 * A schedule has a window (e.g. 09:00-11:00), a duration (e.g. 60 minutes),
 * allowed rooms (their network ranges limit where students can start) and
 * assigned invigilators. Students may start at any time inside the window and
 * must finish by the window's end.
 *
 * Approval blocks conflicts with other APPROVED schedules whose windows overlap:
 * - STUDENT: any student actively enrolled in both exams' courses (two exams
 *   of the same student must never overlap);
 * - ROOM: the same room;
 * - INVIGILATOR: the same invigilator.
 * Approvals run one at a time (a transaction-level advisory lock), so two
 * admins cannot approve clashing schedules at the same moment.
 * Approval sends the SCHEDULE_APPROVED SMS and notification to the enrolled students.
 */
import type { Request } from "express";
import { env } from "../../config/env.ts";
import { now } from "../../db/clock.ts";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { prisma, transaction } from "../../db/prisma.ts";
import type { ScheduleStatus } from "../../generated/prisma/enums.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { formatDateTime } from "../../i18n/messages.ts";
import { audit } from "../../services/audit.ts";
import { notifyMany, queueSms } from "../../services/messaging.ts";

export interface ScheduleInput {
  windowStart: Date;
  windowEnd: Date;
  durationMinutes: number;
  roomIds: string[];
  invigilatorIds: string[];
}

const scheduleInclude = {
  exam: { select: { id: true, title: true, status: true, course: { select: { id: true, code: true, name: true, lecturerId: true } } } },
  requestedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
  rooms: { include: { room: { select: { id: true, name: true, building: true, networkRanges: true } } } },
  invigilators: { include: { invigilator: { select: { id: true, fullName: true } } } },
};

type ScheduleRow = NonNullable<Awaited<ReturnType<typeof load>>>;
function load(id: string) {
  return prisma.examSchedule.findUnique({ where: { id }, include: scheduleInclude });
}

function serialize(s: ScheduleRow) {
  const { lecturerId: _l, ...course } = s.exam.course;
  return {
    id: s.id,
    status: s.status,
    exam: { id: s.exam.id, title: s.exam.title, status: s.exam.status, course },
    windowStart: s.windowStart,
    windowEnd: s.windowEnd,
    durationMinutes: s.durationMinutes,
    rejectionReason: s.rejectionReason,
    requestedBy: s.requestedBy,
    decidedBy: s.decidedBy,
    decidedAt: s.decidedAt,
    createdAt: s.createdAt,
    rooms: s.rooms.map((r) => r.room),
    invigilators: s.invigilators.map((i) => i.invigilator),
  };
}

async function checkInput(input: ScheduleInput) {
  if (input.windowEnd <= input.windowStart) throw badRequest("WINDOW_INVALID", "The window must end after it starts");
  if (input.windowStart.getTime() + input.durationMinutes * 60_000 > input.windowEnd.getTime()) {
    throw badRequest("DURATION_LONGER_THAN_WINDOW", "The duration must fit inside the window");
  }
  if (input.windowStart <= now()) throw badRequest("WINDOW_IN_PAST", "The window must start in the future");
  if (input.roomIds.length) {
    const rooms = await prisma.room.count({ where: { id: { in: input.roomIds } } });
    if (rooms !== input.roomIds.length) throw badRequest("ROOM_NOT_FOUND", "A room was not found");
  }
  if (input.invigilatorIds.length) {
    const ok = await prisma.user.count({ where: { id: { in: input.invigilatorIds }, isActive: true, role: { name: "INVIGILATOR" } } });
    if (ok !== input.invigilatorIds.length) throw badRequest("INVIGILATOR_INVALID", "Choose active invigilators");
  }
}

/**
 * Lecturer requests a schedule for their exam.
 * @throws 409 SCHEDULE_ALREADY_REQUESTED / SCHEDULE_ALREADY_APPROVED
 */
export async function requestSchedule(user: AuthUser, examId: string, input: ScheduleInput, req: Request) {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { course: true } });
  if (!exam || exam.course.lecturerId !== user.id) throw notFound("EXAM_NOT_FOUND");
  await checkInput(input);
  const open = await prisma.examSchedule.findFirst({ where: { examId, status: { in: ["REQUESTED", "APPROVED"] } } });
  if (open) throw conflict(open.status === "APPROVED" ? "SCHEDULE_ALREADY_APPROVED" : "SCHEDULE_ALREADY_REQUESTED", "This exam already has an open schedule");
  const id = await transaction(async (tx) => {
    const s = await tx.examSchedule.create({
      data: {
        examId, requestedById: user.id, windowStart: input.windowStart, windowEnd: input.windowEnd, durationMinutes: input.durationMinutes,
        rooms: { create: [...new Set(input.roomIds)].map((roomId) => ({ roomId })) },
        invigilators: { create: [...new Set(input.invigilatorIds)].map((invigilatorId) => ({ invigilatorId })) },
      },
    });
    await audit(tx, { actorId: user.id, action: "SCHEDULE_REQUESTED", entityType: "exam_schedule", entityId: s.id, details: { examId }, req });
    return s.id;
  });
  return serialize((await load(id))!);
}

/** Admin: all schedules. Lecturer: their exams. Invigilator: approved sessions assigned to them. */
export async function listSchedules(user: AuthUser, q: { status?: ScheduleStatus; from?: Date; to?: Date }) {
  const scope =
    user.role === "ADMIN" ? {} :
    user.role === "LECTURER" ? { exam: { course: { lecturerId: user.id } } } :
    user.role === "INVIGILATOR" ? { invigilators: { some: { invigilatorId: user.id } }, status: "APPROVED" as const } :
    { id: "00000000-0000-0000-0000-000000000000" };
  const rows = await prisma.examSchedule.findMany({
    where: {
      ...scope,
      ...(q.status && user.role !== "INVIGILATOR" ? { status: q.status } : {}),
      ...(q.from ? { windowEnd: { gte: q.from } } : {}),
      ...(q.to ? { windowStart: { lte: q.to } } : {}),
    },
    include: scheduleInclude,
    orderBy: { windowStart: "asc" },
  });
  return rows.map(serialize);
}

/** One schedule for the admin, its lecturer or an assigned invigilator. @throws 404 SCHEDULE_NOT_FOUND */
export async function getSchedule(user: AuthUser, id: string) {
  const s = await load(id);
  const ok =
    s &&
    (user.role === "ADMIN" ||
      (user.role === "LECTURER" && s.exam.course.lecturerId === user.id) ||
      (user.role === "INVIGILATOR" && s.invigilators.some((i) => i.invigilator.id === user.id)));
  if (!ok) throw notFound("SCHEDULE_NOT_FOUND");
  return serialize(s!);
}

export interface Conflict {
  type: "STUDENT" | "ROOM" | "INVIGILATOR";
  scheduleId: string;
  examTitle: string;
  count: number;
}

/** Approved schedules that clash with this one (see the module comment). */
export async function findConflicts(db: Parameters<Parameters<typeof transaction>[0]>[0] | typeof prisma, scheduleId: string): Promise<Conflict[]> {
  const students = await db.$queryRaw<{ id: string; title: string; n: bigint }[]>`
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
  const rooms = await db.$queryRaw<{ id: string; title: string; n: bigint }[]>`
    SELECT o.id, oe.title, count(DISTINCT sr.room_id) AS n
      FROM exam_schedules s
      JOIN schedule_rooms sr ON sr.schedule_id = s.id
      JOIN schedule_rooms osr ON osr.room_id = sr.room_id
      JOIN exam_schedules o ON o.id = osr.schedule_id
      JOIN exams oe ON oe.id = o.exam_id
     WHERE s.id = ${scheduleId}::uuid AND o.id <> s.id AND o.status = 'APPROVED'
       AND o.window_start < s.window_end AND o.window_end > s.window_start
     GROUP BY o.id, oe.title`;
  const invigilators = await db.$queryRaw<{ id: string; title: string; n: bigint }[]>`
    SELECT o.id, oe.title, count(DISTINCT si.invigilator_id) AS n
      FROM exam_schedules s
      JOIN schedule_invigilators si ON si.schedule_id = s.id
      JOIN schedule_invigilators osi ON osi.invigilator_id = si.invigilator_id
      JOIN exam_schedules o ON o.id = osi.schedule_id
      JOIN exams oe ON oe.id = o.exam_id
     WHERE s.id = ${scheduleId}::uuid AND o.id <> s.id AND o.status = 'APPROVED'
       AND o.window_start < s.window_end AND o.window_end > s.window_start
     GROUP BY o.id, oe.title`;
  const map = (type: Conflict["type"]) => (r: { id: string; title: string; n: bigint }) => ({ type, scheduleId: r.id, examTitle: r.title, count: Number(r.n) });
  return [...students.map(map("STUDENT")), ...rooms.map(map("ROOM")), ...invigilators.map(map("INVIGILATOR"))];
}

/** "12/11/2026" and "09:00–11:00" in the campus time zone, for messages. */
export function windowText(start: Date, end: Date) {
  const [date, from] = formatDateTime(start, env.APP_TIMEZONE).split(" ");
  const to = formatDateTime(end, env.APP_TIMEZONE).split(" ")[1];
  return { date, window: `${from}–${to}` };
}

/**
 * Admin approves a REQUESTED schedule.
 * @throws 409 SCHEDULE_NOT_REQUESTED, 409 EXAM_NOT_PUBLISHED, 400 WINDOW_IN_PAST, 409 SCHEDULE_CONFLICT { conflicts }
 */
export async function approveSchedule(user: AuthUser, id: string, req: Request) {
  const s = await load(id);
  if (!s) throw notFound("SCHEDULE_NOT_FOUND");
  try {
    await transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('exam_schedule_approval'))`;
      const current = await tx.examSchedule.findUniqueOrThrow({ where: { id }, include: { exam: { include: { course: true } } } });
      if (current.status !== "REQUESTED") throw conflict("SCHEDULE_NOT_REQUESTED", "Only requested schedules can be approved");
      if (current.exam.status !== "PUBLISHED") throw conflict("EXAM_NOT_PUBLISHED", "Publish the exam before approving its schedule");
      if (current.windowStart <= now()) throw badRequest("WINDOW_IN_PAST", "The window has already started");
      const conflicts = await findConflicts(tx, id);
      if (conflicts.length) throw conflict("SCHEDULE_CONFLICT", "The schedule clashes with another approved exam", { conflicts });
      await tx.examSchedule.update({ where: { id }, data: { status: "APPROVED", decidedById: user.id, decidedAt: now() } });

      const students = await tx.user.findMany({
        where: { enrolments: { some: { courseId: current.exam.courseId, status: "ACTIVE" } }, isActive: true },
        select: { id: true, phone: true, preferredLanguage: true },
      });
      const { date, window } = windowText(current.windowStart, current.windowEnd);
      for (const st of students) {
        await queueSms(tx, st, "SCHEDULE_APPROVED", { course: current.exam.course.code, date, window }, { type: "exam_schedule", id });
      }
      await notifyMany(tx, students.map((st) => st.id), "SCHEDULE_APPROVED", { course: current.exam.course.code, exam: current.exam.title, date });
      await audit(tx, { actorId: user.id, action: "SCHEDULE_APPROVED", entityType: "exam_schedule", entityId: id, details: { examId: current.examId, students: students.length }, req });
    });
  } catch (error) {
    if (isUniqueViolation(error, "exam_schedules_one_approved_key")) throw conflict("SCHEDULE_ALREADY_APPROVED", "This exam already has an approved schedule");
    throw error;
  }
  return serialize((await load(id))!);
}

/** Admin rejects a REQUESTED schedule with a reason. */
export async function rejectSchedule(user: AuthUser, id: string, reason: string, req: Request) {
  const s = await load(id);
  if (!s) throw notFound("SCHEDULE_NOT_FOUND");
  if (s.status !== "REQUESTED") throw conflict("SCHEDULE_NOT_REQUESTED", "Only requested schedules can be rejected");
  await transaction(async (tx) => {
    const n = await tx.examSchedule.updateMany({ where: { id, status: "REQUESTED" }, data: { status: "REJECTED", rejectionReason: reason, decidedById: user.id, decidedAt: now() } });
    if (n.count !== 1) throw conflict("SCHEDULE_NOT_REQUESTED", "Only requested schedules can be rejected");
    await audit(tx, { actorId: user.id, action: "SCHEDULE_REJECTED", entityType: "exam_schedule", entityId: id, details: { reason }, req });
  });
  return serialize((await load(id))!);
}

/**
 * Cancels a schedule: the lecturer can withdraw their own request; the admin
 * can also cancel an approved schedule as long as no student has started.
 * @throws 409 SCHEDULE_NOT_CANCELLABLE, 409 SCHEDULE_HAS_ATTEMPTS
 */
export async function cancelSchedule(user: AuthUser, id: string, req: Request) {
  const s = await load(id);
  const allowed = s && (user.role === "ADMIN" || (user.role === "LECTURER" && s.exam.course.lecturerId === user.id));
  if (!allowed) throw notFound("SCHEDULE_NOT_FOUND");
  const cancellable = s!.status === "REQUESTED" || (s!.status === "APPROVED" && user.role === "ADMIN");
  if (!cancellable) throw conflict("SCHEDULE_NOT_CANCELLABLE", "This schedule cannot be cancelled");
  if (await prisma.examAttempt.count({ where: { scheduleId: id } })) throw conflict("SCHEDULE_HAS_ATTEMPTS", "Students have already started this exam");
  await transaction(async (tx) => {
    await tx.examSchedule.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, { actorId: user.id, action: "SCHEDULE_CANCELLED", entityType: "exam_schedule", entityId: id, req });
  });
  return serialize((await load(id))!);
}
