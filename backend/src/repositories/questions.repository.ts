/** Question bank: questions, versions, options, accepted answers, rubrics and topics. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Difficulty, QuestionType } from "../generated/prisma/enums.ts";
import type { Prisma } from "../generated/prisma/client.ts";

/** Version with everything the lecturer's editor shows. */
export const versionInclude = {
  topic: { select: { id: true, name: true } },
  options: { orderBy: { position: "asc" as const } },
  acceptedAnswers: true,
  rubricCriteria: { orderBy: { position: "asc" as const } },
};

/** The content of one version (children are written with it). */
export interface VersionContent {
  type: QuestionType;
  text: string;
  imagePath: string | null;
  marks: number;
  difficulty: Difficulty;
  topicId: string;
  options: { text: string; isCorrect: boolean }[];
  acceptedAnswers: { answerText: string; normalizedText: string }[];
  rubric: { description: string; maxMarks: number }[];
}

export function findQuestionWithCourse(id: string, db: Db = prisma) {
  return db.question.findUnique({ where: { id }, include: { course: true } });
}

/** The question, its current version in full, and the list of all versions. */
export function findQuestionDetail(id: string, db: Db = prisma) {
  return db.question.findUniqueOrThrow({
    where: { id },
    include: { currentVersion: { include: versionInclude }, reviewedBy: { select: { id: true, fullName: true } }, versions: { select: { id: true, versionNumber: true, isLocked: true, createdAt: true }, orderBy: { versionNumber: "asc" } } },
  });
}

export function findVersionOfQuestion(questionId: string, versionId: string, db: Db = prisma) {
  return db.questionVersion.findFirst({ where: { id: versionId, questionId }, include: versionInclude });
}

/** Reviewed and all active questions of a course (reviewed = the current version was reviewed). */
export function countReviewed(courseId: string, db: Db = prisma) {
  return Promise.all([
    db.question.count({ where: { courseId, isArchived: false, reviewedVersionId: { not: null } } }),
    db.question.count({ where: { courseId, isArchived: false } }),
  ]);
}

export function listQuestions(where: Prisma.QuestionWhereInput, skip: number, take: number, db: Db = prisma) {
  return Promise.all([
    db.question.findMany({ where, include: { currentVersion: { include: versionInclude }, reviewedBy: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "asc" }, skip, take }),
    db.question.count({ where }),
  ]);
}

/** Active questions per type, difficulty and marks. */
export function countBankByRule(courseId: string, db: Db = prisma) {
  return db.$queryRaw<{ type: string; difficulty: string; marks: string; count: bigint }[]>`
    SELECT v.type::text, v.difficulty::text, v.marks::text, count(*) AS count
      FROM questions q JOIN question_versions v ON v.id = q.current_version_id
     WHERE q.course_id = ${courseId}::uuid AND NOT q.is_archived
     GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
}

/** Normalised texts of the course's active questions (for duplicate checks). */
export async function findActiveTexts(courseId: string, db: Db = prisma) {
  return (await db.question.findMany({ where: { courseId, isArchived: false }, select: { normalizedText: true } })).map((q) => q.normalizedText);
}

// --- Topics -------------------------------------------------------------------------

export function findTopicByName(courseId: string, name: string, db: Db = prisma) {
  return db.topic.findFirst({ where: { courseId, name: { equals: name, mode: "insensitive" } } });
}

export function insertTopic(courseId: string, name: string, db: Db = prisma) {
  return db.topic.create({ data: { courseId, name } });
}

export function findTopic(id: string, db: Db = prisma) {
  return db.topic.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } });
}

export function listTopics(courseId: string, db: Db = prisma) {
  return db.topic.findMany({ where: { courseId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** How many of these topic ids belong to the course. */
export function countTopicsInCourse(courseId: string, topicIds: string[], db: Db = prisma) {
  return db.topic.count({ where: { id: { in: topicIds }, courseId } });
}

// --- Writing questions and versions --------------------------------------------------

async function insertChildren(versionId: string, c: VersionContent, db: Db) {
  if (c.options.length) {
    await db.questionOption.createMany({ data: c.options.map((o, i) => ({ questionVersionId: versionId, text: o.text, isCorrect: o.isCorrect, position: i + 1 })) });
  }
  if (c.acceptedAnswers.length) {
    await db.acceptedAnswer.createMany({ data: c.acceptedAnswers.map((a) => ({ questionVersionId: versionId, ...a })) });
  }
  if (c.rubric.length) {
    await db.rubricCriterion.createMany({ data: c.rubric.map((r, i) => ({ questionVersionId: versionId, description: r.description, maxMarks: r.maxMarks, position: i + 1 })) });
  }
}

/** Inserts a version and its options, accepted answers and rubric. */
export async function insertVersion(questionId: string, versionNumber: number, c: VersionContent, db: Db = prisma) {
  const v = await db.questionVersion.create({
    data: { questionId, versionNumber, type: c.type, text: c.text, imagePath: c.imagePath, marks: c.marks, difficulty: c.difficulty, topicId: c.topicId },
  });
  await insertChildren(v.id, c, db);
  return v;
}

/** Creates a question with version 1 as its current version. @returns the question id. */
export async function insertQuestion(courseId: string, createdById: string, normalizedText: string, c: VersionContent, db: Db = prisma) {
  const q = await db.question.create({ data: { courseId, createdById, normalizedText } });
  const v = await insertVersion(q.id, 1, c, db);
  await db.question.update({ where: { id: q.id }, data: { currentVersionId: v.id } });
  return q.id;
}

/** Locks the current version row (FOR UPDATE) and returns it, or null. */
export async function lockCurrentVersion(questionId: string, db: Db) {
  const rows = await db.$queryRaw<{ id: string; is_locked: boolean }[]>`
    SELECT v.id, v.is_locked FROM question_versions v
    JOIN questions q ON q.current_version_id = v.id WHERE q.id = ${questionId}::uuid FOR UPDATE OF v`;
  return rows[0] ? { id: rows[0].id, isLocked: rows[0].is_locked } : null;
}

export async function nextVersionNumber(questionId: string, db: Db = prisma) {
  const max = await db.questionVersion.aggregate({ where: { questionId }, _max: { versionNumber: true } });
  return (max._max.versionNumber ?? 0) + 1;
}

/** Rewrites an UNLOCKED version in place (database triggers refuse locked ones). */
export async function replaceVersionContent(versionId: string, c: VersionContent, db: Db = prisma) {
  await db.questionOption.deleteMany({ where: { questionVersionId: versionId } });
  await db.acceptedAnswer.deleteMany({ where: { questionVersionId: versionId } });
  await db.rubricCriterion.deleteMany({ where: { questionVersionId: versionId } });
  await db.questionVersion.update({
    where: { id: versionId },
    data: { type: c.type, text: c.text, imagePath: c.imagePath, marks: c.marks, difficulty: c.difficulty, topicId: c.topicId },
  });
  await insertChildren(versionId, c, db);
}

export function updateQuestion(id: string, data: { currentVersionId?: string; normalizedText?: string; isArchived?: boolean; reviewedVersionId?: string | null; reviewedById?: string | null; reviewedAt?: Date | null }, db: Db = prisma) {
  return db.question.update({ where: { id }, data });
}

/** Question versions with their topic, by id (for previews and analytics). */
export function findVersions(ids: string[], db: Db = prisma) {
  return db.questionVersion.findMany({
    where: { id: { in: ids } },
    include: { options: true, acceptedAnswers: true, rubricCriteria: { orderBy: { position: "asc" } }, topic: { select: { name: true } } },
  });
}
