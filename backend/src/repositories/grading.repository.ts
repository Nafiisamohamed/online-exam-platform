/** Grading data: the grading scale, working grades, answers being graded and essay marks. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { GradingStatus, GraderRole } from "../generated/prisma/enums.ts";

// --- Grading scale ---------------------------------------------------------------

export function findScale(db: Db = prisma) {
  return db.gradingScale.findMany({ orderBy: { minPercentage: "desc" } });
}

/** Replaces the whole scale (caller runs this in a transaction). */
export async function replaceScale(bands: { letter: string; minPercentage: number; sortOrder: number }[], db: Db = prisma) {
  await db.gradingScale.deleteMany({});
  await db.gradingScale.createMany({ data: bands });
}

// --- Working grades --------------------------------------------------------------

/** Question marks and awarded marks of one attempt, for the grade calculation. */
export function findAttemptMarks(attemptId: string, db: Db = prisma) {
  return db.attemptQuestion.findMany({ where: { attemptId }, select: { marks: true, answer: { select: { marksAwarded: true } } } });
}

export function upsertGrade(attemptId: string, g: { totalScore: number; maxScore: number; percentage: number; letterGrade: string }, db: Db = prisma) {
  return db.grade.upsert({ where: { attemptId }, create: { attemptId, ...g }, update: { ...g, calculatedAt: new Date() } });
}

// --- Answers and essay marks ------------------------------------------------------

/** An answer with its attempt, exam, course and essay marks, for grading. */
export function findAnswerForGrading(answerId: string, db: Db = prisma) {
  return db.answer.findUnique({
    where: { id: answerId },
    include: {
      attemptQuestion: { select: { position: true, marks: true } },
      attempt: { select: { id: true, status: true, student: { select: { id: true, studentNumber: true, fullName: true } }, exam: { include: { course: true } } } },
      essayMarks: { include: { criterionMarks: true, grader: { select: { id: true, fullName: true } } } },
    },
  });
}

/** A question version with options, accepted answers and rubric. */
export function findVersionWithKey(versionId: string, db: Db = prisma) {
  return db.questionVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { options: { orderBy: { position: "asc" } }, acceptedAnswers: true, rubricCriteria: { orderBy: { position: "asc" } } },
  });
}

/** Answers of submitted attempts of an exam, for the grading queue. `essaysOnly` for the second grader. */
export function findAnswersForQueue(examId: string, essaysOnly: boolean, db: Db = prisma) {
  return db.answer.findMany({
    where: {
      attempt: { examId, status: "SUBMITTED" },
      ...(essaysOnly ? { attemptQuestion: { questionVersion: { type: "ESSAY" } }, NOT: { gradingStatus: "NOT_ANSWERED" } } : {}),
    },
    include: {
      attemptQuestion: { select: { position: true, marks: true, questionVersion: { select: { type: true, text: true } } } },
      attempt: { select: { id: true, student: { select: { studentNumber: true, fullName: true } } } },
      essayMarks: { select: { graderId: true, graderRole: true, totalMarks: true } },
    },
    orderBy: [{ attempt: { startedAt: "asc" } }, { attemptQuestion: { position: "asc" } }],
  });
}

export function updateAnswerGrading(
  answerId: string,
  data: { gradingStatus: GradingStatus; marksAwarded: number | null; gradedById: string | null; gradedAt: Date | null },
  db: Db = prisma,
) {
  return db.answer.update({ where: { id: answerId }, data });
}

/** Creates or updates one grader's essay mark and its per-criterion marks. */
export async function saveEssayMark(
  input: { answerId: string; graderId: string; graderRole: GraderRole; totalMarks: number; comment: string | null; criteria: Map<string, number> },
  db: Db = prisma,
) {
  const mark = await db.essayMark.upsert({
    where: { answerId_graderRole: { answerId: input.answerId, graderRole: input.graderRole } },
    create: { answerId: input.answerId, graderId: input.graderId, graderRole: input.graderRole, totalMarks: input.totalMarks, comment: input.comment },
    update: { totalMarks: input.totalMarks, comment: input.comment, graderId: input.graderId },
  });
  // Every criterion is always marked, so updating in place keeps the set complete (no deletes needed).
  for (const [criterionId, marks] of input.criteria) {
    await db.essayCriterionMark.upsert({
      where: { essayMarkId_rubricCriterionId: { essayMarkId: mark.id, rubricCriterionId: criterionId } },
      create: { essayMarkId: mark.id, rubricCriterionId: criterionId, marks },
      update: { marks },
    });
  }
  return mark;
}

export function findEssayMarks(answerId: string, db: Db = prisma) {
  return db.essayMark.findMany({ where: { answerId } });
}
