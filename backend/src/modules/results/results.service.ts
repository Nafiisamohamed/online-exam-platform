/**
 * Results: publication, reopening, student views, result slips and grade
 * export (sections 4.12 and 4.13).
 *
 * Publishing (P1):
 * - allowed only when no attempt is still in progress and no answer is waiting
 *   for a lecturer (Needs review, essay, second grade or discrepancy);
 * - creates result_publications row N and one permanent grade_revisions
 *   snapshot per submitted attempt (score, letter, per-question marks,
 *   counted tab switches). Both tables are append-only in the database;
 * - from the second publication on, a reason is required, and only students
 *   whose result actually changed get the RESULTS_CHANGED SMS/notification.
 *   The first publication notifies every student (RESULTS_PUBLISHED).
 * Students only ever see their latest published snapshot, never the working
 * grade, so unpublished results are never visible. While grading is reopened
 * they keep seeing the last published result.
 * Dropped students keep access to their published results (Q9).
 */
import type { Request } from "express";
import { env } from "../../config/env.ts";
import { now } from "../../db/clock.ts";
import { transaction } from "../../db/prisma.ts";
import { findExpiredAttemptsOfExam } from "../../repositories/attempts.repository.ts";
import { findExamWithCourse, lockExam, updateExam } from "../../repositories/exams.repository.ts";
import * as resultsRepo from "../../repositories/results.repository.ts";
import type { Language } from "../../generated/prisma/enums.ts";
import { formatDateTime, LABELS } from "../../i18n/messages.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { num, num0 } from "../../lib/format.ts";
import { buildPdf } from "../../lib/pdf.ts";
import { toCsv } from "../../lib/uploads.ts";
import { manageableExam } from "../../services/access.ts";
import { audit } from "../../services/audit.ts";
import { UNFINISHED_STATUSES } from "../../services/auto-grade.ts";
import { recalcGrade } from "../../services/grades.ts";
import { notifyMany, queueSms } from "../../services/messaging.ts";
import { submitIfExpired } from "../../services/submission.ts";

interface QuestionMark {
  position: number;
  questionVersionId: string;
  maxMarks: number;
  awarded: number;
  status?: string | null;
}

/** Can the exam's results be published now? Returns the blocking counts (empty = ready). */
export async function publicationBlockers(examId: string) {
  const expired = await findExpiredAttemptsOfExam(examId, now());
  for (const a of expired) await submitIfExpired(a);
  const [inProgress, unfinished, submitted] = await resultsRepo.findPublicationCounts(examId, [...UNFINISHED_STATUSES]);
  return {
    inProgress,
    submitted,
    ungraded: Object.fromEntries(unfinished.map((u) => [u.gradingStatus!, u._count._all])) as Record<string, number>,
  };
}

/**
 * Publishes (or republishes) the results of an exam.
 * @throws 409 RESULTS_ALREADY_PUBLISHED, 409 ATTEMPTS_IN_PROGRESS, 409 GRADING_INCOMPLETE { ungraded },
 *         400 NO_SUBMISSIONS, 400 PUBLICATION_REASON_REQUIRED
 */
export async function publishResults(user: AuthUser, examId: string, reason: string | undefined, req: Request) {
  const exam = await manageableExam(user, examId, { ownerOnly: true });
  if (exam.resultsStatus === "PUBLISHED") throw conflict("RESULTS_ALREADY_PUBLISHED", "Reopen grading to publish changes");
  const blockers = await publicationBlockers(examId);
  if (blockers.inProgress) throw conflict("ATTEMPTS_IN_PROGRESS", "Some students are still taking the exam", { inProgress: blockers.inProgress });
  if (Object.keys(blockers.ungraded).length) throw conflict("GRADING_INCOMPLETE", "Grade every essay and answer marked Needs review first", { ungraded: blockers.ungraded });
  if (!blockers.submitted) throw badRequest("NO_SUBMISSIONS", "No student has submitted this exam");

  const result = await transaction(async (tx) => {
    await lockExam(examId, tx);
    const fresh = (await findExamWithCourse(examId, tx))!;
    if (fresh.resultsStatus === "PUBLISHED") throw conflict("RESULTS_ALREADY_PUBLISHED", "Reopen grading to publish changes");
    const number = await resultsRepo.nextPublicationNumber(examId, tx);
    if (number > 1 && !reason?.trim()) throw badRequest("PUBLICATION_REASON_REQUIRED", "Explain why the results are published again");
    const publication = await resultsRepo.insertPublication({ examId, publicationNumber: number, publishedById: user.id, reason: number > 1 ? reason!.trim() : reason?.trim() || null }, tx);

    const attempts = await resultsRepo.findAttemptsToPublish(examId, tx);
    const changed: typeof attempts = [];
    for (const a of attempts) {
      const grade = (await recalcGrade(tx, a.id))!;
      const questionMarks: QuestionMark[] = a.questions.map((q) => ({
        position: q.position, questionVersionId: q.questionVersionId, maxMarks: num0(q.marks), awarded: num0(q.answer?.marksAwarded), status: q.answer?.gradingStatus ?? null,
      }));
      const prev = a.gradeRevisions[0];
      await resultsRepo.insertRevision(
        {
          publicationId: publication.id, attemptId: a.id, revisionNumber: (prev?.revisionNumber ?? 0) + 1,
          totalScore: grade.totalScore, maxScore: grade.maxScore, percentage: grade.percentage, letterGrade: grade.letterGrade,
          questionMarks: questionMarks as unknown as object, countedFocusLosses: a.countedFocusLosses,
        },
        tx,
      );
      const prevMarks = (prev?.questionMarks as unknown as QuestionMark[] | undefined)?.map((m) => `${m.position}:${m.awarded}`).join("|");
      const isChanged = !prev || num0(prev.totalScore) !== num0(grade.totalScore) || prev.letterGrade !== grade.letterGrade || prevMarks !== questionMarks.map((m) => `${m.position}:${m.awarded}`).join("|");
      if (number === 1 || (prev && isChanged)) changed.push(a);
    }
    await updateExam(examId, { resultsStatus: "PUBLISHED" }, tx);

    const template = number === 1 ? "RESULTS_PUBLISHED" : "RESULTS_CHANGED";
    const recipients = changed.filter((a) => a.student.isActive);
    for (const a of recipients) await queueSms(tx, a.student, template, { course: fresh.course.code }, { type: "exam", id: examId });
    await notifyMany(tx, recipients.map((a) => a.student.id), template, { course: fresh.course.code, exam: fresh.title });
    await audit(tx, {
      actorId: user.id, action: number === 1 ? "RESULTS_PUBLISHED" : "RESULTS_REPUBLISHED", entityType: "exam", entityId: examId,
      details: { publication: number, attempts: attempts.length, changedAttempts: number === 1 ? attempts.length : changed.length, reason: reason ?? null }, req,
    });
    return { publicationNumber: number, attempts: attempts.length, notifiedStudents: recipients.length };
  });
  return result;
}

/** PUBLISHED -> REOPENED, so marks can change. Students keep seeing the last published result. */
export async function reopenResults(user: AuthUser, examId: string, reason: string, req: Request) {
  const exam = await manageableExam(user, examId, { ownerOnly: true });
  if (exam.resultsStatus !== "PUBLISHED") throw conflict("RESULTS_NOT_PUBLISHED", "Only published results can be reopened");
  await transaction(async (tx) => {
    await updateExam(examId, { resultsStatus: "REOPENED" }, tx);
    await audit(tx, { actorId: user.id, action: "RESULTS_REOPENED", entityType: "exam", entityId: examId, details: { reason }, req });
  });
  return { resultsStatus: "REOPENED" };
}

/** Staff results table: every enrolled or attempting student, with working and published grades. Absent students are listed. */
export async function examResults(user: AuthUser, examId: string) {
  const exam = await manageableExam(user, examId);
  const blockers = await publicationBlockers(examId);
  const [attempts, enrolled, publications] = await resultsRepo.findExamResultsData(examId, exam.courseId);
  const byStudent = new Map(attempts.map((a) => [a.studentId, a]));
  const ids = new Set([...enrolled.map((e) => e.id), ...attempts.map((a) => a.studentId)]);
  const students = [...ids].map((id) => {
    const a = byStudent.get(id);
    const s = a?.student ?? enrolled.find((e) => e.id === id)!;
    const enrolment = enrolled.find((e) => e.id === id)?.enrolments[0]?.status ?? null;
    if (!a) return { student: { id: s.id, studentNumber: s.studentNumber, fullName: s.fullName }, enrolment, status: "ABSENT", working: null, published: null };
    const rev = a.gradeRevisions[0];
    return {
      student: { id: s.id, studentNumber: s.studentNumber, fullName: s.fullName },
      enrolment,
      attemptId: a.id,
      status: a.status,
      submissionType: a.submissionType,
      submittedAt: a.submittedAt,
      countedFocusLosses: a.countedFocusLosses,
      extensionMinutes: a.totalExtensionMinutes,
      working: a.grade ? { totalScore: num(a.grade.totalScore), maxScore: num(a.grade.maxScore), percentage: num(a.grade.percentage), letterGrade: a.grade.letterGrade } : null,
      published: rev ? { revisionNumber: rev.revisionNumber, totalScore: num(rev.totalScore), maxScore: num(rev.maxScore), percentage: num(rev.percentage), letterGrade: rev.letterGrade } : null,
    };
  });
  students.sort((x, y) => (x.student.studentNumber ?? "").localeCompare(y.student.studentNumber ?? ""));
  return {
    exam: { id: exam.id, title: exam.title, resultsStatus: exam.resultsStatus },
    canPublish: exam.resultsStatus !== "PUBLISHED" && !blockers.inProgress && !Object.keys(blockers.ungraded).length && blockers.submitted > 0,
    blockers,
    publications: publications.map((p) => ({ number: p.publicationNumber, publishedAt: p.publishedAt, publishedBy: p.publishedBy.fullName, reason: p.reason })),
    students,
  };
}

/** Grades as CSV (4.13), with the header in the user's language. Absent students are included. */
export async function gradesCsv(user: AuthUser, examId: string, lang: Language, req: Request) {
  const data = await examResults(user, examId);
  const L = LABELS[lang];
  const header = [L.studentNumber, L.studentName, L.status, L.score, L.maxScore, L.percentage, L.grade, L.focusLosses, L.submissionType, L.publication];
  const rows = data.students.map((s) => {
    const g = s.published ?? s.working;
    return [s.student.studentNumber, s.student.fullName, s.status === "ABSENT" ? L.absent : s.status, g?.totalScore ?? "", g?.maxScore ?? "", g?.percentage ?? "", g?.letterGrade ?? "", s.countedFocusLosses ?? "", s.submissionType ?? "", s.published ? s.published.revisionNumber : ""];
  });
  await audit(null, { actorId: user.id, action: "GRADES_EXPORTED", entityType: "exam", entityId: examId, details: { rows: rows.length }, req });
  return { filename: `grades-${data.exam.title.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}.csv`, csv: toCsv(header, rows) };
}

// --- Student views -------------------------------------------------------------------------

/** The student's published results (latest snapshot per exam). */
export async function myResults(user: AuthUser) {
  const revisions = await resultsRepo.findStudentRevisions(user.id);
  const latest = new Map<string, (typeof revisions)[number]>();
  for (const r of revisions) if (!latest.has(r.attemptId)) latest.set(r.attemptId, r);
  return [...latest.values()].map((r) => ({
    examId: r.attempt.examId,
    exam: r.attempt.exam,
    totalScore: num(r.totalScore),
    maxScore: num(r.maxScore),
    percentage: num(r.percentage),
    letterGrade: r.letterGrade,
    publicationNumber: r.publication.publicationNumber,
    publishedAt: r.publication.publishedAt,
  }));
}

/**
 * One published result with the student's answers. Correct answers (and the
 * accepted answers) are included only when the lecturer allows question review.
 * @throws 404 RESULT_NOT_FOUND when nothing is published (unpublished results are never shown)
 */
export async function myResult(user: AuthUser, examId: string) {
  const attempt = await resultsRepo.findStudentResult(examId, user.id);
  const rev = attempt?.gradeRevisions[0];
  if (!attempt || !rev) throw notFound("RESULT_NOT_FOUND");
  const review = attempt.exam.allowAnswerReview;
  const marks = new Map((rev.questionMarks as unknown as QuestionMark[]).map((m) => [m.position, m]));
  return {
    exam: { id: examId, title: attempt.exam.title, course: attempt.exam.course },
    totalScore: num(rev.totalScore),
    maxScore: num(rev.maxScore),
    percentage: num(rev.percentage),
    letterGrade: rev.letterGrade,
    countedFocusLosses: rev.countedFocusLosses,
    publicationNumber: rev.publication.publicationNumber,
    publishedAt: rev.publication.publishedAt,
    answerReviewAllowed: review,
    questions: attempt.questions.map((q) => {
      const v = q.questionVersion;
      const options = new Map(v.options.map((o) => [o.id, o]));
      const m = marks.get(q.position);
      return {
        position: q.position,
        type: v.type,
        text: v.text,
        imageUrl: v.imagePath ? `/api/question-images/${v.imagePath}` : null,
        maxMarks: num(q.marks),
        awardedMarks: m ? m.awarded : null,
        options: q.optionOrder.map((id) => ({ id, text: options.get(id)?.text ?? "", ...(review ? { isCorrect: !!options.get(id)?.isCorrect } : {}) })),
        yourAnswer: { selectedOptionId: q.answer?.selectedOptionId ?? null, textAnswer: q.answer?.textAnswer ?? null },
        feedback: q.answer?.essayMarks[0]?.comment ?? null,
        ...(review ? { acceptedAnswers: v.acceptedAnswers.map((a) => a.answerText) } : {}),
      };
    }),
  };
}

/** The student's result slip as a PDF in their language (D8). */
export async function resultSlipPdf(user: AuthUser, examId: string, lang: Language) {
  const r = await myResult(user, examId);
  const L = LABELS[lang];
  const pdf = await buildPdf({
    title: L.resultSlipTitle,
    subtitle: `${r.exam.course.code} - ${r.exam.title}`,
    rows: [
      [L.student, user.fullName],
      [L.studentNumber, user.studentNumber ?? ""],
      [L.course, `${r.exam.course.code} ${r.exam.course.name}`],
      [L.exam, r.exam.title],
      [L.score, `${r.totalScore} / ${r.maxScore}`],
      [L.percentage, `${r.percentage}%`],
      [L.grade, r.letterGrade],
      [L.focusLosses, String(r.countedFocusLosses)],
      [L.publication, String(r.publicationNumber)],
      [L.publishedAt, formatDateTime(new Date(r.publishedAt), env.APP_TIMEZONE)],
    ],
    table: { header: ["#", L.question, L.marks], widths: [30, 385, 80], rows: r.questions.map((q) => [String(q.position), q.text.slice(0, 160), `${q.awardedMarks ?? 0} / ${q.maxMarks}`]) },
    footer: `${L.generatedAt}: ${formatDateTime(now(), env.APP_TIMEZONE)}`,
  });
  return { pdf, filename: `result-${r.exam.course.code}-${user.studentNumber ?? "student"}.pdf` };
}

