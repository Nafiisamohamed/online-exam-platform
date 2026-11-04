/**
 * Bulk question import from CSV (section 4.3, Lecturer).
 *
 * Template columns (GET /api/imports/templates/questions.csv):
 *   type          MCQ | TRUE_FALSE | SHORT_ANSWER | ESSAY
 *   text          question text
 *   difficulty    EASY | MEDIUM | HARD
 *   marks         e.g. 2 or 1.5
 *   topic         topic name (created if new)
 *   option_1..option_5   MCQ options (4 or 5)
 *   correct_option       MCQ: number of the correct option (1-5); TRUE_FALSE: True or False
 *   accepted_answers     SHORT_ANSWER: answers separated by |
 *   rubric               ESSAY: criteria as "description:marks|description:marks"
 *
 * Workflow:
 * 1. preview: every row is validated with the same rules as the editor
 *    (question-content.ts). Rows are VALID, INVALID (with error codes) or
 *    DUPLICATE (same text as an earlier row or an active bank question, D19).
 *    The result is stored in import_batches (status PREVIEW); nothing else is saved.
 * 2. confirm: rows are checked again; only VALID rows are saved, duplicates
 *    are skipped and reported.
 */
import type { Request } from "express";
import { prisma, transaction } from "../../db/prisma.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { normalizeText } from "../../lib/format.ts";
import { parseCsv } from "../../lib/uploads.ts";
import { audit } from "../../services/audit.ts";
import type { ContentError, QuestionInput } from "./question-content.ts";
import { validateQuestion } from "./question-content.ts";
import { insertQuestion } from "./questions.service.ts";

export const QUESTION_COLUMNS = [
  "type", "text", "difficulty", "marks", "topic",
  "option_1", "option_2", "option_3", "option_4", "option_5",
  "correct_option", "accepted_answers", "rubric",
];
const REQUIRED = ["type", "text", "difficulty", "marks", "topic"];

export const TEMPLATE_ROWS = [
  ["MCQ", "Which SQL command removes all rows but keeps the table?", "EASY", "2", "SQL", "DROP", "TRUNCATE", "ALTER", "CREATE", "", "2", "", ""],
  ["TRUE_FALSE", "A primary key can contain NULL values.", "EASY", "1", "Keys", "", "", "", "", "", "False", "", ""],
  ["SHORT_ANSWER", "What does SQL stand for?", "MEDIUM", "2", "SQL", "", "", "", "", "", "", "Structured Query Language|structured query language", ""],
  ["ESSAY", "Explain normalisation with an example.", "HARD", "10", "Design", "", "", "", "", "", "", "", "Definition:3|Example:4|Clarity:3"],
];

export interface QuestionRow {
  row: number;
  status: "VALID" | "INVALID" | "DUPLICATE";
  errors: ContentError[];
  question?: QuestionInput;
}

/** Turns one CSV row into a QuestionInput plus parsing errors. */
export function parseQuestionRow(raw: Record<string, string>): { input: QuestionInput; errors: ContentError[] } {
  const errors: ContentError[] = [];
  let type = (raw.type ?? "").trim().toUpperCase().replace(/[\s/-]+/g, "_");
  if (type === "TF") type = "TRUE_FALSE";
  const marks = Number((raw.marks ?? "").trim());
  const input: QuestionInput = {
    type: type as QuestionInput["type"],
    text: (raw.text ?? "").trim(),
    marks,
    difficulty: (raw.difficulty ?? "").trim().toUpperCase() as QuestionInput["difficulty"],
    topic: (raw.topic ?? "").trim(),
  };
  const correct = (raw.correct_option ?? "").trim();
  if (type === "MCQ") {
    const texts = [1, 2, 3, 4, 5].map((i) => (raw[`option_${i}`] ?? "").trim()).filter(Boolean);
    const index = Number(correct);
    if (!Number.isInteger(index) || index < 1 || index > texts.length) errors.push({ code: "CORRECT_OPTION_INVALID" });
    input.options = texts.map((text, i) => ({ text, isCorrect: i + 1 === index }));
  } else if (type === "TRUE_FALSE") {
    const v = correct.toLowerCase();
    const truth = ["true", "t", "run", "haa"].includes(v) ? true : ["false", "f", "been", "maya"].includes(v) ? false : null;
    if (truth === null) errors.push({ code: "CORRECT_OPTION_INVALID" });
    input.options = [{ text: "True", isCorrect: truth === true }, { text: "False", isCorrect: truth === false }];
  } else if (type === "SHORT_ANSWER") {
    input.acceptedAnswers = (raw.accepted_answers ?? "").split("|").map((a) => a.trim()).filter(Boolean);
  } else if (type === "ESSAY") {
    input.rubric = (raw.rubric ?? "").split("|").map((p) => p.trim()).filter(Boolean).map((part) => {
      const i = part.lastIndexOf(":");
      return { description: i > 0 ? part.slice(0, i).trim() : part, maxMarks: i > 0 ? Number(part.slice(i + 1)) : NaN };
    });
  }
  return { input, errors };
}

async function validateRows(courseId: string, rows: Record<string, string>[]): Promise<QuestionRow[]> {
  const bank = await prisma.question.findMany({ where: { courseId, isArchived: false }, select: { normalizedText: true } });
  const inBank = new Set(bank.map((q) => q.normalizedText));
  const firstRow = new Map<string, number>();
  return rows.map((raw, i) => {
    const row = i + 2;
    const { input, errors } = parseQuestionRow(raw);
    errors.push(...validateQuestion(input));
    if (errors.length) return { row, status: "INVALID", errors, question: input };
    const key = normalizeText(input.text);
    if (inBank.has(key)) return { row, status: "DUPLICATE", errors: [{ code: "DUPLICATE_QUESTION", params: { existing: "BANK" } }], question: input };
    if (firstRow.has(key)) return { row, status: "DUPLICATE", errors: [{ code: "DUPLICATE_QUESTION", params: { existingRow: firstRow.get(key)! } }], question: input };
    firstRow.set(key, row);
    return { row, status: "VALID", errors: [], question: input };
  });
}

function counts(rows: QuestionRow[]) {
  return {
    totalRows: rows.length,
    validRows: rows.filter((r) => r.status === "VALID").length,
    invalidRows: rows.filter((r) => r.status === "INVALID").length,
    duplicateRows: rows.filter((r) => r.status === "DUPLICATE").length,
  };
}

/** Step 1: validate and store a PREVIEW batch. Only the course's lecturer may import. */
export async function previewQuestionImport(user: AuthUser, courseId: string, file: Express.Multer.File | undefined) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.lecturerId !== user.id) throw notFound("COURSE_NOT_FOUND");
  const rows = parseCsv(file, REQUIRED);
  const results = await validateRows(courseId, rows);
  const batch = await prisma.importBatch.create({
    data: {
      type: "QUESTIONS", courseId, uploadedById: user.id, filename: (file?.originalname ?? "questions.csv").slice(0, 200),
      ...counts(results), rowResults: results as unknown as object,
    },
  });
  return { batch: { id: batch.id, type: batch.type, courseId, status: batch.status, filename: batch.filename, ...counts(results) }, rows: results };
}

/** Step 2: save the VALID rows. @throws 409 IMPORT_ALREADY_CONFIRMED, 400 IMPORT_NO_VALID_ROWS */
export async function confirmQuestionImport(batchId: string, user: AuthUser, req: Request) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { course: true } });
  if (!batch || batch.type !== "QUESTIONS" || batch.course?.lecturerId !== user.id) throw notFound("IMPORT_NOT_FOUND");
  if (batch.status !== "PREVIEW") throw conflict("IMPORT_ALREADY_CONFIRMED", "This import was already saved");
  const stored = batch.rowResults as unknown as QuestionRow[];
  const fresh = await validateRows(batch.courseId!, stored.map((r) => toRaw(r.question)));
  const valid = fresh.filter((r) => r.status === "VALID");
  if (valid.length === 0) throw badRequest("IMPORT_NO_VALID_ROWS", "There are no valid rows to save");

  await transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT status::text FROM import_batches WHERE id = ${batchId}::uuid FOR UPDATE`;
    if (locked[0]?.status !== "PREVIEW") throw conflict("IMPORT_ALREADY_CONFIRMED", "This import was already saved");
    for (const r of valid) await insertQuestion(tx, batch.courseId!, user.id, r.question!);
    await tx.importBatch.update({ where: { id: batchId }, data: { status: "CONFIRMED", ...counts(fresh), rowResults: fresh as unknown as object } });
    await audit(tx, { actorId: user.id, action: "QUESTIONS_IMPORTED", entityType: "course", entityId: batch.courseId, details: { batchId, ...counts(fresh) }, req });
  });
  return { ...counts(fresh), savedRows: valid.length, rows: fresh };
}

/** Rebuilds CSV-like values from a stored row, so confirm re-runs exactly the same checks. */
function toRaw(q: QuestionInput | undefined): Record<string, string> {
  if (!q) return {};
  const raw: Record<string, string> = { type: q.type, text: q.text, difficulty: q.difficulty, marks: String(q.marks), topic: q.topic };
  if (q.type === "MCQ") {
    (q.options ?? []).forEach((o, i) => (raw[`option_${i + 1}`] = o.text));
    raw.correct_option = String((q.options ?? []).findIndex((o) => o.isCorrect) + 1);
  } else if (q.type === "TRUE_FALSE") {
    const t = q.options?.find((o) => o.isCorrect)?.text;
    raw.correct_option = t ?? "";
  } else if (q.type === "SHORT_ANSWER") raw.accepted_answers = (q.acceptedAnswers ?? []).join("|");
  else if (q.type === "ESSAY") raw.rubric = (q.rubric ?? []).map((r) => `${r.description}:${r.maxMarks}`).join("|");
  return raw;
}
