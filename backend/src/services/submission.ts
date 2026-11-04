/**
 * Submitting attempts (sections 4.7 and 4.10, P6).
 *
 * submitAttempt() is the only place where an attempt becomes SUBMITTED:
 * - by the student (MANUAL), or
 * - automatically at the server deadline (AUTO_DEADLINE), by the background
 *   job, or by any request that reaches an attempt whose deadline has passed
 *   (a reload, a save, a heartbeat, the invigilator's live view).
 * An automatic submission records submitted_at = the deadline itself, not the
 * moment the job happened to run. A manual submit that arrives after the
 * deadline is also recorded as AUTO_DEADLINE.
 *
 * In the same transaction it auto-grades every question with the saved
 * answers (empty rows are created for unanswered questions) and calculates the
 * working grade. The attempt row is locked first (FOR UPDATE), so a submit and
 * a concurrent answer save cannot interleave: the database trigger makes the
 * save wait and then reject it.
 */
import { now } from "../db/clock.ts";
import type { Tx } from "../db/prisma.ts";
import { transaction } from "../db/prisma.ts";
import * as attemptsRepo from "../repositories/attempts.repository.ts";
import { num0 } from "../lib/format.ts";
import { audit } from "./audit.ts";
import { autoGrade } from "./auto-grade.ts";
import { recalcGrade } from "./grades.ts";

export interface SubmitResult {
  submitted: boolean;
  submissionType?: "MANUAL" | "AUTO_DEADLINE";
}

/** Grades all questions of an attempt from its saved answers (inside the submit transaction). */
async function gradeAttempt(tx: Tx, attemptId: string) {
  const questions = await attemptsRepo.findQuestionsForGrading(attemptId, tx);
  for (const q of questions) {
    const result = autoGrade({
      type: q.questionVersion.type,
      marks: num0(q.marks),
      selectedOptionId: q.answer?.selectedOptionId ?? null,
      textAnswer: q.answer?.textAnswer ?? null,
      correctOptionId: q.questionVersion.options[0]?.id ?? null,
      acceptedNormalized: q.questionVersion.acceptedAnswers.map((a) => a.normalizedText),
    });
    if (q.answer) {
      await attemptsRepo.setAutoGrade(q.answer.id, result.status, result.marksAwarded, tx);
    } else {
      await attemptsRepo.insertEmptyAnswer({ attemptId, attemptQuestionId: q.id, questionVersionId: q.questionVersionId, gradingStatus: result.status, marksAwarded: result.marksAwarded }, tx);
    }
  }
}

/**
 * Submits one attempt if it is still in progress.
 * @param requested MANUAL (student pressed Submit) or AUTO_DEADLINE
 * @param skipLocked true for the background job: skip attempts another transaction is handling
 */
export async function submitAttempt(attemptId: string, requested: "MANUAL" | "AUTO_DEADLINE", actorId: string | null, opts: { skipLocked?: boolean } = {}): Promise<SubmitResult> {
  return transaction(async (tx) => {
    const row = await attemptsRepo.lockAttempt(attemptId, !!opts.skipLocked, tx);
    if (!row || row.status !== "IN_PROGRESS") return { submitted: false };

    const at = now();
    const late = at > row.deadline;
    if (requested === "AUTO_DEADLINE" && !late) return { submitted: false };
    const submissionType = late ? "AUTO_DEADLINE" : "MANUAL";
    const submittedAt = late ? row.deadline : at;

    await gradeAttempt(tx, attemptId);
    await attemptsRepo.markSubmitted(attemptId, submissionType, submittedAt, tx);
    await recalcGrade(tx, attemptId);
    await audit(tx, {
      actorId: submissionType === "MANUAL" ? actorId : null,
      action: submissionType === "MANUAL" ? "ATTEMPT_SUBMITTED" : "ATTEMPT_AUTO_SUBMITTED",
      entityType: "exam_attempt",
      entityId: attemptId,
    });
    return { submitted: true, submissionType };
  });
}

/** Submits the attempt now if its deadline has passed. Returns true when it did. */
export async function submitIfExpired(attempt: { id: string; status: string; deadline: Date }): Promise<boolean> {
  if (attempt.status !== "IN_PROGRESS" || now() <= attempt.deadline) return false;
  const r = await submitAttempt(attempt.id, "AUTO_DEADLINE", null);
  return r.submitted;
}

/** Background job step: submits every attempt whose deadline has passed. Returns how many. */
export async function autoSubmitExpired(limit = 25): Promise<number> {
  const due = await attemptsRepo.findExpiredAttempts(now(), limit);
  let n = 0;
  for (const a of due) if ((await submitAttempt(a.id, "AUTO_DEADLINE", null, { skipLocked: true })).submitted) n++;
  return n;
}
