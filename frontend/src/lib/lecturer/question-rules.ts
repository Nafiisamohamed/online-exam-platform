/**
 * The question editor's form, and the same content rules as the backend
 * (backend/src/modules/questions/question-content.ts), returning the same
 * error codes. They let the editor show problems before sending; the server
 * still checks every question and its answer wins.
 */
import type { QuestionInput, QuestionType, QuestionVersion, Difficulty } from "@/types/lecturer";

export interface QuestionForm {
  type: QuestionType;
  text: string;
  marks: string;
  difficulty: Difficulty;
  topic: string;
  imagePath: string | null;
  imageUrl: string | null;
  /** MCQ options (4–5). */
  options: { text: string; isCorrect: boolean }[];
  /** TRUE_FALSE: which answer is correct. */
  trueIsCorrect: boolean | null;
  acceptedAnswers: string[];
  rubric: { description: string; maxMarks: string }[];
}

export type ContentError = { code: string; params?: Record<string, string | number> };

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const twoDecimals = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

export function emptyForm(type: QuestionType = "MCQ"): QuestionForm {
  return {
    type, text: "", marks: "", difficulty: "EASY", topic: "", imagePath: null, imageUrl: null,
    options: Array.from({ length: 4 }, () => ({ text: "", isCorrect: false })),
    trueIsCorrect: null, acceptedAnswers: [""], rubric: [{ description: "", maxMarks: "" }],
  };
}

/** Fills the form from a saved version (for editing). */
export function formFromVersion(v: QuestionVersion): QuestionForm {
  const base = emptyForm(v.type);
  return {
    ...base,
    text: v.text,
    marks: String(v.marks),
    difficulty: v.difficulty,
    topic: v.topic.name,
    imagePath: v.imagePath,
    imageUrl: v.imageUrl,
    options: v.type === "MCQ" ? [...v.options].sort((a, b) => a.position - b.position).map((o) => ({ text: o.text, isCorrect: o.isCorrect })) : base.options,
    trueIsCorrect: v.type === "TRUE_FALSE" ? v.options.find((o) => o.isCorrect)?.text.toLowerCase() === "true" : null,
    acceptedAnswers: v.type === "SHORT_ANSWER" ? [...v.acceptedAnswers] : base.acceptedAnswers,
    rubric: v.type === "ESSAY" ? [...v.rubric].sort((a, b) => a.position - b.position).map((r) => ({ description: r.description, maxMarks: String(r.maxMarks) })) : base.rubric,
  };
}

/**
 * The request body for this form: only the fields the type uses (the API
 * refuses the others with FIELDS_NOT_ALLOWED_FOR_TYPE). True/False options are
 * "True" and "False", as the CSV import creates them.
 */
export function toInput(f: QuestionForm): QuestionInput {
  const base = { type: f.type, text: f.text.trim(), marks: Number(f.marks), difficulty: f.difficulty, topic: f.topic.trim(), imagePath: f.imagePath };
  if (f.type === "MCQ") return { ...base, options: f.options.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })) };
  if (f.type === "TRUE_FALSE") return { ...base, options: [{ text: "True", isCorrect: f.trueIsCorrect === true }, { text: "False", isCorrect: f.trueIsCorrect === false }] };
  if (f.type === "SHORT_ANSWER") return { ...base, acceptedAnswers: f.acceptedAnswers.map((a) => a.trim()).filter(Boolean) };
  return { ...base, rubric: f.rubric.map((r) => ({ description: r.description.trim(), maxMarks: Number(r.maxMarks) })) };
}

/** Sum of the rubric marks, rounded to 2 decimals like the backend. */
export function rubricTotal(rubric: { maxMarks: number | string }[]) {
  return Math.round(rubric.reduce((s, r) => s + (Number(r.maxMarks) || 0), 0) * 100) / 100;
}

/** Same checks and codes as validateQuestion() in the backend. Empty list = valid. */
export function questionProblems(q: QuestionInput): ContentError[] {
  const errors: ContentError[] = [];
  if (!q.text.trim()) errors.push({ code: "TEXT_REQUIRED" });
  else if (q.text.length > 5000) errors.push({ code: "TEXT_TOO_LONG", params: { max: 5000 } });
  if (!(Number.isFinite(q.marks) && q.marks > 0 && q.marks <= 1000 && twoDecimals(q.marks))) errors.push({ code: "MARKS_INVALID" });
  if (!q.topic.trim()) errors.push({ code: "TOPIC_REQUIRED" });
  const options = q.options ?? [];
  const correct = options.filter((o) => o.isCorrect).length;
  if (q.type === "MCQ" || q.type === "TRUE_FALSE") {
    const [min, max] = q.type === "MCQ" ? [4, 5] : [2, 2];
    if (options.length < min || options.length > max) errors.push({ code: q.type === "MCQ" ? "MCQ_OPTION_COUNT" : "TF_OPTION_COUNT", params: { min, max } });
    if (correct !== 1) errors.push({ code: q.type === "MCQ" ? "MCQ_NEEDS_ONE_CORRECT" : "TF_NEEDS_ONE_CORRECT" });
    if (options.some((o) => !o.text.trim())) errors.push({ code: "OPTION_TEXT_REQUIRED" });
    else if (new Set(options.map((o) => normalize(o.text))).size !== options.length) errors.push({ code: "OPTION_DUPLICATE" });
  } else if (q.type === "SHORT_ANSWER") {
    const accepted = q.acceptedAnswers ?? [];
    if (accepted.length === 0) errors.push({ code: "SHORT_ANSWER_NEEDS_ACCEPTED" });
    if (new Set(accepted.map(normalize)).size !== accepted.length) errors.push({ code: "ACCEPTED_DUPLICATE" });
  } else {
    const rubric = q.rubric ?? [];
    if (rubric.length === 0) errors.push({ code: "ESSAY_NEEDS_RUBRIC" });
    if (rubric.some((r) => !r.description.trim())) errors.push({ code: "RUBRIC_DESCRIPTION_REQUIRED" });
    if (rubric.some((r) => !(Number.isFinite(r.maxMarks) && r.maxMarks > 0 && twoDecimals(r.maxMarks)))) errors.push({ code: "RUBRIC_MARKS_INVALID" });
    const total = rubricTotal(rubric);
    if (rubric.length && Number.isFinite(q.marks) && total !== Math.round(q.marks * 100) / 100) {
      errors.push({ code: "RUBRIC_TOTAL_MISMATCH", params: { expected: q.marks, actual: total } });
    }
  }
  return errors;
}
