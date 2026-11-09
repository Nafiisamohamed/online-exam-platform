/**
 * Admin (registrar) endpoints. Paths, request bodies and responses follow
 * docs/api.md exactly; screens use these functions (writes) and the GET paths
 * below with useApi() (reads), so no component builds URLs or bodies itself.
 */
import type {
  AdminUser, Course, Enrolment, ImportConfirmResult, ImportPreview, NewCourseInput, NewUserInput, UserPatch, Faculty, Schedule,
} from "@/types/admin";
import type { Role } from "@/types/account";
import { api, query } from "./client";

/** Filters of the Activity History (GET /api/audit-logs and .csv). Dates are ISO strings. */
export type AuditQuery = {
  search?: string;
  role?: "ADMIN" | "LECTURER" | "STUDENT" | "INVIGILATOR";
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
};
import { invalidate } from "./use-api";

/** GET paths, for useApi(). */
export const paths = {
  users: (q: { role?: Role; search?: string; active?: boolean; page?: number; pageSize?: number }) => `/users${query(q)}`,
  user: (id: string) => `/users/${id}`,
  staff: (role: "LECTURER" | "INVIGILATOR") => `/staff?role=${role}`,
  faculties: "/faculties",
  courses: (q: { semester?: string; facultyId?: string } = {}) => `/courses${query(q)}`,
  course: (id: string) => `/courses/${id}`,
  enrolments: (courseId: string, status?: "ACTIVE" | "DROPPED") => `/courses/${courseId}/enrolments${query({ status })}`,
  exams: (q: { courseId?: string; status?: "DRAFT" | "PUBLISHED" } = {}) => `/exams${query(q)}`,
  exam: (id: string) => `/exams/${id}`,
  examAnalytics: (id: string) => `/exams/${id}/analytics`,
  schedules: (q: { status?: string; from?: string; to?: string } = {}) => `/schedules${query(q)}`,
  dashboard: "/analytics/dashboard",
  auditLogs: (q: AuditQuery & { page?: number; pageSize?: number } = {}) => `/audit-logs${query(q)}`,
  /** Activity History as CSV, written by the server in `lang`. */
  auditCsv: (q: AuditQuery, lang: "so" | "en") => `/audit-logs.csv${query({ ...q, lang })}`,
  /** Downloads (opened by the browser, not fetched as JSON). */
  enrolmentTemplate: "/imports/templates/enrolments.csv",
  gradesCsv: (examId: string, lang: "so" | "en") => `/exams/${examId}/grades.csv?lang=${lang}`,
} as const;

// --- Users --------------------------------------------------------------------------

export async function createUser(input: NewUserInput) {
  const res = await api<{ user: AdminUser; temporaryPassword: string }>("/users", { method: "POST", json: input });
  invalidate("/users", "/staff", "/analytics/dashboard", "/audit-logs");
  return res;
}

export async function updateUser(id: string, patch: UserPatch) {
  const res = await api<{ user: AdminUser }>(`/users/${id}`, { method: "PATCH", json: patch });
  invalidate("/users", "/staff", "/courses", "/audit-logs");
  return res.user;
}

/** New temporary password, returned once. Ends the user's sessions. */
export async function resetPassword(id: string) {
  const res = await api<{ temporaryPassword: string }>(`/users/${id}/reset-password`, { method: "POST" });
  invalidate(`/users/${id}`, "/users?", "/audit-logs");
  return res.temporaryPassword;
}

// --- Faculties ------------------------------------------------------------------------

export async function createFaculty(input: { code: string; name: string }) {
  const res = await api<{ faculty: Faculty }>("/faculties", { method: "POST", json: input });
  invalidate("/faculties", "/audit-logs");
  return res.faculty;
}

export async function renameFaculty(id: string, name: string) {
  const res = await api<{ faculty: Faculty }>(`/faculties/${id}`, { method: "PATCH", json: { name } });
  invalidate("/faculties", "/courses", "/audit-logs");
  return res.faculty;
}

// --- Courses --------------------------------------------------------------------------

export async function createCourse(input: NewCourseInput) {
  const res = await api<{ course: Course }>("/courses", { method: "POST", json: input });
  invalidate("/courses", "/faculties", "/analytics/dashboard", "/audit-logs");
  return res.course;
}

export async function updateCourse(id: string, patch: Partial<Pick<NewCourseInput, "name" | "lecturerId" | "facultyId">>) {
  const res = await api<{ course: Course }>(`/courses/${id}`, { method: "PATCH", json: patch });
  invalidate("/courses", "/faculties", "/exams", "/audit-logs");
  return res.course;
}

// --- Enrolment ------------------------------------------------------------------------

export async function enrolStudent(courseId: string, studentNumber: string) {
  const res = await api<{ enrolment: Enrolment }>(`/courses/${courseId}/enrolments`, { method: "POST", json: { studentNumber } });
  invalidate("/courses", "/audit-logs");
  return res.enrolment;
}

export async function dropStudent(courseId: string, studentId: string) {
  const res = await api<{ enrolment: Enrolment }>(`/courses/${courseId}/enrolments/${studentId}/drop`, { method: "POST" });
  invalidate("/courses", "/audit-logs");
  return res.enrolment;
}

/** Step 1 of the CSV import: upload and validate. Nothing is saved yet. */
export function previewEnrolmentImport(file: File, semester: string) {
  const body = new FormData();
  body.set("file", file);
  body.set("semester", semester);
  return api<ImportPreview>("/imports/enrolments", { method: "POST", body });
}

/** Step 2: save the valid rows of the preview. */
export async function confirmImport(batchId: string) {
  const res = await api<ImportConfirmResult>(`/imports/${batchId}/confirm`, { method: "POST" });
  invalidate("/courses", "/users", "/analytics/dashboard", "/audit-logs");
  return res;
}

// --- Schedule requests (registrar decisions) -----------------------------------------

/** POST /api/schedules/:id/approve (ADMIN only on the server). Notifies the enrolled students. */
export async function approveSchedule(id: string) {
  const res = await api<{ schedule: Schedule }>(`/schedules/${id}/approve`, { method: "POST" });
  invalidate("/schedules", "/exams", "/analytics/dashboard", "/audit-logs");
  return res.schedule;
}

/** POST /api/schedules/:id/reject { reason } (ADMIN only on the server). The lecturer sees the reason. */
export async function rejectSchedule(id: string, reason: string) {
  const res = await api<{ schedule: Schedule }>(`/schedules/${id}/reject`, { method: "POST", json: { reason } });
  invalidate("/schedules", "/exams", "/analytics/dashboard", "/audit-logs");
  return res.schedule;
}
