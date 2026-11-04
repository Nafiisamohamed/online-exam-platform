/**
 * Question bank (section 4.2, Lecturer).
 *
 * - Only the lecturer of a course can read or change its question bank
 *   (anyone else gets 404). Correct answers are therefore only ever sent to the
 *   course's own lecturer.
 * - A question's content lives in versions. Editing a question whose current
 *   version is locked (already drawn by an exam attempt, enforced by a
 *   database trigger) creates a new version; old attempts and results keep
 *   pointing at the version they used. An unlocked version is edited in place.
 * - Duplicate text (ignoring case and extra spaces, D19) among a course's
 *   active questions is refused with 409 DUPLICATE_QUESTION.
 * - Questions are archived, never deleted.
 */
import type { Request } from "express";
import { isUniqueViolation } from "../../db/db-errors.ts";
import type { Tx } from "../../db/prisma.ts";
import { transaction } from "../../db/prisma.ts";
import type { Difficulty, QuestionType } from "../../generated/prisma/enums.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { AppError, conflict, notFound } from "../../lib/errors.ts";
import { normalizeText, num, paged } from "../../lib/format.ts";
import { findCourse } from "../../repositories/courses.repository.ts";
import * as questionsRepo from "../../repositories/questions.repository.ts";
import type { VersionContent } from "../../repositories/questions.repository.ts";
import { audit } from "../../services/audit.ts";
import { type QuestionInput, validateQuestion } from "./question-content.ts";

type VersionRow = NonNullable<Awaited<ReturnType<typeof questionsRepo.findVersionOfQuestion>>>;

/** Full version for the course lecturer (includes the correct answers). */
export function serializeVersion(v: VersionRow) {
  return {
    id: v.id,
    versionNumber: v.versionNumber,
    type: v.type,
    text: v.text,
    imageUrl: v.imagePath ? `/api/question-images/${v.imagePath}` : null,
    imagePath: v.imagePath,
    marks: num(v.marks),
    difficulty: v.difficulty,
    topic: v.topic,
    isLocked: v.isLocked,
    lockedAt: v.lockedAt,
    createdAt: v.createdAt,
    options: v.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, position: o.position })),
    acceptedAnswers: v.acceptedAnswers.map((a) => a.answerText),
    rubric: v.rubricCriteria.map((r) => ({ id: r.id, description: r.description, maxMarks: num(r.maxMarks), position: r.position })),
  };
}

/** Throws 400 QUESTION_INVALID with the list of error codes. */
function assertValid(input: QuestionInput) {
  const errors = validateQuestion(input);
  if (errors.length) throw new AppError(400, "QUESTION_INVALID", "The question is not valid", { errors });
}

/** Loads a course owned by this lecturer, or 404. */
async function ownCourse(user: AuthUser, courseId: string) {
  const course = await findCourse(courseId);
  if (!course || course.lecturerId !== user.id) throw notFound("COURSE_NOT_FOUND");
  return course;
}

/** Loads a question of a course owned by this lecturer, or 404. */
async function ownQuestion(user: AuthUser, id: string) {
  const q = await questionsRepo.findQuestionWithCourse(id);
  if (!q || q.course.lecturerId !== user.id) throw notFound("QUESTION_NOT_FOUND");
  return q;
}

/** Finds or creates a topic by name (topic names are unique per course). */
export async function topicId(tx: Tx, courseId: string, name: string): Promise<string> {
  const clean = name.trim().replace(/\s+/g, " ");
  const found = await questionsRepo.findTopicByName(courseId, clean, tx);
  return found ? found.id : (await questionsRepo.insertTopic(courseId, clean, tx)).id;
}

/** Turns validated input into the stored content of a version (trimmed, accepted answers normalised). */
function toContent(input: QuestionInput, topic: string): VersionContent {
  return {
    type: input.type,
    text: input.text.trim(),
    imagePath: input.imagePath ?? null,
    marks: input.marks,
    difficulty: input.difficulty,
    topicId: topic,
    options: (input.options ?? []).map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
    acceptedAnswers: (input.acceptedAnswers ?? []).map((a) => ({ answerText: a.trim(), normalizedText: normalizeText(a) })),
    rubric: (input.rubric ?? []).map((r) => ({ description: r.description.trim(), maxMarks: r.maxMarks })),
  };
}

/** Creates a question inside an existing transaction (also used by the CSV import). @returns the question id. */
export async function insertQuestion(tx: Tx, courseId: string, createdById: string, input: QuestionInput) {
  const topic = await topicId(tx, courseId, input.topic);
  return questionsRepo.insertQuestion(courseId, createdById, normalizeText(input.text), toContent(input, topic), tx);
}

function duplicateError(error: unknown): never {
  if (isUniqueViolation(error, "questions_active_text_key")) {
    throw conflict("DUPLICATE_QUESTION", "A question with the same text already exists in this course");
  }
  throw error;
}

/** @throws 400 QUESTION_INVALID, 404 COURSE_NOT_FOUND, 409 DUPLICATE_QUESTION */
export async function createQuestion(user: AuthUser, courseId: string, input: QuestionInput, req: Request) {
  assertValid(input);
  await ownCourse(user, courseId);
  try {
    const id = await transaction(async (tx) => {
      const id = await insertQuestion(tx, courseId, user.id, input);
      await audit(tx, { actorId: user.id, action: "QUESTION_CREATED", entityType: "question", entityId: id, details: { type: input.type }, req });
      return id;
    });
    return getQuestion(user, id);
  } catch (error) {
    duplicateError(error);
  }
}

/** Question with its current version and the list of all versions. */
export async function getQuestion(user: AuthUser, id: string) {
  await ownQuestion(user, id);
  const q = await questionsRepo.findQuestionDetail(id);
  return {
    id: q.id,
    courseId: q.courseId,
    isArchived: q.isArchived,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    current: q.currentVersion ? serializeVersion(q.currentVersion) : null,
    versions: q.versions,
  };
}

/** One specific (possibly old) version, for reviewing what past exams used. */
export async function getVersion(user: AuthUser, questionId: string, versionId: string) {
  await ownQuestion(user, questionId);
  const v = await questionsRepo.findVersionOfQuestion(questionId, versionId);
  if (!v) throw notFound("QUESTION_VERSION_NOT_FOUND");
  return serializeVersion(v);
}

/**
 * Edits a question. A locked current version is kept as it is and a new
 * version is created; an unlocked one is changed in place.
 * @returns the question and newVersionCreated
 */
export async function updateQuestion(user: AuthUser, id: string, input: QuestionInput, req: Request) {
  assertValid(input);
  const q = await ownQuestion(user, id);
  if (q.isArchived) throw conflict("QUESTION_ARCHIVED", "Restore the question before editing it");
  try {
    const newVersionCreated = await transaction(async (tx) => {
      // Lock the current version row; a concurrent exam start then waits for this edit.
      const current = await questionsRepo.lockCurrentVersion(id, tx);
      const content = toContent(input, await topicId(tx, q.courseId, input.topic));
      const normalizedText = normalizeText(input.text);
      const created = !current || current.isLocked;
      if (created) {
        const v = await questionsRepo.insertVersion(id, await questionsRepo.nextVersionNumber(id, tx), content, tx);
        await questionsRepo.updateQuestion(id, { currentVersionId: v.id, normalizedText }, tx);
      } else {
        await questionsRepo.replaceVersionContent(current.id, content, tx);
        await questionsRepo.updateQuestion(id, { normalizedText }, tx);
      }
      await audit(tx, { actorId: user.id, action: "QUESTION_UPDATED", entityType: "question", entityId: id, details: { newVersion: created }, req });
      return created;
    });
    return { question: await getQuestion(user, id), newVersionCreated };
  } catch (error) {
    duplicateError(error);
  }
}

/** Archives (hides from new exams) or restores a question. Restoring can hit 409 DUPLICATE_QUESTION. */
export async function setArchived(user: AuthUser, id: string, archived: boolean, req: Request) {
  await ownQuestion(user, id);
  try {
    await transaction(async (tx) => {
      await questionsRepo.updateQuestion(id, { isArchived: archived }, tx);
      await audit(tx, { actorId: user.id, action: archived ? "QUESTION_ARCHIVED" : "QUESTION_RESTORED", entityType: "question", entityId: id, req });
    });
  } catch (error) {
    duplicateError(error);
  }
  return getQuestion(user, id);
}

/** Lists a course's question bank with filters (current versions). */
export async function listQuestions(
  user: AuthUser,
  courseId: string,
  f: { type?: QuestionType; difficulty?: Difficulty; topicId?: string; search?: string; archived?: boolean; page: number; pageSize: number },
) {
  await ownCourse(user, courseId);
  const where = {
    courseId,
    isArchived: f.archived ?? false,
    ...(f.search ? { normalizedText: { contains: normalizeText(f.search) } } : {}),
    currentVersion: {
      ...(f.type ? { type: f.type } : {}),
      ...(f.difficulty ? { difficulty: f.difficulty } : {}),
      ...(f.topicId ? { topicId: f.topicId } : {}),
    },
  };
  const [rows, total] = await questionsRepo.listQuestions(where, (f.page - 1) * f.pageSize, f.pageSize);
  const items = rows.map((q) => ({ id: q.id, isArchived: q.isArchived, current: q.currentVersion ? serializeVersion(q.currentVersion) : null }));
  return paged(items, total, f.page, f.pageSize);
}

/** Counts of active questions per type / difficulty / marks, to help build exam rules. */
export async function bankSummary(user: AuthUser, courseId: string) {
  await ownCourse(user, courseId);
  const rows = await questionsRepo.countBankByRule(courseId);
  return rows.map((r) => ({ type: r.type, difficulty: r.difficulty, marks: Number(r.marks), count: Number(r.count) }));
}

/** Topics of the lecturer's course. @throws 404 COURSE_NOT_FOUND */
export async function listTopics(user: AuthUser, courseId: string) {
  await ownCourse(user, courseId);
  return questionsRepo.listTopics(courseId);
}

/** Adds a topic (or returns the existing one with the same name). @throws 404 COURSE_NOT_FOUND */
export async function createTopic(user: AuthUser, courseId: string, name: string) {
  await ownCourse(user, courseId);
  return transaction(async (tx) => questionsRepo.findTopic(await topicId(tx, courseId, name), tx));
}
