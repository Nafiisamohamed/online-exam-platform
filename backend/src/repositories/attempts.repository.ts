/** Exam attempts: the frozen question set, answers, focus events and submission. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { GradingStatus, SubmissionType } from "../generated/prisma/enums.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export function findAttempt(id: string, db: Db = prisma) {
  return db.examAttempt.findUnique({ where: { id } });
}

export function findAttemptOrThrow(id: string, db: Db = prisma) {
  return db.examAttempt.findUniqueOrThrow({ where: { id } });
}

export function findAttemptOfStudent(examId: string, studentId: string, db: Db = prisma) {
  return db.examAttempt.findUnique({ where: { examId_studentId: { examId, studentId } } });
}

/** Everything the student's attempt screen needs (the service picks the allowed fields). */
export function findAttemptForView(id: string, db: Db = prisma) {
  return db.examAttempt.findUniqueOrThrow({
    where: { id },
    include: {
      exam: { select: { id: true, title: true, instructions: true, course: { select: { code: true, name: true } } } },
      questions: {
        orderBy: { position: "asc" },
        include: {
          answer: { select: { selectedOptionId: true, textAnswer: true, savedAt: true } },
          questionVersion: { select: { type: true, text: true, imagePath: true, options: { select: { id: true, text: true } } } },
        },
      },
    },
  });
}

/** Published exams a student can see: active courses with an approved schedule, or exams already attempted. */
export function findStudentExams(studentId: string, db: Db = prisma) {
  return db.exam.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { course: { enrolments: { some: { studentId, status: "ACTIVE" } } }, schedules: { some: { status: "APPROVED" } } },
        { attempts: { some: { studentId } } },
      ],
    },
    include: {
      course: { select: { id: true, code: true, name: true } },
      schedules: { where: { status: "APPROVED" }, select: { id: true, windowStart: true, windowEnd: true, durationMinutes: true } },
      attempts: { where: { studentId }, select: { id: true, status: true, deadline: true, submittedAt: true } },
      payments: { where: { studentId, status: "SUCCESS" }, select: { receiptNumber: true } },
      rules: { select: { questionCount: true, marksPerQuestion: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** The database's transaction time in epoch milliseconds (independent of the session time zone). */
export async function transactionTime(db: Db = prisma): Promise<Date> {
  const [{ ms }] = await db.$queryRaw<{ ms: number }[]>`SELECT floor(extract(epoch FROM now()) * 1000)::float8 AS ms`;
  return new Date(Number(ms));
}

/** Creates the attempt and its frozen questions. A database trigger locks each drawn question version. */
export async function insertAttempt(
  data: Prisma.ExamAttemptUncheckedCreateInput,
  questions: { questionVersionId: string; examRuleId: string; position: number; optionOrder: string[]; marks: number }[],
  db: Db = prisma,
) {
  const attempt = await db.examAttempt.create({ data });
  await db.attemptQuestion.createMany({ data: questions.map((q) => ({ attemptId: attempt.id, ...q })) });
  return attempt;
}

export function findAttemptQuestion(attemptId: string, attemptQuestionId: string, db: Db = prisma) {
  return db.attemptQuestion.findFirst({ where: { id: attemptQuestionId, attemptId }, include: { questionVersion: { select: { type: true } } } });
}

/** Saves the student's response. The answers_deadline_guard trigger re-checks status and deadline. */
export function upsertAnswer(
  a: { attemptId: string; attemptQuestionId: string; questionVersionId: string; selectedOptionId: string | null; textAnswer: string | null },
  db: Db = prisma,
) {
  return db.answer.upsert({
    where: { attemptQuestionId: a.attemptQuestionId },
    create: a,
    update: { selectedOptionId: a.selectedOptionId, textAnswer: a.textAnswer },
    select: { savedAt: true },
  });
}

export function touchAttempt(id: string, at: Date, db: Db = prisma) {
  return db.examAttempt.update({ where: { id }, data: { lastSeenAt: at } });
}

/** @returns rows changed (0 when the question is not in this attempt). */
export async function setQuestionFlag(attemptId: string, attemptQuestionId: string, flagged: boolean, db: Db = prisma) {
  return (await db.attemptQuestion.updateMany({ where: { id: attemptQuestionId, attemptId }, data: { isFlagged: flagged } })).count;
}

export function insertFocusLoss(attemptId: string, clientEventId: string, lostAt: Date, db: Db = prisma) {
  return db.focusEvent.create({ data: { attemptId, clientEventId, lostAt } });
}

export function findFocusEvent(attemptId: string, clientEventId: string, db: Db = prisma) {
  return db.focusEvent.findUnique({ where: { attemptId_clientEventId: { attemptId, clientEventId } } });
}

/** Records the return only once. @returns rows changed (0 if it was already recorded). */
export async function closeFocusEvent(id: string, data: { returnedAt: Date; durationMs: number; isCounted: boolean }, db: Db = prisma) {
  return (await db.focusEvent.updateMany({ where: { id, returnedAt: null }, data })).count;
}

export function incrementFocusLosses(attemptId: string, db: Db = prisma) {
  return db.examAttempt.update({ where: { id: attemptId }, data: { countedFocusLosses: { increment: 1 } } });
}

// --- Submission ---------------------------------------------------------------------

/**
 * Locks the attempt row (FOR UPDATE, optionally SKIP LOCKED) and returns its
 * status and deadline. The deadline is read as epoch milliseconds, so the
 * session time zone cannot shift it.
 */
export async function lockAttempt(id: string, skipLocked: boolean, db: Db) {
  const rows = skipLocked
    ? await db.$queryRaw<{ status: string; ms: number }[]>`SELECT status::text, (extract(epoch FROM deadline) * 1000)::float8 AS ms FROM exam_attempts WHERE id = ${id}::uuid FOR UPDATE SKIP LOCKED`
    : await db.$queryRaw<{ status: string; ms: number }[]>`SELECT status::text, (extract(epoch FROM deadline) * 1000)::float8 AS ms FROM exam_attempts WHERE id = ${id}::uuid FOR UPDATE`;
  return rows[0] ? { status: rows[0].status, deadline: new Date(Number(rows[0].ms)) } : null;
}

/** Questions of an attempt with their saved answer and answer key, for automatic grading. */
export function findQuestionsForGrading(attemptId: string, db: Db = prisma) {
  return db.attemptQuestion.findMany({
    where: { attemptId },
    include: {
      answer: true,
      questionVersion: { select: { type: true, options: { where: { isCorrect: true }, select: { id: true } }, acceptedAnswers: { select: { normalizedText: true } } } },
    },
  });
}

export function setAutoGrade(answerId: string, gradingStatus: GradingStatus, marksAwarded: number | null, db: Db = prisma) {
  return db.answer.update({ where: { id: answerId }, data: { gradingStatus, marksAwarded } });
}

/** Creates the empty answer row of an unanswered question, already graded. */
export function insertEmptyAnswer(
  a: { attemptId: string; attemptQuestionId: string; questionVersionId: string; gradingStatus: GradingStatus; marksAwarded: number | null },
  db: Db = prisma,
) {
  return db.answer.create({ data: a });
}

export function markSubmitted(id: string, submissionType: SubmissionType, submittedAt: Date, db: Db = prisma) {
  return db.examAttempt.update({ where: { id }, data: { status: "SUBMITTED", submissionType, submittedAt } });
}

/** In-progress attempts whose deadline has passed (optionally of one schedule). */
export function findExpiredAttempts(before: Date, take: number, scheduleId?: string, db: Db = prisma) {
  return db.examAttempt.findMany({
    where: { status: "IN_PROGRESS", deadline: { lt: before }, ...(scheduleId ? { scheduleId } : {}) },
    select: { id: true, status: true, deadline: true },
    orderBy: { deadline: "asc" },
    take,
  });
}

/** In-progress attempts of one exam whose deadline has passed. */
export function findExpiredAttemptsOfExam(examId: string, before: Date, db: Db = prisma) {
  return db.examAttempt.findMany({ where: { examId, status: "IN_PROGRESS", deadline: { lt: before } }, select: { id: true, status: true, deadline: true } });
}
