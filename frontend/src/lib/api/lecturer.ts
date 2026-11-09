/**
 * Lecturer endpoints. Paths, bodies and responses follow docs/api.md; the
 * backend checks every request against the lecturer's own courses (anything
 * else answers 404), so these functions never filter access themselves.
 * Screens use these functions for writes and the GET paths with useApi().
 */
import type { ExamDetail, Schedule, ExamType } from "@/types/admin";
import type {
  ExamPreview, ExamSettingsInput, GradingAnswer, QuestionDetail, QuestionImportPreview, QuestionImportResult, QuestionInput,
  QuestionType, Difficulty, RuleInput, ScheduleRequestInput, Topic, LecturerExam,
} from "@/types/lecturer";
import { api, query } from "./client";
import { invalidate } from "./use-api";

export const lecturerPaths = {
  /** The lecturer's own courses (the API scopes /courses to the user). */
  courses: "/courses",
  course: (id: string) => `/courses/${id}`,
  enrolments: (courseId: string) => `/courses/${courseId}/enrolments`,
  questions: (courseId: string, q: { type?: QuestionType; difficulty?: Difficulty; topicId?: string; search?: string; archived?: boolean; review?: "REVIEWED" | "DRAFT"; page?: number; pageSize?: number }) =>
    `/courses/${courseId}/questions${query(q)}`,
  question: (id: string) => `/questions/${id}`,
  questionVersion: (id: string, versionId: string) => `/questions/${id}/versions/${versionId}`,
  topics: (courseId: string) => `/courses/${courseId}/topics`,
  bankSummary: (courseId: string) => `/courses/${courseId}/question-summary`,
  questionTemplate: "/imports/templates/questions.csv",
  /** Own exams plus exams where the lecturer is the blind second grader. */
  exams: (q: { courseId?: string; status?: "DRAFT" | "PUBLISHED" } = {}) => `/exams${query(q)}`,
  exam: (id: string) => `/exams/${id}`,
  preview: (id: string) => `/exams/${id}/preview`,
  schedules: "/schedules",
  rooms: "/rooms?active=true",
  staff: (role: "LECTURER" | "INVIGILATOR") => `/staff?role=${role}`,
  grading: (examId: string, status?: string) => `/exams/${examId}/grading${query({ status })}`,
  gradingAnswer: (answerId: string) => `/grading/answers/${answerId}`,
  results: (examId: string) => `/exams/${examId}/results`,
  /** Read-only review of one closed attempt's saved answers (submitted or terminated). */
  attemptAnswers: (examId: string, attemptId: string) => `/exams/${examId}/attempts/${attemptId}/answers`,
  gradesCsv: (examId: string, lang: "so" | "en") => `/exams/${examId}/grades.csv?lang=${lang}`,
  examAnalytics: (examId: string) => `/exams/${examId}/analytics`,
  dashboard: "/analytics/dashboard",
  notifications: "/notifications",
} as const;

// --- Question bank --------------------------------------------------------------------

export async function createQuestion(courseId: string, input: QuestionInput) {
  const res = await api<{ question: QuestionDetail }>(`/courses/${courseId}/questions`, { method: "POST", json: input });
  invalidate(`/courses/${courseId}/questions`, `/courses/${courseId}/question-summary`, `/courses/${courseId}/topics`, "/exams");
  return res.question;
}

/** Editing a question already used by an exam attempt creates a new version (newVersionCreated). */
export async function updateQuestion(id: string, courseId: string, input: QuestionInput) {
  const res = await api<{ question: QuestionDetail; newVersionCreated: boolean }>(`/questions/${id}`, { method: "PUT", json: input });
  invalidate(`/questions/${id}`, `/courses/${courseId}/questions`, `/courses/${courseId}/question-summary`, `/courses/${courseId}/topics`, "/exams");
  return res;
}

export async function setQuestionArchived(id: string, courseId: string, archived: boolean) {
  const res = await api<{ question: QuestionDetail }>(`/questions/${id}/${archived ? "archive" : "restore"}`, { method: "POST" });
  invalidate(`/questions/${id}`, `/courses/${courseId}/questions`, `/courses/${courseId}/question-summary`, "/exams");
  return res.question;
}

/** PNG, JPEG, GIF or WebP, at most 2 MB. Returns the path to put in the question body. */
export function uploadQuestionImage(file: File) {
  const body = new FormData();
  body.set("image", file);
  return api<{ imagePath: string; imageUrl: string }>("/question-images", { method: "POST", body });
}

export async function createTopic(courseId: string, name: string) {
  const res = await api<{ topic: Topic }>(`/courses/${courseId}/topics`, { method: "POST", json: { name } });
  invalidate(`/courses/${courseId}/topics`);
  return res.topic;
}

export function previewQuestionImport(courseId: string, file: File) {
  const body = new FormData();
  body.set("file", file);
  return api<QuestionImportPreview>(`/courses/${courseId}/question-imports`, { method: "POST", body });
}

export async function confirmQuestionImport(batchId: string, courseId: string) {
  const res = await api<QuestionImportResult>(`/imports/${batchId}/confirm`, { method: "POST" });
  invalidate(`/courses/${courseId}/questions`, `/courses/${courseId}/question-summary`, `/courses/${courseId}/topics`, "/exams");
  return res;
}

// --- Exams and schedules ---------------------------------------------------------------

export async function createExam(courseId: string, input: ExamSettingsInput & { title: string; examType: ExamType; rules?: RuleInput[] }) {
  const res = await api<{ exam: LecturerExam }>("/exams", { method: "POST", json: { courseId, ...input } });
  invalidate("/exams", "/analytics/dashboard");
  return res.exam;
}

/** After publishing, shuffling and the fee are fixed (409 EXAM_PUBLISHED_LOCKED). */
export async function updateExamSettings(id: string, patch: ExamSettingsInput) {
  const res = await api<{ exam: LecturerExam }>(`/exams/${id}`, { method: "PATCH", json: patch });
  invalidate("/exams");
  return res.exam;
}

/** DRAFT only. Refused with 400 EXAM_NOT_ENOUGH_QUESTIONS when the bank is too small for a rule. */
export async function setExamRules(id: string, rules: RuleInput[]) {
  const res = await api<{ exam: LecturerExam }>(`/exams/${id}/rules`, { method: "PUT", json: { rules } });
  invalidate("/exams");
  return res.exam;
}

export function loadExamPreview(id: string) {
  return api<ExamPreview>(`/exams/${id}/preview`);
}

export async function publishExam(id: string) {
  const res = await api<{ exam: ExamDetail }>(`/exams/${id}/publish`, { method: "POST" });
  invalidate("/exams", "/analytics/dashboard");
  return res.exam;
}

/** The registrar approves the request; overlaps are checked at approval. */
export async function requestSchedule(examId: string, input: ScheduleRequestInput) {
  const res = await api<{ schedule: Schedule }>(`/exams/${examId}/schedules`, { method: "POST", json: input });
  invalidate("/exams", "/schedules");
  return res.schedule;
}

/** A lecturer can cancel a request that is still waiting (REQUESTED). */
export async function cancelSchedule(scheduleId: string) {
  const res = await api<{ schedule: Schedule }>(`/schedules/${scheduleId}/cancel`, { method: "POST" });
  invalidate("/exams", "/schedules");
  return res.schedule;
}

// --- Grading and results ------------------------------------------------------------------

function afterGrading(examId: string, answerId: string) {
  invalidate(`/exams/${examId}/grading`, `/grading/answers/${answerId}`, `/exams/${examId}/results`, `/exams/${examId}/analytics`, "/analytics/dashboard");
}

/** Non-essay answers (Needs review, or a regrade while results are not published). */
export async function setAnswerMarks(examId: string, answerId: string, marks: number, comment?: string) {
  const res = await api<{ answer: GradingAnswer }>(`/grading/answers/${answerId}/marks`, { method: "PUT", json: { marks, ...(comment ? { comment } : {}) } });
  afterGrading(examId, answerId);
  return res.answer;
}

/** Essays: marks for every rubric criterion. Works for the course lecturer and the blind second grader. */
export async function markEssay(examId: string, answerId: string, criteria: { criterionId: string; marks: number }[], comment?: string) {
  const res = await api<{ answer: GradingAnswer }>(`/grading/answers/${answerId}/essay`, { method: "PUT", json: { criteria, ...(comment ? { comment } : {}) } });
  afterGrading(examId, answerId);
  return res.answer;
}

/** The course lecturer sets the final mark of an essay whose two marks differ too much. */
export async function resolveDiscrepancy(examId: string, answerId: string, marks: number) {
  const res = await api<{ answer: GradingAnswer }>(`/grading/answers/${answerId}/resolve`, { method: "POST", json: { marks } });
  afterGrading(examId, answerId);
  return res.answer;
}

/** A reason is required from the second publication on (400 PUBLICATION_REASON_REQUIRED). */
export async function publishResults(examId: string, reason?: string) {
  const res = await api<{ publicationNumber: number; attempts: number; notifiedStudents: number }>(`/exams/${examId}/results/publish`, { method: "POST", json: reason ? { reason } : {} });
  invalidate(`/exams/${examId}`, "/exams", "/analytics/dashboard");
  return res;
}

export async function reopenResults(examId: string, reason: string) {
  const res = await api<{ resultsStatus: "REOPENED" }>(`/exams/${examId}/results/reopen`, { method: "POST", json: { reason } });
  invalidate(`/exams/${examId}`, "/exams");
  return res;
}


/** The tick list of an exam: reviewed questions per rule, ticked or not. */
export function questionPoolPath(examId: string) { return `/exams/${examId}/question-pool`; }

/** Saves the unticked questions of a draft exam. */
export async function setExcludedQuestions(examId: string, questionIds: string[]) {
  const res = await api<{ exam: LecturerExam }>(`/exams/${examId}/excluded-questions`, { method: "PUT", json: { questionIds } });
  invalidate(`/exams/${examId}`, "/exams");
  return res.exam;
}

/** Marks a question reviewed, or sends it back to draft. */
export async function setQuestionReviewed(id: string, reviewed: boolean) {
  await api(`/questions/${id}/review`, { method: reviewed ? "POST" : "DELETE" });
  invalidate(`/questions/${id}`, "/courses/");
}
