/**
 * Student examination attempts: the core technical challenge (sections 3,
 * 4.6, 4.7 and 4.8).
 *
 * Completion condition 1 (fair randomisation): startAttempt() generates the
 * student's own question set with exam-generator.ts and freezes it in
 * attempt_questions (version, order, option order, marks). In the same
 * transaction a database trigger locks every drawn question version.
 *
 * Completion condition 2 (server deadline): the deadline is calculated once on
 * the server: min(start + duration, window end) + approved extensions (D4).
 * Every save is checked against it here AND by a database trigger that uses
 * the database clock. Answers after the deadline are rejected with
 * 409 ATTEMPT_DEADLINE_PASSED, and the attempt is submitted automatically.
 *
 * Completion condition 3 (recovery): the attempt is unique per student and
 * exam. Starting again, reloading or reconnecting returns the SAME attempt,
 * with the same questions, the saved answers and the remaining time
 * recalculated from the server deadline. A new exam is never generated.
 *
 * Every function checks that the attempt belongs to the logged-in student;
 * otherwise 404. Responses never contain correct answers, accepted answers,
 * rubrics or marks awarded (P3).
 */
import { now } from "../../db/clock.ts";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { transaction } from "../../db/prisma.ts";
import * as attemptsRepo from "../../repositories/attempts.repository.ts";
import { findEnrolment } from "../../repositories/courses.repository.ts";
import { findExam } from "../../repositories/exams.repository.ts";
import { findSuccessfulPayment } from "../../repositories/payments.repository.ts";
import { findApprovedSchedule } from "../../repositories/schedules.repository.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../lib/errors.ts";
import { num, num0 } from "../../lib/format.ts";
import { audit } from "../../services/audit.ts";
import { generateExam, NotEnoughQuestionsError } from "../../services/exam-generator.ts";
import { examPoolFilter, loadRuleSpecs, rulesWithPools } from "../../services/exam-pool.ts";
import { submitAttempt, submitIfExpired, terminateLocked } from "../../services/submission.ts";

/** Counted tab switches after which the student is warned (4.8). */
export const FOCUS_WARNING_THRESHOLD = 3;
/**
 * Counted tab switches at which the attempt is terminated automatically (project policy).
 * Note: brief 4.8 itself only asks for a warning after 3 and leaves any penalty to the lecturer.
 */
export const MAX_COUNTED_FOCUS_LOSSES = 3;
/** Focus losses shorter than this are logged but not counted (4.8). */
export const FOCUS_MIN_COUNTED_MS = 1000;

const remainingSeconds = (deadline: Date) => Math.max(0, Math.ceil((deadline.getTime() - now().getTime()) / 1000));

/** Timing block included in every attempt response. The countdown is only a display of these values. */
function timing(a: { deadline: Date; status: string; startedAt: Date; totalExtensionMinutes: number }) {
  const remaining = a.status === "IN_PROGRESS" ? remainingSeconds(a.deadline) : 0;
  return {
    serverTime: now().toISOString(),
    startedAt: a.startedAt,
    deadline: a.deadline,
    remainingSeconds: remaining,
    extensionMinutes: a.totalExtensionMinutes,
    warnings: { tenMinutes: a.status === "IN_PROGRESS" && remaining <= 600, oneMinute: a.status === "IN_PROGRESS" && remaining <= 60 },
  };
}

/** Loads the student's own attempt or throws 404. */
async function ownAttempt(user: AuthUser, attemptId: string) {
  const a = await attemptsRepo.findAttempt(attemptId);
  if (!a || a.studentId !== user.id) throw notFound("ATTEMPT_NOT_FOUND");
  return a;
}

/**
 * The student's view of an attempt, built from an allow-list of fields.
 * In progress: questions, options in the student's order, saved answers and flags.
 * Submitted: only the summary (results are shown after publication by the results module).
 */
export async function attemptView(attemptId: string) {
  const a = await attemptsRepo.findAttemptForView(attemptId);
  const answered = a.questions.filter((q) => q.answer && (q.answer.selectedOptionId || q.answer.textAnswer?.trim())).length;
  const base = {
    id: a.id,
    status: a.status,
    submissionType: a.submissionType,
    submittedAt: a.submittedAt,
    exam: a.exam,
    totalQuestions: a.questions.length,
    totalMarks: Math.round(a.questions.reduce((s, q) => s + num0(q.marks), 0) * 100) / 100,
    answeredCount: answered,
    flaggedCount: a.questions.filter((q) => q.isFlagged).length,
    countedFocusLosses: a.countedFocusLosses,
    focusWarning: a.countedFocusLosses >= FOCUS_WARNING_THRESHOLD,
    ...timing(a),
  };
  if (a.status !== "IN_PROGRESS") return { ...base, questions: [] };
  return {
    ...base,
    questions: a.questions.map((q) => {
      const options = new Map(q.questionVersion.options.map((o) => [o.id, o.text]));
      const response = q.answer && (q.answer.selectedOptionId || q.answer.textAnswer) ? q.answer : null;
      return {
        id: q.id,
        position: q.position,
        type: q.questionVersion.type,
        text: q.questionVersion.text,
        imageUrl: q.questionVersion.imagePath ? `/api/question-images/${q.questionVersion.imagePath}` : null,
        marks: num(q.marks),
        options: q.optionOrder.map((id) => ({ id, text: options.get(id) ?? "" })),
        answer: response ? { selectedOptionId: response.selectedOptionId, textAnswer: response.textAnswer, savedAt: response.savedAt } : null,
        isAnswered: !!response,
        isFlagged: q.isFlagged,
      };
    }),
  };
}

/** Exams the student can see: published exams of their active courses with an approved schedule, plus any exam they attempted. */
export async function listMyExams(user: AuthUser) {
  const exams = await attemptsRepo.findStudentExams(user.id);
  const t = now();
  return exams.map((e) => {
    const schedule = e.schedules[0] ?? null;
    const attempt = e.attempts[0] ?? null;
    const fee = num0(e.feeAmount);
    const paid = fee === 0 || e.payments.length > 0;
    const windowState = !schedule ? "UNSCHEDULED" : t < schedule.windowStart ? "UPCOMING" : t < schedule.windowEnd ? "OPEN" : "CLOSED";
    const state = attempt ? (attempt.status === "TERMINATED" ? "TERMINATED" : attempt.status === "IN_PROGRESS" && attempt.deadline > t ? "IN_PROGRESS" : "SUBMITTED") : windowState;
    return {
      id: e.id,
      title: e.title,
      examType: e.examType,
      instructions: e.instructions,
      course: e.course,
      totalQuestions: e.rules.reduce((s, r) => s + r.questionCount, 0),
      totalMarks: Math.round(e.rules.reduce((s, r) => s + num0(r.marksPerQuestion) * r.questionCount, 0) * 100) / 100,
      schedule,
      fee: { amount: fee, currency: e.feeCurrency, required: fee > 0, paid, receiptNumber: e.payments[0]?.receiptNumber ?? null },
      attempt,
      resultsPublished: e.resultsStatus !== "UNPUBLISHED",
      state,
      canStart: !attempt && windowState === "OPEN" && paid,
    };
  });
}

/**
 * Starts the exam, or returns the existing attempt (recovery: never a second exam).
 * @throws 404 EXAM_NOT_FOUND, 403 NOT_ENROLLED, 409 EXAM_NOT_SCHEDULED / EXAM_NOT_OPEN_YET / EXAM_WINDOW_CLOSED,
 *         402 PAYMENT_REQUIRED, 409 EXAM_NOT_ENOUGH_QUESTIONS
 */
export async function startAttempt(user: AuthUser, examId: string, ip: string) {
  const existing = await attemptsRepo.findAttemptOfStudent(examId, user.id);
  if (existing) {
    await submitIfExpired(existing);
    return { resumed: true, attempt: await attemptView(existing.id) };
  }

  const exam = await findExam(examId);
  if (!exam || exam.status !== "PUBLISHED") throw notFound("EXAM_NOT_FOUND");
  const enrolment = await findEnrolment(user.id, exam.courseId);
  if (enrolment?.status !== "ACTIVE") throw forbidden("NOT_ENROLLED", "You are not enrolled in this course");
  const schedule = await findApprovedSchedule(examId);
  if (!schedule) throw conflict("EXAM_NOT_SCHEDULED", "This exam has no approved schedule");

  const t = now();
  if (t < schedule.windowStart) throw conflict("EXAM_NOT_OPEN_YET", "The exam window has not opened yet", { windowStart: schedule.windowStart });
  if (t >= schedule.windowEnd) throw conflict("EXAM_WINDOW_CLOSED", "The exam window has closed", { windowEnd: schedule.windowEnd });

  // No network, IP address, room or device restriction: an eligible student may start from any
  // device and any connection. The address is only recorded on the attempt (start_ip) for the record.
  if (num0(exam.feeAmount) > 0) {
    const paid = await findSuccessfulPayment(user.id, examId);
    if (!paid) throw new AppError(402, "PAYMENT_REQUIRED", "Pay the exam fee first", { amount: num(exam.feeAmount), currency: exam.feeCurrency });
  }

  try {
    const attemptId = await transaction(async (tx) => {
      // One clock for the whole start: the database's transaction time.
      const startedAt = await attemptsRepo.transactionTime(tx);
      // Re-check the window with this authoritative time (the check above used the API's synced clock).
      if (startedAt < schedule.windowStart) throw conflict("EXAM_NOT_OPEN_YET", "The exam window has not opened yet", { windowStart: schedule.windowStart });
      if (startedAt >= schedule.windowEnd) throw conflict("EXAM_WINDOW_CLOSED", "The exam window has closed", { windowEnd: schedule.windowEnd });
      // Exams published since Phase 3 draw only reviewed questions; unticked questions are never drawn.
      const pools = await rulesWithPools(exam.courseId, await loadRuleSpecs(examId, tx), examId, tx, await examPoolFilter(exam, tx));
      const items = generateExam(pools, { shuffleQuestions: exam.shuffleQuestions, shuffleOptions: exam.shuffleOptions });
      const baseDeadline = new Date(Math.min(startedAt.getTime() + schedule.durationMinutes * 60_000, schedule.windowEnd.getTime()));
      // The database trigger locks each drawn question version in this same transaction.
      const attempt = await attemptsRepo.insertAttempt(
        { examId, scheduleId: schedule.id, studentId: user.id, startedAt, baseDeadline, deadline: baseDeadline, lastSeenAt: startedAt, startIp: ip || null },
        items.map((i) => ({ questionVersionId: i.versionId, examRuleId: i.ruleId, position: i.position, optionOrder: i.optionOrder, marks: i.marks })),
        tx,
      );
      await audit(tx, { actorId: user.id, action: "ATTEMPT_STARTED", entityType: "exam_attempt", entityId: attempt.id, details: { examId, questions: items.length, ip } });
      return attempt.id;
    });
    return { resumed: false, attempt: await attemptView(attemptId) };
  } catch (error) {
    if (error instanceof NotEnoughQuestionsError) {
      throw new AppError(409, "EXAM_NOT_ENOUGH_QUESTIONS", "The question bank no longer has enough questions", { rules: error.shortages });
    }
    // Two start requests at the same moment: the unique (exam, student) key keeps one attempt.
    if (isUniqueViolation(error)) {
      const again = await attemptsRepo.findAttemptOfStudent(examId, user.id);
      if (again) return { resumed: true, attempt: await attemptView(again.id) };
    }
    throw error;
  }
}

/** Reload / reconnect: same attempt, saved answers, remaining time from the server deadline. */
export async function getAttempt(user: AuthUser, attemptId: string) {
  const a = await ownAttempt(user, attemptId);
  await submitIfExpired(a);
  return attemptView(a.id);
}

/** Loads an in-progress attempt for a change. Expired attempts are submitted and rejected. */
async function activeAttempt(user: AuthUser, attemptId: string) {
  const a = await ownAttempt(user, attemptId);
  if (a.status === "TERMINATED") throw conflict("ATTEMPT_TERMINATED", "This exam was terminated after the maximum number of tab switches");
  if (a.status !== "IN_PROGRESS") throw conflict("ATTEMPT_ALREADY_SUBMITTED", "This exam has already been submitted");
  if (await submitIfExpired(a)) throw conflict("ATTEMPT_DEADLINE_PASSED", "The time for this exam is over; your saved answers were submitted");
  return a;
}

/**
 * Saves (or changes, or clears) the answer to one question, immediately (4.6).
 * MCQ / True-False: selectedOptionId must be one of that question's options.
 * Short answer / essay: textAnswer (an empty text clears the answer).
 * @returns { saved: true, savedAt, remainingSeconds } - never whether the answer is right.
 */
export async function saveAnswer(user: AuthUser, attemptId: string, attemptQuestionId: string, body: { selectedOptionId?: string | null; textAnswer?: string | null }) {
  const a = await activeAttempt(user, attemptId);
  const aq = await attemptsRepo.findAttemptQuestion(a.id, attemptQuestionId);
  if (!aq) throw notFound("QUESTION_NOT_FOUND");

  const choice = aq.questionVersion.type === "MCQ" || aq.questionVersion.type === "TRUE_FALSE";
  let selectedOptionId: string | null = null;
  let textAnswer: string | null = null;
  if (choice) {
    if (body.textAnswer) throw badRequest("ANSWER_TYPE_MISMATCH", "Choose one of the options for this question");
    selectedOptionId = body.selectedOptionId ?? null;
    if (selectedOptionId && !aq.optionOrder.includes(selectedOptionId)) throw badRequest("OPTION_NOT_IN_QUESTION", "This option does not belong to the question");
  } else {
    if (body.selectedOptionId) throw badRequest("ANSWER_TYPE_MISMATCH", "Type an answer for this question");
    textAnswer = body.textAnswer?.trim() ? body.textAnswer : null;
  }

  // The answers_deadline_guard trigger re-checks status and deadline with the database clock.
  const saved = await attemptsRepo.upsertAnswer({ attemptId: a.id, attemptQuestionId: aq.id, questionVersionId: aq.questionVersionId, selectedOptionId, textAnswer });
  await attemptsRepo.touchAttempt(a.id, now());
  return { saved: true, savedAt: saved.savedAt, remainingSeconds: remainingSeconds(a.deadline) };
}

/** Marks or unmarks a question as flagged (for the navigator). */
export async function setFlag(user: AuthUser, attemptId: string, attemptQuestionId: string, flagged: boolean) {
  const a = await activeAttempt(user, attemptId);
  if ((await attemptsRepo.setQuestionFlag(a.id, attemptQuestionId, flagged)) !== 1) throw notFound("QUESTION_NOT_FOUND");
  return { flagged };
}

/**
 * Heartbeat every few seconds from the exam screen: marks the student as
 * connected (the invigilator view shows "disconnected" after 30 seconds
 * without contact) and returns fresh timing, including any new extension.
 * Submits the attempt if its deadline has passed.
 */
export async function heartbeat(user: AuthUser, attemptId: string) {
  const a = await ownAttempt(user, attemptId);
  if (await submitIfExpired(a)) return { status: "SUBMITTED", submissionType: "AUTO_DEADLINE", ...timing({ ...a, status: "SUBMITTED" }) };
  if (a.status === "IN_PROGRESS") await attemptsRepo.touchAttempt(a.id, now());
  const fresh = await attemptsRepo.findAttemptOrThrow(a.id);
  return { status: fresh.status, submissionType: fresh.submissionType, countedFocusLosses: fresh.countedFocusLosses, focusWarning: fresh.countedFocusLosses >= FOCUS_WARNING_THRESHOLD, ...timing(fresh) };
}

/**
 * Records a focus loss (the student left the exam tab or window, or minimised
 * it) and the return to it (4.8). The browser only reports the moments; the
 * SERVER records the times and duration. clientEventId (a UUID made by the
 * browser) makes retries safe: the same event is never stored twice.
 * Losses of 1 second or more are counted; shorter ones are kept but not counted.
 * At the third counted switch the attempt is TERMINATED in the same locked
 * transaction (saved answers kept and auto-graded, no more changes); the
 * response then carries terminated = true. A repeated or concurrent event
 * cannot count twice: each event is closed once, under the attempt's row lock.
 */
export async function recordFocusEvent(user: AuthUser, attemptId: string, clientEventId: string, kind: "LOST" | "RETURNED") {
  const a = await activeAttempt(user, attemptId);
  const t = now();
  if (kind === "LOST") {
    try {
      await attemptsRepo.insertFocusLoss(a.id, clientEventId, t);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error; // retry of the same event
    }
  } else {
    const outcome = await transaction(async (tx) => {
      // Lock the attempt first (as a submission does), so termination, saves and other events cannot interleave.
      const locked = await attemptsRepo.lockAttempt(a.id, false, tx);
      if (!locked || locked.status !== "IN_PROGRESS") return { closed: true as const };
      const ev = await attemptsRepo.findFocusEvent(a.id, clientEventId, tx);
      if (!ev) throw notFound("FOCUS_EVENT_NOT_FOUND");
      if (ev.returnedAt) return { closed: false as const }; // already recorded
      const durationMs = Math.max(0, t.getTime() - ev.lostAt.getTime());
      const isCounted = durationMs >= FOCUS_MIN_COUNTED_MS;
      const changed = await attemptsRepo.closeFocusEvent(ev.id, { returnedAt: t, durationMs, isCounted }, tx);
      if (changed === 1 && isCounted) {
        const updated = await attemptsRepo.incrementFocusLosses(a.id, tx);
        if (updated.countedFocusLosses >= MAX_COUNTED_FOCUS_LOSSES) {
          const r = await terminateLocked(tx, { id: a.id, deadline: locked.deadline }, updated.countedFocusLosses, user.id);
          return { closed: true as const, ...r };
        }
      }
      return { closed: false as const };
    });
    if (outcome.closed) {
      const end = await attemptsRepo.findAttemptOrThrow(a.id);
      return { countedFocusLosses: end.countedFocusLosses, focusWarning: true, terminated: end.status === "TERMINATED", status: end.status };
    }
  }
  const fresh = await attemptsRepo.touchAttempt(a.id, t);
  return { countedFocusLosses: fresh.countedFocusLosses, focusWarning: fresh.countedFocusLosses >= FOCUS_WARNING_THRESHOLD, terminated: false, status: fresh.status };
}

/** The student submits. Repeated clicks are safe: an already submitted attempt is simply returned. A terminated attempt cannot be submitted. */
export async function submit(user: AuthUser, attemptId: string) {
  const a = await ownAttempt(user, attemptId);
  if (a.status === "TERMINATED") throw conflict("ATTEMPT_TERMINATED", "This exam was terminated after the maximum number of tab switches");
  await submitAttempt(a.id, "MANUAL", user.id);
  return attemptView(a.id);
}
