/**
 * Manual grading (sections 4.10 and 4.11, Lecturer).
 *
 * - Short answers marked NEEDS_REVIEW are given marks by the course lecturer.
 *   The lecturer can also change the marks of any non-essay answer while
 *   results are not published (for example a regrade after reopening).
 * - Essays are marked per rubric criterion, with a comment. The marks of all
 *   criteria are required and add up to the essay's mark.
 * - Blind second grading (D7): when the exam has a second grader, both the
 *   course lecturer (FIRST) and the second grader (SECOND) mark each essay
 *   without seeing the other's marks; the second grader also does not see
 *   who the student is. When both are in:
 *     difference <= 20% of the question's marks -> final mark = average (GRADED);
 *     otherwise -> DISCREPANCY, and the course lecturer sets the final mark.
 *   With only one mark in, the essay is AWAITING_SECOND_GRADE.
 * - Grading is closed while results are PUBLISHED: reopen them first.
 * Every change is audited and recalculates the attempt's working grade.
 */
import type { Request } from "express";
import { now } from "../../db/clock.ts";
import type { Tx } from "../../db/prisma.ts";
import { transaction } from "../../db/prisma.ts";
import { findExamWithCourse } from "../../repositories/exams.repository.ts";
import * as gradingRepo from "../../repositories/grading.repository.ts";
import type { GradingStatus } from "../../generated/prisma/enums.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { num, num0 } from "../../lib/format.ts";
import { audit } from "../../services/audit.ts";
import { UNFINISHED_STATUSES } from "../../services/auto-grade.ts";
import { recalcGrade } from "../../services/grades.ts";

/** D7: two essay marks further apart than this share of the question's marks need the lecturer. */
export const DISCREPANCY_THRESHOLD = 0.2;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The final status and mark of an essay from its FIRST/SECOND marks. Pure. */
export function resolveEssay(maxMarks: number, hasSecondGrader: boolean, first: number | null, second: number | null) {
  if (!hasSecondGrader) return first === null ? { status: "PENDING_ESSAY" as const, marks: null } : { status: "GRADED" as const, marks: first };
  if (first === null || second === null) {
    return first === null && second === null ? { status: "PENDING_ESSAY" as const, marks: null } : { status: "AWAITING_SECOND_GRADE" as const, marks: null };
  }
  if (Math.abs(first - second) > DISCREPANCY_THRESHOLD * maxMarks + 1e-9) return { status: "DISCREPANCY" as const, marks: null };
  return { status: "GRADED" as const, marks: round2((first + second) / 2) };
}

/** Loads an answer with everything grading needs, and decides the user's grading role. */
async function loadForGrading(user: AuthUser, answerId: string) {
  const answer = await gradingRepo.findAnswerForGrading(answerId);
  if (!answer || answer.attempt.status !== "SUBMITTED") throw notFound("ANSWER_NOT_FOUND");
  const exam = answer.attempt.exam;
  const isOwner = user.role === "LECTURER" && exam.course.lecturerId === user.id;
  const isSecond = user.role === "LECTURER" && exam.secondGraderId === user.id;
  if (!isOwner && !isSecond) throw notFound("ANSWER_NOT_FOUND");
  const version = await gradingRepo.findVersionWithKey(answer.questionVersionId);
  // The second grader only grades essays.
  if (!isOwner && version.type !== "ESSAY") throw notFound("ANSWER_NOT_FOUND");
  return { answer, exam, version, isOwner, isSecond };
}

function assertGradingOpen(exam: { resultsStatus: string }) {
  if (exam.resultsStatus === "PUBLISHED") throw conflict("RESULTS_PUBLISHED", "Reopen grading before changing marks");
}

/** Short anonymous code shown to the blind second grader instead of the student's name. */
const anonymousCode = (attemptId: string) => `ANON-${attemptId.slice(0, 8).toUpperCase()}`;

/**
 * The grading queue of an exam: answers that need work, and counts per status.
 * The course lecturer sees review items and essays; the second grader sees
 * only essays, anonymised, with only their own marks.
 */
export async function gradingQueue(user: AuthUser, examId: string, filter: { status?: string }) {
  const exam = await findExamWithCourse(examId);
  const isOwner = !!exam && user.role === "LECTURER" && exam.course.lecturerId === user.id;
  const isSecond = !!exam && user.role === "LECTURER" && exam.secondGraderId === user.id;
  if (!exam || (!isOwner && !isSecond)) throw notFound("EXAM_NOT_FOUND");

  const answers = await gradingRepo.findAnswersForQueue(examId, !isOwner);
  const counts: Record<string, number> = {};
  for (const a of answers) counts[a.gradingStatus ?? "UNKNOWN"] = (counts[a.gradingStatus ?? "UNKNOWN"] ?? 0) + 1;

  const needsWork = (a: (typeof answers)[number]) => {
    if (isOwner) return (UNFINISHED_STATUSES as readonly string[]).includes(a.gradingStatus ?? "") && !(a.gradingStatus === "AWAITING_SECOND_GRADE" && a.essayMarks.some((m) => m.graderRole === "FIRST"));
    return !a.essayMarks.some((m) => m.graderRole === "SECOND");
  };
  const items = answers
    .filter((a) => (filter.status ? a.gradingStatus === filter.status : needsWork(a)))
    .map((a) => {
      const mine = a.essayMarks.find((m) => m.graderId === user.id);
      return {
        answerId: a.id,
        attemptId: a.attempt.id,
        student: isOwner ? a.attempt.student : { anonymousCode: anonymousCode(a.attempt.id) },
        questionPosition: a.attemptQuestion.position,
        type: a.attemptQuestion.questionVersion.type,
        questionText: a.attemptQuestion.questionVersion.text,
        maxMarks: num(a.attemptQuestion.marks),
        gradingStatus: isOwner ? a.gradingStatus : mine ? "MARKED_BY_YOU" : "TO_MARK",
        myMark: mine ? num(mine.totalMarks) : null,
      };
    });
  const remaining = isOwner
    ? answers.filter((a) => (UNFINISHED_STATUSES as readonly string[]).includes(a.gradingStatus ?? "")).length
    : answers.filter((a) => !a.essayMarks.some((m) => m.graderRole === "SECOND")).length;
  return { exam: { id: exam.id, title: exam.title, resultsStatus: exam.resultsStatus }, role: isOwner ? "FIRST" : "SECOND", counts: isOwner ? counts : undefined, remaining, items };
}

/** One answer for grading: question, rubric or answer key, the student's response and the marks visible to this grader. */
export async function getAnswerForGrading(user: AuthUser, answerId: string) {
  const { answer, exam, version, isOwner } = await loadForGrading(user, answerId);
  const showOther = isOwner && (answer.gradingStatus === "DISCREPANCY" || answer.gradingStatus === "GRADED");
  const marks = answer.essayMarks
    .filter((m) => m.graderId === user.id || showOther)
    .map((m) => ({
      graderRole: m.graderRole,
      grader: m.grader,
      totalMarks: num(m.totalMarks),
      comment: m.comment,
      criteria: m.criterionMarks.map((c) => ({ criterionId: c.rubricCriterionId, marks: num(c.marks) })),
    }));
  return {
    answerId: answer.id,
    exam: { id: exam.id, title: exam.title, resultsStatus: exam.resultsStatus, hasSecondGrader: !!exam.secondGraderId },
    role: isOwner ? "FIRST" : "SECOND",
    student: isOwner ? answer.attempt.student : { anonymousCode: anonymousCode(answer.attempt.id) },
    question: {
      position: answer.attemptQuestion.position,
      type: version.type,
      text: version.text,
      imageUrl: version.imagePath ? `/api/question-images/${version.imagePath}` : null,
      maxMarks: num(answer.attemptQuestion.marks),
      rubric: version.rubricCriteria.map((r) => ({ id: r.id, description: r.description, maxMarks: num(r.maxMarks) })),
      acceptedAnswers: isOwner ? version.acceptedAnswers.map((a) => a.answerText) : [],
      options: isOwner ? version.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })) : [],
    },
    response: { selectedOptionId: answer.selectedOptionId, textAnswer: answer.textAnswer },
    gradingStatus: isOwner ? answer.gradingStatus : undefined,
    marksAwarded: isOwner ? num(answer.marksAwarded) : undefined,
    marks,
  };
}

/** Saves the final status/marks of an answer and recalculates the grade (inside a transaction). */
async function setAnswerResult(tx: Tx, answerId: string, attemptId: string, status: GradingStatus, marks: number | null, graderId: string) {
  await gradingRepo.updateAnswerGrading(answerId, { gradingStatus: status, marksAwarded: marks, gradedById: marks === null ? null : graderId, gradedAt: marks === null ? null : now() }, tx);
  await recalcGrade(tx, attemptId);
}

/**
 * Course lecturer sets the marks of a non-essay answer (Needs review, or a regrade).
 * @throws 400 MARKS_OUT_OF_RANGE, 400 USE_ESSAY_GRADING, 409 RESULTS_PUBLISHED
 */
export async function setMarks(user: AuthUser, answerId: string, marks: number, comment: string | undefined, req: Request) {
  const { answer, exam, version, isOwner } = await loadForGrading(user, answerId);
  if (!isOwner) throw notFound("ANSWER_NOT_FOUND");
  if (version.type === "ESSAY") throw badRequest("USE_ESSAY_GRADING", "Grade essays with the rubric");
  assertGradingOpen(exam);
  const max = num0(answer.attemptQuestion.marks);
  if (marks < 0 || marks > max) throw badRequest("MARKS_OUT_OF_RANGE", "Marks must be between 0 and the question's marks", { max });
  await transaction(async (tx) => {
    await setAnswerResult(tx, answer.id, answer.attempt.id, "GRADED", round2(marks), user.id);
    await audit(tx, { actorId: user.id, action: "ANSWER_GRADED", entityType: "answer", entityId: answer.id, details: { from: num(answer.marksAwarded), to: round2(marks), previousStatus: answer.gradingStatus, comment }, req });
  });
  return getAnswerForGrading(user, answerId);
}

/**
 * Saves this grader's rubric marks for an essay and resolves the essay's status (D7).
 * @throws 400 RUBRIC_MARKS_REQUIRED / CRITERION_MARKS_OUT_OF_RANGE, 409 RESULTS_PUBLISHED, 409 ESSAY_NOT_ANSWERED
 */
export async function markEssay(user: AuthUser, answerId: string, input: { criteria: { criterionId: string; marks: number }[]; comment?: string }, req: Request) {
  const { answer, exam, version, isOwner } = await loadForGrading(user, answerId);
  if (version.type !== "ESSAY") throw badRequest("NOT_AN_ESSAY", "Only essays are graded with a rubric");
  if (answer.gradingStatus === "NOT_ANSWERED") throw conflict("ESSAY_NOT_ANSWERED", "The student did not answer this essay");
  assertGradingOpen(exam);
  const rubric = new Map(version.rubricCriteria.map((r) => [r.id, num0(r.maxMarks)]));
  const given = new Map(input.criteria.map((c) => [c.criterionId, c.marks]));
  if (given.size !== rubric.size || [...rubric.keys()].some((id) => !given.has(id))) {
    throw badRequest("RUBRIC_MARKS_REQUIRED", "Give marks for every rubric criterion", { criteria: [...rubric.keys()] });
  }
  for (const [id, m] of given) {
    if (m < 0 || m > rubric.get(id)!) throw badRequest("CRITERION_MARKS_OUT_OF_RANGE", "Criterion marks must be between 0 and the criterion maximum", { criterionId: id, max: rubric.get(id)! });
  }
  const total = round2([...given.values()].reduce((s, m) => s + m, 0));
  const graderRole = isOwner ? "FIRST" : "SECOND";

  await transaction(async (tx) => {
    await gradingRepo.saveEssayMark({ answerId: answer.id, graderId: user.id, graderRole, totalMarks: total, comment: input.comment ?? null, criteria: given }, tx);
    const all = await gradingRepo.findEssayMarks(answer.id, tx);
    const first = all.find((m) => m.graderRole === "FIRST");
    const second = all.find((m) => m.graderRole === "SECOND");
    const result = resolveEssay(num0(answer.attemptQuestion.marks), !!exam.secondGraderId, first ? num0(first.totalMarks) : null, second ? num0(second.totalMarks) : null);
    await setAnswerResult(tx, answer.id, answer.attempt.id, result.status, result.marks, user.id);
    await audit(tx, { actorId: user.id, action: "ESSAY_MARKED", entityType: "answer", entityId: answer.id, details: { graderRole, total, resultStatus: result.status }, req });
  });
  return getAnswerForGrading(user, answerId);
}

/** The course lecturer settles an essay whose two marks differ too much (D7). */
export async function resolveDiscrepancy(user: AuthUser, answerId: string, marks: number, req: Request) {
  const { answer, exam, isOwner } = await loadForGrading(user, answerId);
  if (!isOwner) throw notFound("ANSWER_NOT_FOUND");
  if (answer.gradingStatus !== "DISCREPANCY") throw conflict("NO_DISCREPANCY", "This essay has no discrepancy to resolve");
  assertGradingOpen(exam);
  const max = num0(answer.attemptQuestion.marks);
  if (marks < 0 || marks > max) throw badRequest("MARKS_OUT_OF_RANGE", "Marks must be between 0 and the question's marks", { max });
  await transaction(async (tx) => {
    await setAnswerResult(tx, answer.id, answer.attempt.id, "GRADED", round2(marks), user.id);
    await audit(tx, { actorId: user.id, action: "DISCREPANCY_RESOLVED", entityType: "answer", entityId: answer.id, details: { marks: round2(marks) }, req });
  });
  return getAnswerForGrading(user, answerId);
}
