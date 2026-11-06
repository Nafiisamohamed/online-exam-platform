/**
 * Shapes of the API responses used by the lecturer screens. Each mirrors the
 * backend service named in its comment (docs/api.md); nothing is invented.
 * Shared shapes (courses, exams, schedules, analytics) live in types/admin.ts.
 */
import type { ExamDetail, ExamRule } from "./admin";

export type QuestionType = ExamRule["questionType"];
export type Difficulty = ExamRule["difficulty"];
export const QUESTION_TYPES: readonly QuestionType[] = ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"];
export const DIFFICULTIES: readonly Difficulty[] = ["EASY", "MEDIUM", "HARD"];

/** questions.service serializeVersion: a full version, with the answer key (course lecturer only). */
export interface QuestionVersion {
  id: string;
  versionNumber: number;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  imagePath: string | null;
  marks: number;
  difficulty: Difficulty;
  topic: { id: string; name: string };
  isLocked: boolean;
  lockedAt: string | null;
  createdAt: string;
  options: { id: string; text: string; isCorrect: boolean; position: number }[];
  acceptedAnswers: string[];
  rubric: { id: string; description: string; maxMarks: number; position: number }[];
}

/** GET /api/courses/:courseId/questions (paged) */
export interface QuestionListItem {
  id: string;
  isArchived: boolean;
  current: QuestionVersion | null;
}

/** GET /api/questions/:id */
export interface QuestionDetail {
  id: string;
  courseId: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  current: QuestionVersion | null;
  versions: { id: string; versionNumber: number; isLocked: boolean; createdAt: string }[];
}

/** Body of POST /api/courses/:courseId/questions and PUT /api/questions/:id */
export interface QuestionInput {
  type: QuestionType;
  text: string;
  marks: number;
  difficulty: Difficulty;
  topic: string;
  imagePath?: string | null;
  options?: { text: string; isCorrect: boolean }[];
  acceptedAnswers?: string[];
  rubric?: { description: string; maxMarks: number }[];
}

/** GET /api/courses/:courseId/question-summary */
export interface BankSummaryRow {
  type: QuestionType;
  difficulty: Difficulty;
  marks: number;
  count: number;
}

export interface Topic {
  id: string;
  name: string;
}

// --- Question CSV import (modules/questions/question-import.ts) ---------------------

export interface QuestionImportRow {
  row: number;
  status: "VALID" | "INVALID" | "DUPLICATE";
  errors: { code: string; params?: Record<string, string | number> }[];
  question?: QuestionInput;
}

export interface QuestionImportPreview {
  batch: { id: string; type: "QUESTIONS"; courseId: string; status: "PREVIEW" | "CONFIRMED"; filename: string; totalRows: number; validRows: number; invalidRows: number; duplicateRows: number };
  rows: QuestionImportRow[];
}

export interface QuestionImportResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  savedRows: number;
  rows: QuestionImportRow[];
}

// --- Exam builder (modules/exams) ---------------------------------------------------------

export interface RuleInput {
  questionType: QuestionType;
  difficulty: Difficulty;
  marksPerQuestion: number;
  questionCount: number;
  topicIds?: string[];
}

/** GET /api/exams/:id (the same response the registrar sees). */
export type LecturerExam = ExamDetail;

export interface ExamSettingsInput {
  title?: string;
  instructions?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  allowAnswerReview?: boolean;
  feeAmount?: number;
  feeCurrency?: string;
  secondGraderId?: string | null;
}

/** GET /api/exams/:id/preview: one sample draw with the answer key. Nothing is saved. */
export interface ExamPreview {
  sample: true;
  totalMarks: number;
  questions: {
    position: number;
    type: QuestionType;
    difficulty: Difficulty;
    topic: string;
    text: string;
    imageUrl: string | null;
    marks: number;
    options: { id: string; text: string; isCorrect: boolean }[];
    acceptedAnswers: string[];
    rubric: { description: string; maxMarks: number }[];
  }[];
}

export interface ScheduleRequestInput {
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  roomIds: string[];
  invigilatorIds: string[];
}

/** GET /api/rooms */
export interface Room {
  id: string;
  name: string;
  building: string;
  networkRanges: string[];
}

// --- Grading (modules/grading) -------------------------------------------------------------

export type GradingStatus = "AUTO_CORRECT" | "AUTO_INCORRECT" | "NEEDS_REVIEW" | "PENDING_ESSAY" | "AWAITING_SECOND_GRADE" | "DISCREPANCY" | "GRADED" | "NOT_ANSWERED";
export const GRADING_STATUSES: readonly GradingStatus[] = ["NEEDS_REVIEW", "PENDING_ESSAY", "AWAITING_SECOND_GRADE", "DISCREPANCY", "GRADED", "AUTO_CORRECT", "AUTO_INCORRECT", "NOT_ANSWERED"];

/** The course lecturer sees the student; the blind second grader only an anonymous code. */
export type GradingStudent = { id: string; studentNumber: string | null; fullName: string } | { anonymousCode: string };

/** GET /api/exams/:id/grading */
export interface GradingQueue {
  exam: { id: string; title: string; resultsStatus: string };
  role: "FIRST" | "SECOND";
  counts?: Partial<Record<GradingStatus, number>>;
  remaining: number;
  items: {
    answerId: string;
    attemptId: string;
    student: GradingStudent;
    questionPosition: number;
    type: QuestionType;
    questionText: string;
    maxMarks: number;
    /** The second grader sees TO_MARK / MARKED_BY_YOU instead of the real status. */
    gradingStatus: GradingStatus | "TO_MARK" | "MARKED_BY_YOU" | null;
    myMark: number | null;
  }[];
}

/** GET /api/grading/answers/:id */
export interface GradingAnswer {
  answerId: string;
  exam: { id: string; title: string; resultsStatus: string; hasSecondGrader: boolean };
  role: "FIRST" | "SECOND";
  student: GradingStudent;
  question: {
    position: number;
    type: QuestionType;
    text: string;
    imageUrl: string | null;
    maxMarks: number;
    rubric: { id: string; description: string; maxMarks: number }[];
    acceptedAnswers: string[];
    options: { id: string; text: string; isCorrect: boolean }[];
  };
  response: { selectedOptionId: string | null; textAnswer: string | null };
  gradingStatus?: GradingStatus | null;
  marksAwarded?: number | null;
  /** Only marks this grader may see (blind second grading). */
  marks: { graderRole: "FIRST" | "SECOND"; grader: { id: string; fullName: string } | null; totalMarks: number | null; comment: string | null; criteria: { criterionId: string; marks: number | null }[] }[];
}

// --- Results (modules/results) -------------------------------------------------------------

export interface ResultScore {
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  letterGrade: string | null;
}

/** GET /api/exams/:id/results */
export interface ExamResults {
  exam: { id: string; title: string; resultsStatus: "UNPUBLISHED" | "PUBLISHED" | "REOPENED" };
  canPublish: boolean;
  blockers: { inProgress: number; submitted: number; ungraded: Partial<Record<GradingStatus, number>> };
  publications: { number: number; publishedAt: string; publishedBy: string; reason: string | null }[];
  students: {
    student: { id: string; studentNumber: string | null; fullName: string };
    enrolment: "ACTIVE" | "DROPPED" | null;
    status: "ABSENT" | "IN_PROGRESS" | "SUBMITTED";
    attemptId?: string;
    submissionType?: "MANUAL" | "AUTO_DEADLINE" | null;
    submittedAt?: string | null;
    countedFocusLosses?: number;
    extensionMinutes?: number;
    working: ResultScore | null;
    published: (ResultScore & { revisionNumber: number }) | null;
  }[];
}

/** GET /api/notifications */
export interface AppNotification {
  id: string;
  templateKey: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
