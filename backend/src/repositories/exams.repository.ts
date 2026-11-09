/** Exams and their selection rules. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export function findExamWithCourse(id: string, db: Db = prisma) {
  return db.exam.findUnique({ where: { id }, include: { course: true } });
}

/** Current versions of a course's active questions that match one rule, oldest question first. */
export function findEligibleVersions(
  courseId: string,
  rule: { questionType: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY"; difficulty: "EASY" | "MEDIUM" | "HARD"; marksPerQuestion: number; topicIds: string[] },
  db: Db = prisma,
) {
  return db.question.findMany({
    where: {
      courseId,
      isArchived: false,
      currentVersion: {
        type: rule.questionType,
        difficulty: rule.difficulty,
        marks: rule.marksPerQuestion,
        ...(rule.topicIds.length ? { topicId: { in: rule.topicIds } } : {}),
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, currentVersionId: true, reviewedVersionId: true,
      currentVersion: { select: { id: true, type: true, text: true, topic: { select: { name: true } }, options: { select: { id: true }, orderBy: { position: "asc" } } } },
    },
  });
}

/** Question ids the lecturer unticked for this exam. */
export async function findExcludedQuestionIds(examId: string, db: Db = prisma) {
  return (await db.examExcludedQuestion.findMany({ where: { examId }, select: { questionId: true } })).map((r) => r.questionId);
}

/** Replaces the unticked questions of an exam. */
export async function replaceExcludedQuestions(examId: string, questionIds: string[], db: Db) {
  await db.examExcludedQuestion.deleteMany({ where: { examId } });
  if (questionIds.length) await db.examExcludedQuestion.createMany({ data: questionIds.map((questionId) => ({ examId, questionId })) });
}

export function countCourseQuestions(courseId: string, ids: string[], db: Db = prisma) {
  return db.question.count({ where: { courseId, id: { in: ids } } });
}

export function findRulesWithTopics(examId: string, db: Db = prisma) {
  return db.examRule.findMany({ where: { examId }, include: { topics: true }, orderBy: { position: "asc" } });
}

/** How many attempts of the exam received each question version. */
export function countVersionUsage(examId: string, db: Db = prisma) {
  return db.attemptQuestion.groupBy({ by: ["questionVersionId"], where: { attempt: { examId } }, _count: { _all: true } });
}

export function findExam(id: string, db: Db = prisma) {
  return db.exam.findUnique({ where: { id } });
}

const examDetailInclude = {
  course: { select: { id: true, code: true, name: true, semester: true, lecturerId: true } },
  secondGrader: { select: { id: true, fullName: true } },
  rules: { include: { topics: { include: { topic: { select: { id: true, name: true } } } } }, orderBy: { position: "asc" as const } },
  schedules: {
    orderBy: { createdAt: "desc" as const },
    include: {
      rooms: { include: { room: { select: { id: true, name: true, building: true, capacity: true, isActive: true } } } },
      invigilators: { include: { invigilator: { select: { id: true, fullName: true } } } },
    },
  },
};

/** An exam with its course, second grader, rules (with topics) and schedules. */
export function findExamDetail(id: string, db: Db = prisma) {
  return db.exam.findUnique({ where: { id }, include: examDetailInclude });
}

/** Exams for the staff list, with open schedules and attempt counts. */
export function listExams(where: Prisma.ExamWhereInput, db: Db = prisma) {
  return db.exam.findMany({
    where,
    include: {
      course: { select: { id: true, code: true, name: true, semester: true } },
      schedules: { where: { status: { in: ["REQUESTED", "APPROVED"] } }, select: { id: true, status: true, windowStart: true, windowEnd: true, durationMinutes: true } },
      _count: { select: { attempts: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function insertExam(data: Prisma.ExamUncheckedCreateInput, db: Db = prisma) {
  return db.exam.create({ data });
}

export function updateExam(id: string, data: Prisma.ExamUncheckedUpdateInput, db: Db = prisma) {
  return db.exam.update({ where: { id }, data });
}

/** Replaces all rules of an exam (only drafts; used rules are protected by foreign keys). */
export async function replaceRules(
  examId: string,
  rules: { questionType: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY"; difficulty: "EASY" | "MEDIUM" | "HARD"; marksPerQuestion: number; questionCount: number; topicIds?: string[] }[],
  db: Db = prisma,
) {
  await db.examRule.deleteMany({ where: { examId } });
  for (const [i, r] of rules.entries()) {
    await db.examRule.create({
      data: {
        examId, position: i + 1, questionType: r.questionType, difficulty: r.difficulty,
        marksPerQuestion: r.marksPerQuestion, questionCount: r.questionCount,
        topics: r.topicIds?.length ? { create: r.topicIds.map((topicId) => ({ topicId })) } : undefined,
      },
    });
  }
}

/** Locks the exam row (FOR UPDATE), e.g. while results are published. */
export async function lockExam(id: string, db: Db) {
  await db.$executeRaw`SELECT id FROM exams WHERE id = ${id}::uuid FOR UPDATE`;
}
