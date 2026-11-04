/**
 * Rules for the content of one question (section 4.2), shared by the question
 * editor and the CSV import so both accept exactly the same questions.
 *
 * - MCQ: 4 or 5 options, exactly one correct.
 * - TRUE_FALSE: exactly 2 options, exactly one correct.
 * - SHORT_ANSWER: at least one accepted answer (matching ignores case and extra
 *   spaces but keeps punctuation, D20); no options.
 * - ESSAY: at least one rubric criterion; criterion marks add up to the
 *   question's marks; no options.
 * - Every question: text, marks > 0 (at most 2 decimals), difficulty, topic.
 *
 * validateQuestion() returns a list of error codes (empty = valid).
 */
import type { Difficulty, QuestionType } from "../../generated/prisma/enums.ts";
import { normalizeText } from "../../lib/format.ts";

export interface QuestionInput {
  type: QuestionType;
  text: string;
  marks: number;
  difficulty: Difficulty;
  topic: string;
  imagePath?: string | null;
  options?: { text: string; isCorrect: boolean }[];
  acceptedAnswers?: string[];
  rubric?: { description: string; maxMarks: number }[];
}

export type ContentError = { code: string; params?: Record<string, string | number> };

const TYPES = ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"];
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];
const twoDecimals = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

export function validateQuestion(q: QuestionInput): ContentError[] {
  const errors: ContentError[] = [];
  if (!TYPES.includes(q.type)) errors.push({ code: "TYPE_INVALID" });
  if (!q.text?.trim()) errors.push({ code: "TEXT_REQUIRED" });
  else if (q.text.length > 5000) errors.push({ code: "TEXT_TOO_LONG", params: { max: 5000 } });
  if (!(Number.isFinite(q.marks) && q.marks > 0 && q.marks <= 1000 && twoDecimals(q.marks))) errors.push({ code: "MARKS_INVALID" });
  if (!DIFFICULTIES.includes(q.difficulty)) errors.push({ code: "DIFFICULTY_INVALID" });
  if (!q.topic?.trim()) errors.push({ code: "TOPIC_REQUIRED" });

  const options = q.options ?? [];
  const accepted = q.acceptedAnswers ?? [];
  const rubric = q.rubric ?? [];
  const correct = options.filter((o) => o.isCorrect).length;

  if (q.type === "MCQ" || q.type === "TRUE_FALSE") {
    const [min, max] = q.type === "MCQ" ? [4, 5] : [2, 2];
    if (options.length < min || options.length > max) errors.push({ code: q.type === "MCQ" ? "MCQ_OPTION_COUNT" : "TF_OPTION_COUNT", params: { min, max } });
    if (correct !== 1) errors.push({ code: q.type === "MCQ" ? "MCQ_NEEDS_ONE_CORRECT" : "TF_NEEDS_ONE_CORRECT" });
    if (options.some((o) => !o.text?.trim())) errors.push({ code: "OPTION_TEXT_REQUIRED" });
    if (new Set(options.map((o) => normalizeText(o.text ?? ""))).size !== options.length) errors.push({ code: "OPTION_DUPLICATE" });
    if (accepted.length || rubric.length) errors.push({ code: "FIELDS_NOT_ALLOWED_FOR_TYPE" });
  } else if (q.type === "SHORT_ANSWER") {
    if (accepted.filter((a) => a?.trim()).length === 0) errors.push({ code: "SHORT_ANSWER_NEEDS_ACCEPTED" });
    if (new Set(accepted.map(normalizeText)).size !== accepted.length) errors.push({ code: "ACCEPTED_DUPLICATE" });
    if (options.length || rubric.length) errors.push({ code: "FIELDS_NOT_ALLOWED_FOR_TYPE" });
  } else if (q.type === "ESSAY") {
    if (rubric.length === 0) errors.push({ code: "ESSAY_NEEDS_RUBRIC" });
    if (rubric.some((r) => !r.description?.trim())) errors.push({ code: "RUBRIC_DESCRIPTION_REQUIRED" });
    if (rubric.some((r) => !(Number.isFinite(r.maxMarks) && r.maxMarks > 0 && twoDecimals(r.maxMarks)))) errors.push({ code: "RUBRIC_MARKS_INVALID" });
    const total = Math.round(rubric.reduce((s, r) => s + (Number(r.maxMarks) || 0), 0) * 100) / 100;
    if (rubric.length && Number.isFinite(q.marks) && total !== Math.round(q.marks * 100) / 100) {
      errors.push({ code: "RUBRIC_TOTAL_MISMATCH", params: { expected: q.marks, actual: total } });
    }
    if (options.length || accepted.length) errors.push({ code: "FIELDS_NOT_ALLOWED_FOR_TYPE" });
  }
  return errors;
}
