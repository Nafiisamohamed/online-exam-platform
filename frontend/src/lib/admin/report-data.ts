/**
 * Figures for the overview and reports, worked out from real API responses
 * only. Where the API gives no value, the result is null ("not available"),
 * never 0, so the screens can tell a missing figure from a genuine zero.
 */
import type { AdminDashboard, Course, ExamListItem, Faculty } from "@/types/admin";
import type { Role } from "@/types/account";
import { currentSchedule, EXAM_STATES, examState, type ExamState } from "./exam-state";
import { percentOf } from "@/lib/format";

/** Accounts with this role from /analytics/dashboard usersByRole, or null when the API did not send it. */
export function accountsWithRole(dashboard: AdminDashboard | undefined, role: Role): number | null {
  if (!dashboard?.usersByRole) return null;
  return dashboard.usersByRole.find((u) => u.role === role)?.count ?? 0;
}

export function examStageCounts(exams: ExamListItem[], now: number): Record<ExamState, number> {
  const counts = Object.fromEntries(EXAM_STATES.map((s) => [s, 0])) as Record<ExamState, number>;
  for (const e of exams) counts[examState(e, now)]++;
  return counts;
}

/** Approved exams that have not started yet, soonest first. */
export function upcomingExams(exams: ExamListItem[], now: number, limit = 5) {
  return exams
    .filter((e) => examState(e, now) === "UPCOMING")
    .map((e) => ({ exam: e, schedule: currentSchedule(e.schedules)! }))
    .sort((a, b) => a.schedule.windowStart.localeCompare(b.schedule.windowStart))
    .slice(0, limit);
}

/** Active enrolments and courses per faculty (a student in two courses counts twice). */
export function facultyTotals(faculties: Faculty[], courses: Course[]) {
  return faculties.map((f) => {
    const own = courses.filter((c) => c.facultyId === f.id);
    return { code: f.code, name: f.name, courses: f._count.courses, enrolments: own.reduce((s, c) => s + c.activeStudents, 0) };
  });
}

/**
 * Participation in completed exams: attempts (students who started) compared
 * with the course's active enrolments. Rate is null when nobody is enrolled.
 */
export function participation(exams: ExamListItem[], courses: Map<string, Course>, now: number) {
  return exams
    .filter((e) => examState(e, now) === "COMPLETED")
    .map((e) => {
      const enrolled = courses.get(e.course.id)?.activeStudents ?? 0;
      return { exam: e, enrolled, attempts: e.attempts, rate: percentOf(e.attempts, enrolled) };
    });
}

/** How attempts ended: by the student, automatically at the deadline, or still running. */
export function submissionSummary(dashboard: AdminDashboard) {
  let manual = 0;
  let auto = 0;
  let inProgress = 0;
  for (const a of dashboard.attemptsBySubmission) {
    if (a.status === "IN_PROGRESS") inProgress += a.count;
    else if (a.submissionType === "AUTO_DEADLINE") auto += a.count;
    else manual += a.count;
  }
  const total = manual + auto + inProgress;
  return { manual, auto, inProgress, total, completionRate: percentOf(manual + auto, total) };
}

/** True when the distribution has at least one graded attempt. */
export function hasScores(distribution: { count: number }[]) {
  return distribution.some((b) => b.count > 0);
}
