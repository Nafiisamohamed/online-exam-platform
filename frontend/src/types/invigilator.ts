/**
 * Shapes of the API responses used by the invigilator screens. Each mirrors
 * the backend (modules/invigilation, docs/api.md "Invigilation"); nothing is
 * invented. Invigilators never receive questions, answers or marks.
 */

export type SessionState = "UPCOMING" | "OPEN" | "CLOSED";

/** GET /api/invigilation/sessions: sessions assigned to the invigilator. */
export interface InvigilatorSession {
  id: string;
  exam: { id: string; title: string; course: { code: string; name: string } };
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  rooms: string[];
  /** Attempts started so far. */
  attempts: number;
  state: SessionState;
}

export type LiveStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "DISCONNECTED";
export const LIVE_STATUSES: readonly LiveStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DISCONNECTED", "SUBMITTED"];

export interface LiveStudentBase {
  student: { id: string; studentNumber: string | null; fullName: string };
  status: LiveStatus;
  attemptId: string | null;
  /** Number of notes about this student in the session. */
  notes: number;
}

/** A student with an attempt (every field the backend adds once the exam is started). */
export interface LiveStudent extends LiveStudentBase {
  startedAt?: string;
  submittedAt?: string | null;
  submissionType?: "MANUAL" | "AUTO_DEADLINE" | null;
  answeredCount?: number;
  totalQuestions?: number;
  countedFocusLosses?: number;
  focusWarning?: boolean;
  /** Seconds since the student left the tab, while they are away right now. */
  awayFromTabSeconds?: number | null;
  lastSeenAt?: string;
  secondsSinceContact?: number;
  connection?: "OK" | "LOST" | null;
  remainingSeconds?: number;
  deadline?: string;
  extensionMinutes?: number;
}

/** GET /api/invigilation/sessions/:id/live */
export interface LiveView {
  schedule: { id: string; exam: { id: string; title: string; courseId: string; course: { code: string; name: string } }; windowStart: string; windowEnd: string; durationMinutes: number };
  serverTime: string;
  refreshSeconds: number;
  disconnectedAfterSeconds: number;
  summary: { total: number; notStarted: number; inProgress: number; disconnected: number; submitted: number };
  students: LiveStudent[];
}

/** GET /api/invigilation/attempts/:id/focus-events */
export interface FocusEvent {
  id: string;
  lostAt: string;
  returnedAt: string | null;
  durationMs: number | null;
  /** Losses of 1 second or more are counted; shorter ones are kept but not counted. */
  isCounted: boolean;
}

/** GET /api/invigilation/sessions/:id/notes */
export interface InvigilatorNote {
  id: string;
  scheduleId: string;
  studentId: string | null;
  text: string;
  createdAt: string;
  author: { id: string; fullName: string };
  student: { id: string; studentNumber: string | null; fullName: string } | null;
}

/** POST /api/invigilation/attempts/:id/extensions */
export interface ExtensionResult {
  extension: { id: string; minutes: number; reason: string; createdAt?: string };
  totalExtensionMinutes: number;
  deadline: string;
}

export const MAX_EXTENSION_MINUTES = 15;
export const DISCONNECTED_AFTER_SECONDS = 30;
