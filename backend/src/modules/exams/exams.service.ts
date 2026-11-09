/**
 * Examination builder (section 4.4, Lecturer).
 *
 * An exam has a title, instructions, selection rules, shuffle options, the
 * answer-review setting, an optional fee (D1, P9) and an optional blind second
 * grader (D7).
 *
 * Rules:
 * - each rule is "N questions of type T, difficulty D, worth M marks each",
 *   optionally limited to topics; one rule per type + difficulty + marks;
 * - rules can only be saved when the question bank has enough eligible
 *   questions for every rule (400 EXAM_NOT_ENOUGH_QUESTIONS lists the gaps);
 * - the lecturer can preview one sample generated exam (nothing is saved or
 *   locked);
 * - publishing (DRAFT -> PUBLISHED) re-checks the rules; after that the rules,
 *   fee and shuffle settings are fixed, because students may already be sitting it.
 */
import type { Request } from "express";
import { env } from "../../config/env.ts";
import { transaction } from "../../db/prisma.ts";
import { findCourse } from "../../repositories/courses.repository.ts";
import * as examsRepo from "../../repositories/exams.repository.ts";
import { countTopicsInCourse, findVersions } from "../../repositories/questions.repository.ts";
import { findUserWithRole } from "../../repositories/users.repository.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors.ts";
import { num, num0 } from "../../lib/format.ts";
import { manageableExam } from "../../services/access.ts";
import { audit } from "../../services/audit.ts";
import { generateExam, shortages } from "../../services/exam-generator.ts";
import { examPoolFilter, loadRuleSpecs, type PoolFilter, reviewedCandidates, type RuleSpec, rulesWithPools } from "../../services/exam-pool.ts";

export interface RuleInput {
  questionType: RuleSpec["questionType"];
  difficulty: RuleSpec["difficulty"];
  marksPerQuestion: number;
  questionCount: number;
  topicIds?: string[];
}

export type ExamType = "QUIZ" | "MIDTERM" | "FINAL";

export interface ExamSettings {
  examType?: ExamType;
  title?: string;
  instructions?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  allowAnswerReview?: boolean;
  feeAmount?: number;
  feeCurrency?: string;
  secondGraderId?: string | null;
}

type ExamRow = NonNullable<Awaited<ReturnType<typeof loadExam>>>;
const loadExam = (id: string) => examsRepo.findExamDetail(id);

/** Staff view of an exam, including how many eligible questions each rule has. */
async function serializeExam(e: ExamRow) {
  const filter = await examPoolFilter(e);
  const pools = await rulesWithPools(e.courseId, await loadRuleSpecs(e.id), undefined, undefined, filter);
  const available = new Map(pools.map((p) => [p.id, p.pool.length]));
  const totalMarks = e.rules.reduce((s, r) => s + num0(r.marksPerQuestion) * r.questionCount, 0);
  return {
    id: e.id,
    course: { id: e.course.id, code: e.course.code, name: e.course.name, semester: e.course.semester },
    title: e.title,
    examType: e.examType,
    reviewedOnly: e.reviewedOnly,
    excludedQuestions: filter.excludedQuestionIds?.length ?? 0,
    instructions: e.instructions,
    shuffleQuestions: e.shuffleQuestions,
    shuffleOptions: e.shuffleOptions,
    allowAnswerReview: e.allowAnswerReview,
    feeAmount: num(e.feeAmount),
    feeCurrency: e.feeCurrency,
    status: e.status,
    resultsStatus: e.resultsStatus,
    secondGrader: e.secondGrader,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    totalQuestions: e.rules.reduce((s, r) => s + r.questionCount, 0),
    totalMarks: Math.round(totalMarks * 100) / 100,
    rules: e.rules.map((r) => ({
      id: r.id,
      position: r.position,
      questionType: r.questionType,
      difficulty: r.difficulty,
      marksPerQuestion: num(r.marksPerQuestion),
      questionCount: r.questionCount,
      topics: r.topics.map((t) => t.topic),
      available: available.get(r.id) ?? 0,
    })),
    schedules: e.schedules.map((s) => ({
      id: s.id,
      status: s.status,
      windowStart: s.windowStart,
      windowEnd: s.windowEnd,
      durationMinutes: s.durationMinutes,
      rejectionReason: s.rejectionReason,
      decidedAt: s.decidedAt,
      rooms: s.rooms.map((r) => r.room),
      invigilators: s.invigilators.map((i) => i.invigilator),
    })),
  };
}

/** Checks the fee and the second grader. */
async function checkSettings(s: ExamSettings, courseLecturerId: string) {
  if (s.feeCurrency && !env.SUPPORTED_CURRENCIES.includes(s.feeCurrency)) {
    throw badRequest("CURRENCY_NOT_SUPPORTED", "Choose a supported currency", { supported: env.SUPPORTED_CURRENCIES });
  }
  if (s.secondGraderId) {
    const g = await findUserWithRole(s.secondGraderId);
    if (!g || g.role.name !== "LECTURER" || !g.isActive) throw badRequest("SECOND_GRADER_INVALID", "The second grader must be an active lecturer");
    if (g.id === courseLecturerId) throw badRequest("SECOND_GRADER_IS_LECTURER", "The second grader must be a different lecturer");
  }
}

/**
 * Validates rules: unique combinations, topics from the course, enough questions. Rules are
 * saved on draft exams, which publish with reviewed questions only, so only reviewed (and not
 * unticked) questions count.
 */
async function checkRules(courseId: string, rules: RuleInput[], excludedQuestionIds: string[] = []) {
  const keys = rules.map((r) => `${r.questionType}|${r.difficulty}|${r.marksPerQuestion}`);
  if (new Set(keys).size !== keys.length) throw badRequest("RULE_DUPLICATE", "Use one rule per type, difficulty and mark value");
  const topicIds = [...new Set(rules.flatMap((r) => r.topicIds ?? []))];
  if (topicIds.length) {
    const found = await countTopicsInCourse(courseId, topicIds);
    if (found !== topicIds.length) throw badRequest("TOPIC_NOT_IN_COURSE", "Every topic must belong to the course");
  }
  const specs: RuleSpec[] = rules.map((r, i) => ({ id: `new-${i}`, position: i + 1, topicIds: r.topicIds ?? [], ...r }));
  const short = shortages(await rulesWithPools(courseId, specs, undefined, undefined, { reviewedOnly: true, excludedQuestionIds }));
  if (short.length) {
    throw new AppError(400, "EXAM_NOT_ENOUGH_QUESTIONS", "There are not enough reviewed questions for every rule", { rules: short });
  }
}

/** Creates a DRAFT exam for one of the lecturer's courses (rules optional). */
export async function createExam(user: AuthUser, courseId: string, s: ExamSettings & { title: string; examType: ExamType; rules?: RuleInput[] }, req: Request) {
  const course = await findCourse(courseId);
  if (!course || course.lecturerId !== user.id) throw notFound("COURSE_NOT_FOUND");
  await checkSettings(s, course.lecturerId);
  if (s.rules?.length) await checkRules(courseId, s.rules);
  const id = await transaction(async (tx) => {
    const exam = await examsRepo.insertExam(
      {
        courseId, createdById: user.id, title: s.title, examType: s.examType, instructions: s.instructions ?? "",
        shuffleQuestions: s.shuffleQuestions ?? true, shuffleOptions: s.shuffleOptions ?? true,
        allowAnswerReview: s.allowAnswerReview ?? false, feeAmount: s.feeAmount ?? 0,
        feeCurrency: s.feeCurrency ?? env.DEFAULT_CURRENCY, secondGraderId: s.secondGraderId ?? null,
      },
      tx,
    );
    if (s.rules?.length) await examsRepo.replaceRules(exam.id, s.rules, tx);
    await audit(tx, { actorId: user.id, action: "EXAM_CREATED", entityType: "exam", entityId: exam.id, details: { title: s.title }, req });
    return exam.id;
  });
  return serializeExam((await loadExam(id))!);
}

/** Staff view of one exam. @throws 404 EXAM_NOT_FOUND */
export async function getExam(user: AuthUser, id: string) {
  await manageableExam(user, id, { allowSecondGrader: true });
  return serializeExam((await loadExam(id))!);
}

/** Exams the staff user may manage: admin all, lecturer own courses (and exams they second-grade). */
export async function listExams(user: AuthUser, q: { courseId?: string; status?: "DRAFT" | "PUBLISHED" }) {
  const scope =
    user.role === "ADMIN" ? {} : { OR: [{ course: { lecturerId: user.id } }, { secondGraderId: user.id }] };
  const rows = await examsRepo.listExams({ ...scope, ...(q.courseId ? { courseId: q.courseId } : {}), ...(q.status ? { status: q.status } : {}) });
  return rows.map((e) => ({
    id: e.id, title: e.title, examType: e.examType, course: e.course, status: e.status, resultsStatus: e.resultsStatus,
    feeAmount: num(e.feeAmount), feeCurrency: e.feeCurrency, schedules: e.schedules, attempts: e._count.attempts,
    isSecondGrader: e.secondGraderId === user.id,
  }));
}

/**
 * Updates settings. While DRAFT everything can change; once PUBLISHED only the
 * title, instructions, answer review and second grader.
 * @throws 409 EXAM_PUBLISHED_LOCKED
 */
export async function updateExam(user: AuthUser, id: string, s: ExamSettings, req: Request) {
  const exam = await manageableExam(user, id, { ownerOnly: true });
  if (exam.status === "PUBLISHED") {
    const locked = (["examType", "shuffleQuestions", "shuffleOptions", "feeAmount", "feeCurrency"] as const).filter((k) => s[k] !== undefined);
    if (locked.length) throw conflict("EXAM_PUBLISHED_LOCKED", "These settings cannot change after publishing", { fields: locked });
  }
  await checkSettings(s, exam.course.lecturerId);
  await transaction(async (tx) => {
    await examsRepo.updateExam(id, s, tx);
    await audit(tx, { actorId: user.id, action: "EXAM_UPDATED", entityType: "exam", entityId: id, details: { fields: Object.keys(s) }, req });
  });
  return serializeExam((await loadExam(id))!);
}

/** Replaces all rules of a DRAFT exam (checked for enough questions). */
export async function setRules(user: AuthUser, id: string, rules: RuleInput[], req: Request) {
  const exam = await manageableExam(user, id, { ownerOnly: true });
  if (exam.status !== "DRAFT") throw conflict("EXAM_PUBLISHED_LOCKED", "Rules cannot change after publishing");
  await checkRules(exam.courseId, rules, await examsRepo.findExcludedQuestionIds(id));
  await transaction(async (tx) => {
    await examsRepo.replaceRules(id, rules, tx);
    await audit(tx, { actorId: user.id, action: "EXAM_RULES_UPDATED", entityType: "exam", entityId: id, details: { rules: rules.length }, req });
  });
  return serializeExam((await loadExam(id))!);
}

/** DRAFT -> PUBLISHED. @throws 400 EXAM_HAS_NO_RULES, 400 EXAM_NOT_ENOUGH_QUESTIONS, 409 EXAM_ALREADY_PUBLISHED */
export async function publishExam(user: AuthUser, id: string, req: Request) {
  const exam = await manageableExam(user, id, { ownerOnly: true });
  if (exam.status === "PUBLISHED") throw conflict("EXAM_ALREADY_PUBLISHED", "The exam is already published");
  const specs = await loadRuleSpecs(id);
  if (specs.length === 0) throw badRequest("EXAM_HAS_NO_RULES", "Add at least one question rule first");
  // From now on this exam draws only reviewed questions (and never the unticked ones).
  const short = shortages(await rulesWithPools(exam.courseId, specs, undefined, undefined, await examPoolFilter(exam)));
  if (short.length) throw new AppError(400, "EXAM_NOT_ENOUGH_QUESTIONS", "There are not enough reviewed questions for every rule", { rules: short });
  await transaction(async (tx) => {
    await examsRepo.updateExam(id, { status: "PUBLISHED", reviewedOnly: true }, tx);
    await audit(tx, { actorId: user.id, action: "EXAM_PUBLISHED", entityType: "exam", entityId: id, req });
  });
  return serializeExam((await loadExam(id))!);
}

/**
 * One sample generated exam for the lecturer to check (4.4). Shows the
 * correct answers. Nothing is saved and no question is locked.
 */
export async function previewExam(user: AuthUser, id: string) {
  const exam = await manageableExam(user, id, { ownerOnly: true });
  const specs = await loadRuleSpecs(id);
  if (specs.length === 0) throw badRequest("EXAM_HAS_NO_RULES", "Add at least one question rule first");
  const pools = await rulesWithPools(exam.courseId, specs, undefined, undefined, await examPoolFilter(exam));
  const short = shortages(pools);
  if (short.length) throw new AppError(400, "EXAM_NOT_ENOUGH_QUESTIONS", "The question bank does not have enough questions for every rule", { rules: short });
  const items = generateExam(pools, { shuffleQuestions: exam.shuffleQuestions, shuffleOptions: exam.shuffleOptions });
  const versions = await findVersions(items.map((i) => i.versionId));
  const byId = new Map(versions.map((v) => [v.id, v]));
  const questions = items.map((item) => {
    const v = byId.get(item.versionId)!;
    const options = new Map(v.options.map((o) => [o.id, o]));
    return {
      position: item.position,
      type: v.type,
      difficulty: v.difficulty,
      topic: v.topic.name,
      text: v.text,
      imageUrl: v.imagePath ? `/api/question-images/${v.imagePath}` : null,
      marks: item.marks,
      options: item.optionOrder.map((oid) => ({ id: oid, text: options.get(oid)!.text, isCorrect: options.get(oid)!.isCorrect })),
      acceptedAnswers: v.acceptedAnswers.map((a) => a.answerText),
      rubric: v.rubricCriteria.map((r) => ({ description: r.description, maxMarks: num(r.maxMarks) })),
    };
  });
  return { sample: true, totalMarks: Math.round(questions.reduce((s, q) => s + q.marks, 0) * 100) / 100, questions };
}

/**
 * The tick list for the lecturer: for each rule, every reviewed question that matches it, and
 * whether it is unticked for this exam. Students then get random sets drawn from the ticked
 * questions, the same number of each type, difficulty and mark value per rule.
 */
export async function questionPool(user: AuthUser, id: string) {
  const exam = await manageableExam(user, id, { ownerOnly: true });
  const excluded = new Set(await examsRepo.findExcludedQuestionIds(id));
  const specs = await loadRuleSpecs(id);
  const rules = [];
  for (const r of specs) {
    const candidates = await reviewedCandidates(exam.courseId, r);
    rules.push({
      id: r.id, position: r.position, questionType: r.questionType, difficulty: r.difficulty, marksPerQuestion: r.marksPerQuestion,
      questionCount: r.questionCount,
      questions: candidates.map((q) => ({ ...q, included: !excluded.has(q.questionId) })),
    });
  }
  return { status: exam.status, reviewedOnly: exam.status === "DRAFT" ? true : exam.reviewedOnly, rules };
}

/**
 * Saves which questions are unticked for a DRAFT exam. Every rule must still have enough
 * ticked reviewed questions. @throws 409 EXAM_PUBLISHED_LOCKED, 400 QUESTION_NOT_IN_COURSE,
 * 400 EXAM_NOT_ENOUGH_QUESTIONS { rules }
 */
export async function setExcludedQuestions(user: AuthUser, id: string, questionIds: string[], req: Request) {
  const exam = await manageableExam(user, id, { ownerOnly: true });
  if (exam.status !== "DRAFT") throw conflict("EXAM_PUBLISHED_LOCKED", "The question selection cannot change after publishing");
  const ids = [...new Set(questionIds)];
  if (ids.length && (await examsRepo.countCourseQuestions(exam.courseId, ids)) !== ids.length) throw badRequest("QUESTION_NOT_IN_COURSE", "Every question must belong to the exam's course");
  const filter: PoolFilter = { reviewedOnly: true, excludedQuestionIds: ids };
  const short = shortages(await rulesWithPools(exam.courseId, await loadRuleSpecs(id), undefined, undefined, filter));
  if (short.length) throw new AppError(400, "EXAM_NOT_ENOUGH_QUESTIONS", "Too many questions unticked: a rule no longer has enough", { rules: short });
  await transaction(async (tx) => {
    await examsRepo.replaceExcludedQuestions(id, ids, tx);
    await audit(tx, { actorId: user.id, action: "EXAM_QUESTIONS_SELECTED", entityType: "exam", entityId: id, details: { unticked: ids.length }, req });
  });
  return serializeExam((await loadExam(id))!);
}
