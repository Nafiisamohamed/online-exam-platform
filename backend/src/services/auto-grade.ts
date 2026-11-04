/**
 * Automatic grading of one answer at submission time (section 4.10).
 *
 * - MCQ and True/False: the chosen option is correct -> full marks
 *   (AUTO_CORRECT), otherwise 0 (AUTO_INCORRECT).
 * - Short answer: compared with the accepted answers ignoring upper/lower case
 *   and extra spaces, keeping punctuation (D20). A match -> AUTO_CORRECT. No
 *   match -> NEEDS_REVIEW with no marks yet: an unmatched answer is never
 *   treated as wrong automatically; the lecturer decides.
 * - Essay: PENDING_ESSAY (graded by the lecturer with the rubric).
 * - No response: NOT_ANSWERED, 0 marks.
 * Marks always come from the attempt question (copied from the question bank).
 *
 * Pure function; grading never runs while answers are being saved (P3), so a
 * save response can never reveal whether an answer was right.
 */
import { normalizeText } from "../lib/format.ts";

export type AutoStatus = "AUTO_CORRECT" | "AUTO_INCORRECT" | "NEEDS_REVIEW" | "PENDING_ESSAY" | "NOT_ANSWERED";

export interface GradeInput {
  type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
  marks: number;
  selectedOptionId: string | null;
  textAnswer: string | null;
  correctOptionId?: string | null;
  /** Accepted answers, already normalised. */
  acceptedNormalized?: string[];
}

export function autoGrade(a: GradeInput): { status: AutoStatus; marksAwarded: number | null } {
  if (a.type === "MCQ" || a.type === "TRUE_FALSE") {
    if (!a.selectedOptionId) return { status: "NOT_ANSWERED", marksAwarded: 0 };
    return a.selectedOptionId === a.correctOptionId ? { status: "AUTO_CORRECT", marksAwarded: a.marks } : { status: "AUTO_INCORRECT", marksAwarded: 0 };
  }
  const text = a.textAnswer?.trim() ? a.textAnswer : null;
  if (!text) return { status: "NOT_ANSWERED", marksAwarded: 0 };
  if (a.type === "ESSAY") return { status: "PENDING_ESSAY", marksAwarded: null };
  return (a.acceptedNormalized ?? []).includes(normalizeText(text))
    ? { status: "AUTO_CORRECT", marksAwarded: a.marks }
    : { status: "NEEDS_REVIEW", marksAwarded: null };
}

/** Statuses that still need a lecturer before results can be published (4.11). */
export const UNFINISHED_STATUSES = ["NEEDS_REVIEW", "PENDING_ESSAY", "AWAITING_SECOND_GRADE", "DISCREPANCY"] as const;
