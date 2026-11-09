/**
 * Admin (registrar) endpoints. Paths, request bodies and responses follow
 * docs/api.md exactly; screens use these functions (writes) and the GET paths
 * below with useApi() (reads), so no component builds URLs or bodies itself.
 */
import type { AdminUser, Course, Enrolment, ImportConfirmResult, ImportPreview, NewCourseInput, NewUserInput, UserPatch, Faculty, Schedule, AcademicYear, Registration, GroupEnrolResult, SmsTemplate, RecipientChoice, RecipientPreview } from "@/types/admin";
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
  courses: (q: { semester?: string; facultyId?: string; academicYearId?: string; semesterNumber?: number } = {}) => `/courses${query(q)}`,
  academicYears: "/academic-years",
  rooms: "/rooms",
  semesterFees: (academicYearId: string) => `/semester-fees${query({ academicYearId })}`,
  resultsSearch: (q: { search?: string; facultyId?: string; academicYearId?: string; semesterNumber?: number; courseId?: string; examType?: string; examId?: string; publication?: string; page?: number; pageSize?: number }) => `/results-search${query(q)}`,
  smsTemplates: (active?: boolean) => `/sms-templates${query({ active: active === undefined ? undefined : String(active) })}`,
  smsOutbox: (q: { status?: string; templateKey?: string; page?: number; pageSize?: number } = {}) => `/sms-outbox${query(q)}`,
  feeStatus: (q: { academicYearId: string; facultyId?: string; semesterNumber?: number; status?: string; search?: string; page?: number; pageSize?: number }) => `/fee-status${query(q)}`,
  facultyLecturers: (facultyId: string) => `/faculties/${facultyId}/lecturers`,
  registrations: (q: { academicYearId?: string; facultyId?: string; semesterNumber?: number; search?: string; page?: number; pageSize?: number } = {}) => `/registrations${query(q)}`,
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

// --- Academic structure (Phase 2) -------------------------------------------------------

export async function createAcademicYear(input: { name: string; startDate: string; endDate: string; isCurrent?: boolean }) {
  const res = await api<{ academicYear: AcademicYear }>("/academic-years", { method: "POST", json: input });
  invalidate("/academic-years", "/audit-logs");
  return res.academicYear;
}

export async function updateAcademicYear(id: string, patch: { startDate?: string; endDate?: string }) {
  const res = await api<{ academicYear: AcademicYear }>(`/academic-years/${id}`, { method: "PATCH", json: patch });
  invalidate("/academic-years", "/audit-logs");
  return res.academicYear;
}

export async function activateAcademicYear(id: string) {
  const res = await api<{ academicYear: AcademicYear }>(`/academic-years/${id}/activate`, { method: "POST" });
  invalidate("/academic-years", "/audit-logs");
  return res.academicYear;
}

export async function assignLecturer(facultyId: string, lecturerId: string) {
  await api(`/faculties/${facultyId}/lecturers`, { method: "POST", json: { lecturerId } });
  invalidate(`/faculties/${facultyId}/lecturers`, "/audit-logs");
}

export async function unassignLecturer(facultyId: string, lecturerId: string) {
  await api(`/faculties/${facultyId}/lecturers/${lecturerId}`, { method: "DELETE" });
  invalidate(`/faculties/${facultyId}/lecturers`, "/audit-logs");
}

export async function registerStudent(input: { studentNumber: string; academicYearId: string; facultyId: string; semesterNumber: number }) {
  const res = await api<{ registration: Registration }>("/registrations", { method: "POST", json: input });
  invalidate("/registrations", "/academic-years", "/audit-logs");
  return res.registration;
}

/** Corrects a registration's faculty or semester (the student and academic year stay). */
export async function updateRegistration(id: string, patch: { facultyId?: string; semesterNumber?: number }) {
  const res = await api<{ registration: Registration }>(`/registrations/${id}`, { method: "PATCH", json: patch });
  invalidate("/registrations", "/audit-logs");
  return res.registration;
}

export async function enrolGroup(group: { academicYearId: string; facultyId: string; semesterNumber: number }) {
  const res = await api<GroupEnrolResult>("/registrations/enrol-group", { method: "POST", json: group });
  invalidate("/courses", "/registrations", "/audit-logs");
  return res;
}

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

export async function updateCourse(id: string, patch: Partial<Pick<NewCourseInput, "name" | "lecturerId" | "facultyId" | "academicYearId" | "semesterNumber">>) {
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
/** confirmUnknownCapacity: the registrar accepts that a chosen room's capacity is unknown. */
export async function approveSchedule(id: string, opts: { confirmUnknownCapacity?: boolean } = {}) {
  const res = await api<{ schedule: Schedule }>(`/schedules/${id}/approve`, { method: "POST", json: opts });
  invalidate("/schedules", "/exams", "/analytics/dashboard", "/audit-logs");
  return res.schedule;
}

/** POST /api/schedules/:id/reject { reason } (ADMIN only on the server). The lecturer sees the reason. */
export async function rejectSchedule(id: string, reason: string) {
  const res = await api<{ schedule: Schedule }>(`/schedules/${id}/reject`, { method: "POST", json: { reason } });
  invalidate("/schedules", "/exams", "/analytics/dashboard", "/audit-logs");
  return res.schedule;
}

/** Creates (id null) or updates an examination room. */
export async function saveRoom(id: string | null, input: { name: string; building: string; capacity: number | null; isActive: boolean }) {
  await api(id ? `/rooms/${id}` : "/rooms", { method: id ? "PATCH" : "POST", json: input });
  invalidate("/rooms", "/audit-logs");
}

/** Creates (id null) or changes a semester fee. */
export async function saveFee(id: string | null, input: { academicYearId?: string; facultyId?: string; semesterNumber?: number; amount: number }) {
  await api(id ? `/semester-fees/${id}` : "/semester-fees", { method: id ? "PATCH" : "POST", json: input });
  invalidate("/semester-fees", "/fee-status", "/audit-logs");
}

/** Simulated SMS + in-app reminders to the students of the filter who still owe money. */
export async function sendFeeReminders(q: { academicYearId: string; facultyId?: string; semesterNumber?: number }) {
  const res = await api<{ reminded: number }>("/fee-reminders", { method: "POST", json: q });
  invalidate("/audit-logs");
  return res;
}

/** Phase 6: creates or changes an SMS template. */
export async function saveSmsTemplate(id: string | null, body: Partial<{ name: string; category: string; bodySo: string; bodyEn: string; isActive: boolean }>) {
  const res = id
    ? await api<{ template: SmsTemplate }>(`/sms-templates/${id}`, { method: "PATCH", json: body })
    : await api<{ template: SmsTemplate }>("/sms-templates", { method: "POST", json: body });
  invalidate("/sms-templates", "/audit-logs");
  return res.template;
}

/** Who a group message would reach (nothing is sent). */
export function previewRecipients(choice: RecipientChoice) {
  return api<RecipientPreview>("/sms/recipients", { method: "POST", json: choice });
}

/** Sends a group message: simulated SMS and/or in-app notifications. */
export async function sendGroupMessage(input: RecipientChoice & { templateId?: string; bodySo: string; bodyEn: string; sendSms: boolean; sendNotification: boolean }) {
  const res = await api<{ recipients: number; sms: number; notifications: number; withoutPhone: number }>("/sms/send", { method: "POST", json: input });
  invalidate("/sms-outbox", "/audit-logs", "/notifications");
  return res;
}

/** Queues a failed SMS again. */
export async function retrySms(id: string) {
  await api(`/sms-outbox/${id}/retry`, { method: "POST" });
  invalidate("/sms-outbox", "/audit-logs");
}
