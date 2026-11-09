/**
 * Student endpoints (docs/api.md "Taking an exam", "Results", "Payments").
 * The backend only ever returns the signed-in student's own data (anything
 * else answers 404), and never correct answers during an exam.
 */
import type { Attempt, Heartbeat, Payment, PaymentProvider, SaveResult } from "@/types/student";
import { api, query } from "./client";
import { invalidate } from "./use-api";

export const studentPaths = {
  myFees: "/my/fees",
  /** Active enrolments only (the API scopes /courses to the student). */
  courses: "/courses",
  course: (id: string) => `/courses/${id}`,
  myExams: "/my/exams",
  attempt: (id: string) => `/attempts/${id}`,
  results: "/my/results",
  result: (examId: string) => `/my/results/${examId}`,
  slipPdf: (examId: string, lang: "so" | "en") => `/my/results/${examId}/slip.pdf?lang=${lang}`,
  payments: (q: { examId?: string } = {}) => `/payments${query(q)}`,
  receiptPdf: (id: string, lang: "so" | "en") => `/payments/${id}/receipt.pdf?lang=${lang}`,
  notifications: "/notifications",
} as const;

// --- Exam attempts ----------------------------------------------------------------------

/** Starts the exam, or returns the student's existing attempt (resumed: true). Never a second attempt. */
export async function startAttempt(examId: string) {
  const res = await api<{ resumed: boolean; attempt: Attempt }>(`/exams/${examId}/attempts`, { method: "POST" });
  invalidate("/my/exams");
  return res;
}

export function loadAttempt(attemptId: string) {
  return api<{ attempt: Attempt }>(`/attempts/${attemptId}`).then((r) => r.attempt);
}

/** Saves (or clears, with null / empty text) the answer to one question. */
export function saveAnswer(attemptId: string, questionId: string, body: { selectedOptionId: string | null } | { textAnswer: string | null }) {
  return api<SaveResult>(`/attempts/${attemptId}/questions/${questionId}/answer`, { method: "PUT", json: body });
}

export function setFlag(attemptId: string, questionId: string, flagged: boolean) {
  return api<{ flagged: boolean }>(`/attempts/${attemptId}/questions/${questionId}/flag`, { method: "PUT", json: { flagged } });
}

/** Keep-alive and fresh server timing (including invigilator extensions). */
export function heartbeat(attemptId: string) {
  return api<Heartbeat>(`/attempts/${attemptId}/heartbeat`, { method: "POST" });
}

/** The server records the times; the browser only reports the moments, with a retry-safe event id. */
export function reportFocus(attemptId: string, clientEventId: string, type: "LOST" | "RETURNED") {
  return api<{ countedFocusLosses: number; focusWarning: boolean; terminated?: boolean }>(`/attempts/${attemptId}/focus-events`, { method: "POST", json: { clientEventId, type } });
}

/** Safe to repeat: an already submitted attempt is returned as it is. */
export async function submitAttempt(attemptId: string) {
  const res = await api<{ attempt: Attempt }>(`/attempts/${attemptId}/submit`, { method: "POST" });
  invalidate("/my/exams");
  return res.attempt;
}

// --- Exam fee payments (simulated mobile money) ---------------------------------------------

/**
 * Starts a simulated payment of `amount` towards a semester fee, or returns the open one for that fee
 * (reused: true). The server checks the amount against the outstanding balance.
 */
export function createPayment(semesterFeeId: string, amount: number, provider: PaymentProvider, phone: string, idempotencyKey: string) {
  return api<{ payment: Payment; reused: boolean }>("/payments", { method: "POST", json: { semesterFeeId, amount, provider, phone, idempotencyKey } });
}

/** The "Do you accept?" step on the phone: true continues to the PIN, false cancels. */
export function confirmPayment(id: string, accept: boolean) {
  return api<{ payment: Payment }>(`/payments/${id}/confirm`, { method: "POST", json: { accept } }).then((r) => r.payment);
}

export async function enterPin(id: string, pin: string) {
  const res = await api<{ result: "SUCCESS" | "WRONG_PIN" | "FAILED"; payment: Payment }>(`/payments/${id}/pin`, { method: "POST", json: { pin } });
  if (res.result === "SUCCESS") invalidate("/my/exams", "/payments", "/my/fees");
  return res;
}

export async function cancelPayment(id: string) {
  const res = await api<{ payment: Payment }>(`/payments/${id}/cancel`, { method: "POST" });
  invalidate("/payments");
  return res.payment;
}

// --- Account ----------------------------------------------------------------------------------

/** Saves the language used for the student's SMS and notifications (PATCH /api/auth/language). */
export function savePreferredLanguage(language: "so" | "en") {
  return api<{ user: unknown }>("/auth/language", { method: "PATCH", json: { language } });
}
