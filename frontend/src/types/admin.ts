/**
 * Shapes of the API responses used by the admin (registrar) screens. Each
 * type mirrors what the backend actually returns (see docs/api.md and the
 * backend services named in the comments); nothing here is invented.
 */
import type { Role } from "./account";

/** { items, total, page, pageSize } (lib/format.ts paged()). */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** users.repository userSelect + role name (GET /api/users). Never contains a password. */
export interface AdminUser {
  id: string;
  role: Role;
  studentNumber: string | null;
  email: string | null;
  fullName: string;
  phone: string;
  preferredLanguage: "so" | "en";
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface NewUserInput {
  role: Role;
  fullName: string;
  phone: string;
  email?: string;
  studentNumber?: string;
  preferredLanguage?: "so" | "en";
}

export type UserPatch = Partial<Pick<AdminUser, "fullName" | "phone" | "preferredLanguage" | "isActive">>;

/** GET /api/staff?role=… */
export interface StaffMember {
  id: string;
  fullName: string;
  email: string | null;
}

/** GET /api/faculties (with the number of courses). */
export interface Faculty {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: { courses: number };
}

/** GET /api/courses and /api/courses/:id. */
export interface Course {
  id: string;
  facultyId: string;
  code: string;
  name: string;
  semester: string;
  lecturerId: string;
  createdAt: string;
  updatedAt: string;
  faculty: { id: string; code: string; name: string };
  lecturer: { id: string; fullName: string; email: string | null };
  /** Number of ACTIVE enrolments. */
  activeStudents: number;
}

export interface NewCourseInput {
  facultyId: string;
  code: string;
  name: string;
  semester: string;
  lecturerId: string;
}

export type EnrolmentStatus = "ACTIVE" | "DROPPED";

/** GET /api/courses/:id/enrolments */
export interface Enrolment {
  id: string;
  status: EnrolmentStatus;
  enrolledAt: string;
  droppedAt: string | null;
  student: { id: string; studentNumber: string | null; fullName: string; phone: string };
}

/** Clash reported by ENROLMENT_SCHEDULE_CONFLICT and the CSV SCHEDULE_CONFLICT row error. */
export interface EnrolmentConflict {
  course: string;
  exam: string;
  otherCourse: string;
  otherExam: string;
}

// --- CSV enrolment import (modules/imports/enrolment-import.ts) -------------------

export interface RowError {
  code: string;
  params?: Record<string, string | number>;
}

export interface EnrolmentImportRow {
  row: number;
  status: "VALID" | "INVALID";
  errors: RowError[];
  data: { studentNumber: string; fullName: string; phone: string; courseCodes: string[]; existingStudent: boolean; alreadyEnrolled: string[] };
}

export interface ImportBatchSummary {
  id: string;
  type: "ENROLMENTS" | "QUESTIONS";
  semester: string | null;
  status: "PREVIEW" | "CONFIRMED";
  filename: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

export interface ImportPreview {
  batch: ImportBatchSummary;
  rows: EnrolmentImportRow[];
}

export interface ImportConfirmResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  savedRows: number;
  newStudents: number;
  enrolled: number;
  reactivated: number;
  rows: EnrolmentImportRow[];
  /** Shown once; never stored in plain text. */
  temporaryPasswords: { studentNumber: string; fullName: string; temporaryPassword: string }[];
}

// --- Exams and schedules ------------------------------------------------------------

export type ExamStatus = "DRAFT" | "PUBLISHED";
export type ResultsStatus = "UNPUBLISHED" | "PUBLISHED" | "REOPENED";
export type ScheduleStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED";

/** Schedule summary inside GET /api/exams (only REQUESTED and APPROVED ones). */
export interface ExamScheduleSummary {
  id: string;
  status: ScheduleStatus;
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
}

/** GET /api/exams */
export interface ExamListItem {
  id: string;
  title: string;
  course: { id: string; code: string; name: string; semester: string };
  status: ExamStatus;
  resultsStatus: ResultsStatus;
  feeAmount: number | null;
  feeCurrency: string;
  schedules: ExamScheduleSummary[];
  /** Number of attempts (started or submitted). */
  attempts: number;
  isSecondGrader: boolean;
}

export interface ExamRule {
  id: string;
  position: number;
  questionType: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marksPerQuestion: number;
  questionCount: number;
  available?: number;
}

/** GET /api/exams/:id (exams.service serializeExam). Only the fields shown are typed. */
export interface ExamDetail {
  id: string;
  course: { id: string; code: string; name: string; semester: string };
  title: string;
  instructions: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  allowAnswerReview: boolean;
  feeAmount: number | null;
  feeCurrency: string;
  status: ExamStatus;
  resultsStatus: ResultsStatus;
  secondGrader: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  totalQuestions: number;
  totalMarks: number;
  rules: ExamRule[];
  schedules: (ExamScheduleSummary & {
    rejectionReason: string | null;
    decidedAt: string | null;
    rooms: { id: string; name: string; building: string }[];
    invigilators: { id: string; fullName: string }[];
  })[];
}

/** GET /api/schedules (schedules.service serialize). */
export interface Schedule {
  id: string;
  status: ScheduleStatus;
  exam: { id: string; title: string; status: ExamStatus; course: { id: string; code: string; name: string } };
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  rejectionReason: string | null;
  requestedBy: { id: string; fullName: string } | null;
  decidedBy: { id: string; fullName: string } | null;
  decidedAt: string | null;
  createdAt: string;
  rooms: { id: string; name: string; building: string }[];
  invigilators: { id: string; fullName: string }[];
}

// --- Analytics ----------------------------------------------------------------------

/** GET /api/analytics/dashboard (admin scope). */
export interface AdminDashboard {
  scope: "ALL" | "OWN_COURSES";
  averageScoreByCourse: { courseId: string; code: string; name: string; semester: string; attempts: number; averagePercent: number | null }[];
  scoreDistribution: { from: number; to: number; count: number }[];
  examsByStatus: { status: ExamStatus; resultsStatus: ResultsStatus; count: number }[];
  attemptsBySubmission: { status: "IN_PROGRESS" | "SUBMITTED"; submissionType: "MANUAL" | "AUTO_DEADLINE" | null; count: number }[];
  tabSwitches: { attempts: number; countedFocusLosses: number };
  paymentsByProvider?: { provider: string; status: string; count: number; amount: number | null }[];
  usersByRole?: { role: Role | undefined; count: number }[];
  smsByStatus?: { status: string; count: number }[];
}

export interface QuestionAnalytics {
  questionVersionId: string;
  questionId?: string;
  versionNumber?: number;
  text: string;
  type: ExamRule["questionType"];
  difficulty?: ExamRule["difficulty"];
  topic?: string;
  maxMarks: number;
  timesUsed: number;
  answered: number;
  correct: number;
  /** null when fewer than rules.minStudents answers (NOT_ENOUGH_DATA). */
  difficultyIndex: number | null;
  discrimination: number | null;
  averageMarkPercent: number | null;
  flags: ("NOT_ENOUGH_DATA" | "LOW_CORRECT_RATE" | "HIGH_CORRECT_RATE")[];
}

/** GET /api/exams/:id/analytics */
export interface ExamAnalytics {
  exam: { id: string; title: string; resultsStatus: ResultsStatus };
  rules: { minStudents: number; lowThreshold: number; highThreshold: number; groupShare: number; essayCorrectShare: number };
  statistics: {
    students: number;
    average: number | null;
    highest: number | null;
    lowest: number | null;
    averageScore: number | null;
    distribution: { from: number; to: number; count: number }[];
  };
  questions: QuestionAnalytics[];
}

// --- Audit log ----------------------------------------------------------------------

/** GET /api/audit-logs (newest first). */
export interface AuditEntry {
  id: string;
  actorId: string | null;
  actionCode: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string | null; studentNumber: string | null } | null;
}
