/**
 * Examination scheduling (section 4.5): the lecturer requests, the admin approves.
 *
 * A schedule has a window (e.g. 09:00-11:00), rooms (optional) and assigned invigilators. Since
 * Phase 3 the duration is the window length (end - start), worked out by the server. Students may
 * start at any time inside the window and must finish by the window's end. Only active rooms can
 * be chosen. At approval, the combined capacity of the rooms must cover the course's active
 * students: unknown capacity needs the registrar's confirmation; known but too small is refused.
 * No rooms means no capacity check.
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
import type { Db } from "../../db/prisma.ts";
import { transaction } from "../../db/prisma.ts";
import { lockScheduling } from "../../repositories/courses.repository.ts";
import { findExamWithCourse } from "../../repositories/exams.repository.ts";
import * as schedulesRepo from "../../repositories/schedules.repository.ts";
import { countActiveWithRole, findActiveStudentsOfCourse } from "../../repositories/users.repository.ts";
import type { ScheduleStatus } from "../../generated/prisma/enums.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { formatDateTime } from "../../i18n/messages.ts";
import { audit } from "../../services/audit.ts";
import { notifyMany, queueSms } from "../../services/messaging.ts";

export interface ScheduleInput {
  windowStart: Date;
  windowEnd: Date;
  roomIds: string[];
  invigilatorIds: string[];
}

type ScheduleRow = NonNullable<Awaited<ReturnType<typeof load>>>;
const load = (id: string) => schedulesRepo.findScheduleDetail(id);

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

/** The exam duration in whole minutes: the window length. */
export const durationOf = (w: { windowStart: Date; windowEnd: Date }) => Math.floor((w.windowEnd.getTime() - w.windowStart.getTime()) / 60_000);

async function checkInput(input: ScheduleInput) {
  if (input.windowEnd <= input.windowStart) throw badRequest("WINDOW_INVALID", "The window must end after it starts");
  const minutes = durationOf(input);
  if (minutes < 5 || minutes > 600) throw badRequest("WINDOW_LENGTH_INVALID", "The exam must last between 5 minutes and 10 hours", { minutes });
  if (input.windowStart <= now()) throw badRequest("WINDOW_IN_PAST", "The window must start in the future");
  if (input.roomIds.length) {
    if ((await schedulesRepo.countRooms(input.roomIds)) !== input.roomIds.length) throw badRequest("ROOM_NOT_FOUND", "A room was not found");
    if ((await schedulesRepo.countActiveRooms(input.roomIds)) !== input.roomIds.length) throw badRequest("ROOM_INACTIVE", "An inactive room cannot be chosen");
  }
  if (input.invigilatorIds.length) {
    if ((await countActiveWithRole(input.invigilatorIds, "INVIGILATOR")) !== input.invigilatorIds.length) throw badRequest("INVIGILATOR_INVALID", "Choose active invigilators");
  }
}

/**
 * Lecturer requests a schedule for their exam.
 * @throws 409 SCHEDULE_ALREADY_REQUESTED / SCHEDULE_ALREADY_APPROVED
 */
export async function requestSchedule(user: AuthUser, examId: string, input: ScheduleInput, req: Request) {
  const exam = await findExamWithCourse(examId);
  if (!exam || exam.course.lecturerId !== user.id) throw notFound("EXAM_NOT_FOUND");
  await checkInput(input);
  const open = await schedulesRepo.findOpenSchedule(examId);
  if (open) throw conflict(open.status === "APPROVED" ? "SCHEDULE_ALREADY_APPROVED" : "SCHEDULE_ALREADY_REQUESTED", "This exam already has an open schedule");
  const id = await transaction(async (tx) => {
    const s = await schedulesRepo.insertSchedule(
      {
        examId, requestedById: user.id, windowStart: input.windowStart, windowEnd: input.windowEnd, durationMinutes: durationOf(input),
        roomIds: [...new Set(input.roomIds)], invigilatorIds: [...new Set(input.invigilatorIds)],
      },
      tx,
    );
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
  const rows = await schedulesRepo.listSchedules({
    ...scope,
    ...(q.status && user.role !== "INVIGILATOR" ? { status: q.status } : {}),
    ...(q.from ? { windowEnd: { gte: q.from } } : {}),
    ...(q.to ? { windowStart: { lte: q.to } } : {}),
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
export async function findConflicts(scheduleId: string, db?: Db): Promise<Conflict[]> {
  const { students, rooms, invigilators } = await schedulesRepo.findScheduleClashes(scheduleId, db);
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
export async function approveSchedule(user: AuthUser, id: string, req: Request, opts: { confirmUnknownCapacity?: boolean } = {}) {
  const s = await load(id);
  if (!s) throw notFound("SCHEDULE_NOT_FOUND");
  try {
    await transaction(async (tx) => {
      await lockScheduling(tx);
      const current = await schedulesRepo.findScheduleWithExam(id, tx);
      if (current.status !== "REQUESTED") throw conflict("SCHEDULE_NOT_REQUESTED", "Only requested schedules can be approved");
      if (current.exam.status !== "PUBLISHED") throw conflict("EXAM_NOT_PUBLISHED", "Publish the exam before approving its schedule");
      if (current.windowStart <= now()) throw badRequest("WINDOW_IN_PAST", "The window has already started");
      const conflicts = await findConflicts(id, tx);
      if (conflicts.length) throw conflict("SCHEDULE_CONFLICT", "The schedule clashes with another approved exam", { conflicts });
      const capacity = await checkCapacity(id, current.exam.courseId, !!opts.confirmUnknownCapacity, tx);
      await schedulesRepo.updateSchedule(id, { status: "APPROVED", decidedById: user.id, decidedAt: now() }, tx);

      const students = await findActiveStudentsOfCourse(current.exam.courseId, tx);
      const { date, window } = windowText(current.windowStart, current.windowEnd);
      for (const st of students) {
        await queueSms(tx, st, "SCHEDULE_APPROVED", { course: current.exam.course.code, date, window }, { type: "exam_schedule", id });
      }
      await notifyMany(tx, students.map((st) => st.id), "SCHEDULE_APPROVED", { course: current.exam.course.code, exam: current.exam.title, date });
      await audit(tx, { actorId: user.id, action: "SCHEDULE_APPROVED", entityType: "exam_schedule", entityId: id, details: { examId: current.examId, students: students.length, capacity }, req });
    });
  } catch (error) {
    if (isUniqueViolation(error, "exam_schedules_one_approved_key")) throw conflict("SCHEDULE_ALREADY_APPROVED", "This exam already has an approved schedule");
    throw error;
  }
  return serialize((await load(id))!);
}

/**
 * Room capacity rule at approval. No rooms: no check. A room that is now inactive: refused.
 * Any room with unknown capacity: refused unless the registrar confirms. All known: their sum
 * must cover the course's active students.
 * @throws 409 ROOM_INACTIVE, 409 ROOM_CAPACITY_UNKNOWN { rooms, students }, 409 ROOM_CAPACITY_INSUFFICIENT { capacity, students }
 */
async function checkCapacity(scheduleId: string, courseId: string, confirmUnknown: boolean, db: Db) {
  const rooms = await schedulesRepo.findScheduleRooms(scheduleId, db);
  if (rooms.length === 0) return { checked: false };
  const inactive = rooms.filter((r) => !r.isActive);
  if (inactive.length) throw conflict("ROOM_INACTIVE", "A chosen room is no longer active", { rooms: inactive.map((r) => r.name) });
  const students = await schedulesRepo.countActiveStudentsOfCourse(courseId, db);
  const unknown = rooms.filter((r) => r.capacity === null);
  if (unknown.length) {
    if (!confirmUnknown) throw conflict("ROOM_CAPACITY_UNKNOWN", "The capacity of a chosen room is unknown; confirm to approve anyway", { rooms: unknown.map((r) => r.name), students });
    return { checked: false, unknownConfirmed: unknown.map((r) => r.name), students };
  }
  const total = rooms.reduce((s, r) => s + (r.capacity ?? 0), 0);
  if (total < students) throw conflict("ROOM_CAPACITY_INSUFFICIENT", "The rooms do not have enough seats for the enrolled students", { capacity: total, students });
  return { checked: true, capacity: total, students };
}

/** Admin rejects a REQUESTED schedule with a reason. */
export async function rejectSchedule(user: AuthUser, id: string, reason: string, req: Request) {
  const s = await load(id);
  if (!s) throw notFound("SCHEDULE_NOT_FOUND");
  if (s.status !== "REQUESTED") throw conflict("SCHEDULE_NOT_REQUESTED", "Only requested schedules can be rejected");
  await transaction(async (tx) => {
    const n = await schedulesRepo.updateScheduleIfStatus(id, "REQUESTED", { status: "REJECTED", rejectionReason: reason, decidedById: user.id, decidedAt: now() }, tx);
    if (n !== 1) throw conflict("SCHEDULE_NOT_REQUESTED", "Only requested schedules can be rejected");
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
  if (await schedulesRepo.countAttemptsOfSchedule(id)) throw conflict("SCHEDULE_HAS_ATTEMPTS", "Students have already started this exam");
  await transaction(async (tx) => {
    await schedulesRepo.updateSchedule(id, { status: "CANCELLED" }, tx);
    await audit(tx, { actorId: user.id, action: "SCHEDULE_CANCELLED", entityType: "exam_schedule", entityId: id, req });
  });
  return serialize((await load(id))!);
}
