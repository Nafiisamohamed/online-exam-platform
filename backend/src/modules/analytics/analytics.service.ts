/**
 * Analytics endpoints' data (section 4.13 and baseline 6.7). Everything is
 * calculated from the database on each request; no number is hard-coded.
 *
 * - examAnalytics: statistics and per-question analysis of one exam, based on
 *   submitted attempts and their current (working) marks.
 * - dashboard: chart data for the dashboard, scoped to the user: the admin
 *   sees everything, a lecturer only their own courses.
 */
import * as analyticsRepo from "../../repositories/analytics.repository.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { forbidden } from "../../lib/errors.ts";
import { num, num0 } from "../../lib/format.ts";
import { manageableExam } from "../../services/access.ts";
import { type AnswerFact, type AttemptScore, examStatistics, HIGH_THRESHOLD, LOW_THRESHOLD, MIN_STUDENTS, questionStatistics } from "../../services/analytics.ts";

/** Statistics and per-question analytics of one exam (admin or course lecturer). @throws 404 EXAM_NOT_FOUND */
export async function examAnalytics(user: AuthUser, examId: string) {
  const exam = await manageableExam(user, examId);
  const attempts = await analyticsRepo.findSubmittedAttemptsWithMarks(examId);
  const scores: AttemptScore[] = attempts
    .filter((a) => a.grade)
    .map((a) => ({ attemptId: a.id, percentage: num0(a.grade!.percentage), totalScore: num0(a.grade!.totalScore), maxScore: num0(a.grade!.maxScore) }));
  const facts: AnswerFact[] = attempts.flatMap((a) =>
    a.questions.map((q) => ({
      attemptId: a.id,
      questionVersionId: q.questionVersionId,
      type: q.questionVersion.type,
      maxMarks: num0(q.marks),
      awarded: q.answer?.marksAwarded == null ? null : num0(q.answer.marksAwarded),
      gradingStatus: q.answer?.gradingStatus ?? null,
    })),
  );
  const perQuestion = questionStatistics(facts, scores);
  const versions = await analyticsRepo.findVersionLabels(perQuestion.map((q) => q.questionVersionId));
  const v = new Map(versions.map((x) => [x.id, x]));
  return {
    exam: { id: exam.id, title: exam.title, resultsStatus: exam.resultsStatus },
    rules: { minStudents: MIN_STUDENTS, lowThreshold: LOW_THRESHOLD, highThreshold: HIGH_THRESHOLD, groupShare: 0.27, essayCorrectShare: 0.5 },
    statistics: examStatistics(scores),
    questions: perQuestion
      .map((q) => ({ ...q, text: v.get(q.questionVersionId)?.text ?? "", difficulty: v.get(q.questionVersionId)?.difficulty, topic: v.get(q.questionVersionId)?.topic.name, questionId: v.get(q.questionVersionId)?.questionId, versionNumber: v.get(q.questionVersionId)?.versionNumber }))
      .sort((a, b) => (a.difficultyIndex ?? 101) - (b.difficultyIndex ?? 101)),
  };
}

/** Dashboard chart data (admin: all courses; lecturer: own courses). */
export async function dashboard(user: AuthUser) {
  if (user.role !== "ADMIN" && user.role !== "LECTURER") throw forbidden();
  const courseScope = user.role === "ADMIN" ? {} : { lecturerId: user.id };
  const courses = await analyticsRepo.findCoursesForDashboard(courseScope);
  const courseIds = courses.map((c) => c.id);

  const [grades, examsByStatus, attemptsBySubmission, focus] = await analyticsRepo.findCourseStatistics(courseIds);
  const byCourse = courses.map((c) => {
    const g = grades.filter((x) => x.attempt.exam.courseId === c.id).map((x) => num0(x.percentage));
    return { courseId: c.id, code: c.code, name: c.name, semester: c.semester, attempts: g.length, averagePercent: g.length ? Math.round((g.reduce((a, b) => a + b, 0) / g.length) * 100) / 100 : null };
  });
  const distribution = examStatistics(grades.map((g, i) => ({ attemptId: String(i), percentage: num0(g.percentage), totalScore: num0(g.totalScore), maxScore: num0(g.maxScore) }))).distribution;

  const result: Record<string, unknown> = {
    scope: user.role === "ADMIN" ? "ALL" : "OWN_COURSES",
    averageScoreByCourse: byCourse,
    scoreDistribution: distribution,
    examsByStatus: examsByStatus.map((e) => ({ status: e.status, resultsStatus: e.resultsStatus, count: e._count._all })),
    attemptsBySubmission: attemptsBySubmission.map((a) => ({ status: a.status, submissionType: a.submissionType, count: a._count._all })),
    tabSwitches: { attempts: focus._count._all, countedFocusLosses: focus._sum.countedFocusLosses ?? 0 },
  };
  if (user.role === "ADMIN") {
    const [payments, users, sms, roles] = await analyticsRepo.findAdminTotals();
    result.paymentsByProvider = payments.map((p) => ({ provider: p.provider, status: p.status, count: p._count._all, amount: num(p._sum.amount) }));
    result.usersByRole = users.map((u) => ({ role: roles.find((r) => r.id === u.roleId)?.name, count: u._count._all }));
    result.smsByStatus = sms.map((s) => ({ status: s.status, count: s._count._all }));
  }
  return result;
}
