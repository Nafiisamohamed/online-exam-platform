/**
 * Invigilator live view, notes and time extensions (section 4.9).
 *
 * Only invigilators assigned to a session (and admins, read-only) can see it.
 * Invigilators never receive questions or correct answers.
 *
 * Live view: every enrolled student of the session with a status
 *   NOT_STARTED | IN_PROGRESS | SUBMITTED | DISCONNECTED
 * DISCONNECTED = in progress but no contact (save, heartbeat, focus event)
 * for 30 seconds; the frontend shows these in orange. For students in
 * progress it shows answered questions, counted tab switches, whether the
 * student is away from the tab right now, and the remaining time. The
 * frontend polls it every few seconds (refreshSeconds). Before building it,
 * attempts past their deadline are submitted, so statuses are always current.
 *
 * Extensions (D4, P5): 1-15 minutes per grant, 15 minutes in total per
 * attempt, a reason is required, only while the attempt is in progress. The
 * attempt row is locked so two invigilators granting at once cannot exceed
 * the limit (the database CHECK also enforces it).
 */
import type { Request } from "express";
import { now } from "../../db/clock.ts";
import { transaction } from "../../db/prisma.ts";
import { findExpiredAttempts } from "../../repositories/attempts.repository.ts";
import * as invRepo from "../../repositories/invigilation.repository.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { audit } from "../../services/audit.ts";
import { notify } from "../../services/messaging.ts";
import { submitIfExpired } from "../../services/submission.ts";
import { FOCUS_WARNING_THRESHOLD } from "../attempts/attempts.service.ts";

export const DISCONNECTED_AFTER_SECONDS = 30;
export const MAX_TOTAL_EXTENSION_MINUTES = 15;

/** Loads a schedule the user may watch: assigned invigilator, or admin (view only). */
async function watchableSchedule(user: AuthUser, scheduleId: string) {
  const s = await invRepo.findScheduleWithInvigilators(scheduleId);
  const ok = s && (user.role === "ADMIN" || (user.role === "INVIGILATOR" && s.invigilators.some((i) => i.invigilatorId === user.id)));
  if (!ok) throw notFound("SCHEDULE_NOT_FOUND");
  return s!;
}

/** Loads an attempt whose session this invigilator is assigned to. */
async function invigilatedAttempt(user: AuthUser, attemptId: string) {
  const a = await invRepo.findAttemptWithInvigilators(attemptId);
  const ok = a && (user.role === "ADMIN" || a.schedule.invigilators.some((i) => i.invigilatorId === user.id));
  if (!ok) throw notFound("ATTEMPT_NOT_FOUND");
  return a!;
}

/** Sessions assigned to the invigilator (admin: all approved), newest first. */
export async function mySessions(user: AuthUser) {
  const rows = await invRepo.findApprovedSessions(user.role === "INVIGILATOR" ? user.id : null);
  const t = now();
  return rows.map((s) => ({
    id: s.id,
    exam: s.exam,
    windowStart: s.windowStart,
    windowEnd: s.windowEnd,
    durationMinutes: s.durationMinutes,
    rooms: s.rooms.map((r) => r.room.name),
    attempts: s._count.attempts,
    state: t < s.windowStart ? "UPCOMING" : t < s.windowEnd ? "OPEN" : "CLOSED",
  }));
}

/** The live list of students for one session. */
export async function liveView(user: AuthUser, scheduleId: string) {
  const s = await watchableSchedule(user, scheduleId);
  const expired = await findExpiredAttempts(now(), 500, scheduleId);
  for (const a of expired) await submitIfExpired(a);

  const [attempts, enrolled, answered, openLosses, notes] = await invRepo.findLiveViewData(scheduleId, s.exam.courseId);
  const answeredBy = new Map(answered.map((a) => [a.attemptId, a._count._all]));
  const awayBy = new Map(openLosses.map((f) => [f.attemptId, f.lostAt]));
  const notesBy = new Map(notes.map((n) => [n.studentId, n._count._all]));
  const attemptBy = new Map(attempts.map((a) => [a.studentId, a]));
  const t = now();

  const students = [...new Map([...enrolled, ...attempts.map((a) => a.student)].map((st) => [st.id, st])).values()].map((st) => {
    const a = attemptBy.get(st.id);
    if (!a) return { student: st, status: "NOT_STARTED" as const, attemptId: null, notes: notesBy.get(st.id) ?? 0 };
    const secondsSinceContact = Math.max(0, Math.floor((t.getTime() - a.lastSeenAt.getTime()) / 1000));
    const inProgress = a.status === "IN_PROGRESS";
    const status = !inProgress ? ("SUBMITTED" as const) : secondsSinceContact >= DISCONNECTED_AFTER_SECONDS ? ("DISCONNECTED" as const) : ("IN_PROGRESS" as const);
    const awaySince = awayBy.get(a.id);
    return {
      student: st,
      status,
      attemptId: a.id,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      submissionType: a.submissionType,
      answeredCount: answeredBy.get(a.id) ?? 0,
      totalQuestions: a._count.questions,
      countedFocusLosses: a.countedFocusLosses,
      focusWarning: a.countedFocusLosses >= FOCUS_WARNING_THRESHOLD,
      awayFromTabSeconds: inProgress && awaySince ? Math.floor((t.getTime() - awaySince.getTime()) / 1000) : null,
      lastSeenAt: a.lastSeenAt,
      secondsSinceContact,
      connection: !inProgress ? null : status === "DISCONNECTED" ? "LOST" : "OK",
      remainingSeconds: inProgress ? Math.max(0, Math.ceil((a.deadline.getTime() - t.getTime()) / 1000)) : 0,
      deadline: a.deadline,
      extensionMinutes: a.totalExtensionMinutes,
      notes: notesBy.get(st.id) ?? 0,
    };
  });
  students.sort((x, y) => (x.student.studentNumber ?? "").localeCompare(y.student.studentNumber ?? ""));
  const count = (st: string) => students.filter((x) => x.status === st).length;
  return {
    schedule: { id: s.id, exam: s.exam, windowStart: s.windowStart, windowEnd: s.windowEnd, durationMinutes: s.durationMinutes },
    serverTime: t.toISOString(),
    refreshSeconds: 5,
    disconnectedAfterSeconds: DISCONNECTED_AFTER_SECONDS,
    summary: { total: students.length, notStarted: count("NOT_STARTED"), inProgress: count("IN_PROGRESS"), disconnected: count("DISCONNECTED"), submitted: count("SUBMITTED") },
    students,
  };
}

/** Every focus loss of one attempt, with the server-recorded times and durations. */
export async function focusEvents(user: AuthUser, attemptId: string) {
  await invigilatedAttempt(user, attemptId);
  const events = await invRepo.findFocusEvents(attemptId);
  return events.map((e) => ({ id: e.id, lostAt: e.lostAt, returnedAt: e.returnedAt, durationMs: e.durationMs, isCounted: e.isCounted }));
}

/** Adds a note to the session, optionally about one student. Only assigned invigilators. */
export async function addNote(user: AuthUser, scheduleId: string, text: string, studentId: string | undefined, req: Request) {
  const s = await watchableSchedule(user, scheduleId);
  if (user.role !== "INVIGILATOR") throw notFound("SCHEDULE_NOT_FOUND");
  if (studentId) {
    if (!(await invRepo.isStudentInSession(studentId, s.exam.courseId, scheduleId))) throw badRequest("STUDENT_NOT_IN_SESSION", "This student is not part of the session");
  }
  return transaction(async (tx) => {
    const note = await invRepo.insertNote({ scheduleId, studentId: studentId ?? null, authorId: user.id, text }, tx);
    await audit(tx, { actorId: user.id, action: "INVIGILATOR_NOTE_ADDED", entityType: "exam_schedule", entityId: scheduleId, details: { studentId: studentId ?? null }, req });
    return note;
  });
}

/** Notes of a session, newest first. @throws 404 SCHEDULE_NOT_FOUND */
export async function listNotes(user: AuthUser, scheduleId: string) {
  await watchableSchedule(user, scheduleId);
  return invRepo.findNotes(scheduleId);
}

/**
 * Grants extra time to one student.
 * @throws 409 ATTEMPT_NOT_IN_PROGRESS, 409 EXTENSION_LIMIT_EXCEEDED { remainingMinutes }
 */
export async function grantExtension(user: AuthUser, attemptId: string, minutes: number, reason: string, req: Request) {
  const a = await invigilatedAttempt(user, attemptId);
  if (user.role !== "INVIGILATOR") throw notFound("ATTEMPT_NOT_FOUND");
  if (await submitIfExpired(a)) throw conflict("ATTEMPT_NOT_IN_PROGRESS", "The attempt has already ended");
  const result = await transaction(async (tx) => {
    const row = await invRepo.lockAttemptForExtension(attemptId, tx);
    if (row.status !== "IN_PROGRESS") throw conflict("ATTEMPT_NOT_IN_PROGRESS", "The attempt has already ended");
    const total = row.total + minutes;
    if (total > MAX_TOTAL_EXTENSION_MINUTES) {
      throw conflict("EXTENSION_LIMIT_EXCEEDED", "An attempt can be extended by at most 15 minutes in total", { remainingMinutes: MAX_TOTAL_EXTENSION_MINUTES - row.total });
    }
    const deadline = new Date(row.baseDeadline.getTime() + total * 60_000);
    const ext = await invRepo.applyExtension(attemptId, user.id, minutes, reason, total, deadline, tx);
    await audit(tx, { actorId: user.id, action: "TIME_EXTENSION_GRANTED", entityType: "exam_attempt", entityId: attemptId, details: { minutes, totalMinutes: total, reason }, req });
    await notify(tx, a.studentId, "TIME_EXTENSION_GRANTED", { minutes, exam: a.exam.title });
    return { extension: ext, totalExtensionMinutes: total, deadline };
  });
  return result;
}
