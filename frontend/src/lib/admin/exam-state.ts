/**
 * Where an exam stands, worked out from the API's own fields (exam status and
 * its REQUESTED / APPROVED schedule) and the current time. Used by the
 * overview counts and the examination oversight list, so both always agree.
 *
 * - DRAFT:              the lecturer is still building it
 * - NOT_SCHEDULED:      published, but no schedule requested
 * - AWAITING_APPROVAL:  a schedule is waiting for the registrar
 * - UPCOMING:           approved; the window has not opened yet
 * - OPEN:               approved; the window is open now
 * - COMPLETED:          approved; the window has closed
 */
import type { ExamListItem, ExamScheduleSummary, Schedule } from "@/types/admin";

export type ExamState = "DRAFT" | "NOT_SCHEDULED" | "AWAITING_APPROVAL" | "UPCOMING" | "OPEN" | "COMPLETED";
export const EXAM_STATES: readonly ExamState[] = ["DRAFT", "NOT_SCHEDULED", "AWAITING_APPROVAL", "UPCOMING", "OPEN", "COMPLETED"];

/** The schedule that matters: the approved one, else the requested one. */
export function currentSchedule(schedules: ExamScheduleSummary[]): ExamScheduleSummary | undefined {
  return schedules.find((s) => s.status === "APPROVED") ?? schedules.find((s) => s.status === "REQUESTED");
}

export function windowState(s: Pick<ExamScheduleSummary, "windowStart" | "windowEnd">, now: number): "UPCOMING" | "OPEN" | "COMPLETED" {
  if (now < new Date(s.windowStart).getTime()) return "UPCOMING";
  if (now < new Date(s.windowEnd).getTime()) return "OPEN";
  return "COMPLETED";
}

export function examState(exam: Pick<ExamListItem, "status" | "schedules">, now: number): ExamState {
  if (exam.status === "DRAFT") return "DRAFT";
  const s = currentSchedule(exam.schedules);
  if (!s) return "NOT_SCHEDULED";
  if (s.status === "REQUESTED") return "AWAITING_APPROVAL";
  return windowState(s, now);
}

/** Approved schedules split by time, soonest upcoming first. */
export function splitApprovedSchedules(schedules: Schedule[], now: number) {
  const approved = schedules.filter((s) => s.status === "APPROVED");
  return {
    upcoming: approved.filter((s) => windowState(s, now) === "UPCOMING").sort((a, b) => a.windowStart.localeCompare(b.windowStart)),
    open: approved.filter((s) => windowState(s, now) === "OPEN"),
    completed: approved.filter((s) => windowState(s, now) === "COMPLETED"),
    awaitingApproval: schedules.filter((s) => s.status === "REQUESTED"),
  };
}
