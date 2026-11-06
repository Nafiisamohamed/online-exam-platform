/**
 * Shapes of the API responses used by the student screens. Each mirrors the
 * backend service named in its comment (docs/api.md); nothing is invented.
 * Responses to students never contain correct answers, marks awarded or
 * other students' data: the backend leaves them out.
 */
import type { QuestionType } from "./lecturer";

/** attempts.service listMyExams: state of one exam for this student. */
export type MyExamState = "UNSCHEDULED" | "UPCOMING" | "OPEN" | "CLOSED" | "IN_PROGRESS" | "SUBMITTED";

/** GET /api/my/exams */
export interface MyExam {
  id: string;
  title: string;
  instructions: string;
  course: { id: string; code: string; name: string };
  totalQuestions: number;
  totalMarks: number;
  schedule: { id: string; windowStart: string; windowEnd: string; durationMinutes: number } | null;
  fee: { amount: number; currency: string; required: boolean; paid: boolean; receiptNumber: string | null };
  attempt: { id: string; status: "IN_PROGRESS" | "SUBMITTED"; deadline: string; submittedAt: string | null } | null;
  resultsPublished: boolean;
  state: MyExamState;
  canStart: boolean;
}

/** Timing block of every attempt response (attempts.service timing()). The server's values are the truth. */
export interface AttemptTiming {
  serverTime: string;
  startedAt: string;
  deadline: string;
  remainingSeconds: number;
  extensionMinutes: number;
  warnings: { tenMinutes: boolean; oneMinute: boolean };
}

export interface AttemptQuestion {
  /** The attempt question id (used in the answer and flag URLs). */
  id: string;
  position: number;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  marks: number;
  /** In this student's own order. Never says which one is correct. */
  options: { id: string; text: string }[];
  answer: { selectedOptionId: string | null; textAnswer: string | null; savedAt: string } | null;
  isAnswered: boolean;
  isFlagged: boolean;
}

/** GET /api/attempts/:id, POST /api/exams/:examId/attempts (attempt), POST /api/attempts/:id/submit */
export interface Attempt extends AttemptTiming {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED";
  submissionType: "MANUAL" | "AUTO_DEADLINE" | null;
  submittedAt: string | null;
  exam: { id: string; title: string; instructions: string; course: { code: string; name: string } };
  totalQuestions: number;
  totalMarks: number;
  answeredCount: number;
  flaggedCount: number;
  countedFocusLosses: number;
  focusWarning: boolean;
  /** Empty once the attempt is submitted. */
  questions: AttemptQuestion[];
}

/** POST /api/attempts/:id/heartbeat */
export interface Heartbeat extends AttemptTiming {
  status: "IN_PROGRESS" | "SUBMITTED";
  submissionType: "MANUAL" | "AUTO_DEADLINE" | null;
  countedFocusLosses?: number;
  focusWarning?: boolean;
}

/** PUT /api/attempts/:id/questions/:questionId/answer */
export interface SaveResult {
  saved: true;
  savedAt: string;
  remainingSeconds: number;
}

/** GET /api/my/results (latest published snapshot per exam) */
export interface MyResultItem {
  examId: string;
  exam: { title: string; course: { code: string; name: string } };
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  letterGrade: string | null;
  publicationNumber: number;
  publishedAt: string;
}

/** GET /api/my/results/:examId. Correct answers only when the lecturer allows answer review. */
export interface MyResult {
  exam: { id: string; title: string; course: { code: string; name: string } };
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  letterGrade: string | null;
  countedFocusLosses: number;
  publicationNumber: number;
  publishedAt: string;
  answerReviewAllowed: boolean;
  questions: {
    position: number;
    type: QuestionType;
    text: string;
    imageUrl: string | null;
    maxMarks: number | null;
    awardedMarks: number | null;
    options: { id: string; text: string; isCorrect?: boolean }[];
    yourAnswer: { selectedOptionId: string | null; textAnswer: string | null };
    feedback: string | null;
    acceptedAnswers?: string[];
  }[];
}

// --- Payments (simulated mobile money, modules/payments) ------------------------------

export type PaymentProvider = "EVC_PLUS" | "ZAAD" | "EDAHAB";
export const PAYMENT_PROVIDERS: readonly PaymentProvider[] = ["EVC_PLUS", "ZAAD", "EDAHAB"];
export type PaymentStatus = "PENDING_CONFIRMATION" | "PENDING_PIN" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED";

/** payments.service serializePayment */
export interface Payment {
  id: string;
  exam: { id: string; title: string; course?: { code: string; name: string } } | null;
  provider: PaymentProvider;
  providerName: string;
  phone: string;
  amount: number | null;
  currency: string;
  status: PaymentStatus;
  merchantName: string;
  merchantNumber: string;
  pinAttemptsLeft: number;
  failureReason: string | null;
  receiptNumber: string | null;
  expiresAt: string;
  secondsUntilExpiry: number;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  isSimulated: boolean;
}
