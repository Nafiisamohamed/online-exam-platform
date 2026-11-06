// Checks for the Phase 3 lecturer logic: question rules, exam rules, campus time, and coverage of backend codes.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { availableFor, ruleTotals, rulesComplete, toRuleInputs, type RuleDraft } from "@/components/lecturer/rules-editor";
import { campusInputToIso } from "@/lib/format";
import { questionErrorText } from "@/lib/i18n/error-text";
import { dictionaries, translate, type MessageKey } from "@/lib/i18n/i18n";
import { emptyForm, questionProblems, rubricTotal, toInput } from "./question-rules";

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(dictionaries.en, key, vars);
const codes = (q: Parameters<typeof questionProblems>[0]) => questionProblems(q).map((e) => e.code);
const BACKEND = join(__dirname, "../../../../backend/src");
const read = (p: string) => readFileSync(join(BACKEND, p), "utf8");

describe("question rules mirror backend/src/modules/questions/question-content.ts", () => {
  const base = { text: "What is SQL?", marks: 2, difficulty: "EASY" as const, topic: "SQL" };

  it("multiple choice needs 4-5 options with exactly one correct", () => {
    const opts = (n: number, correct: number[]) => Array.from({ length: n }, (_, i) => ({ text: `Option ${i + 1}`, isCorrect: correct.includes(i) }));
    expect(codes({ ...base, type: "MCQ", options: opts(4, [1]) })).toEqual([]);
    expect(codes({ ...base, type: "MCQ", options: opts(3, [0]) })).toContain("MCQ_OPTION_COUNT");
    expect(codes({ ...base, type: "MCQ", options: opts(4, []) })).toContain("MCQ_NEEDS_ONE_CORRECT");
    expect(codes({ ...base, type: "MCQ", options: opts(4, [0, 1]) })).toContain("MCQ_NEEDS_ONE_CORRECT");
    expect(codes({ ...base, type: "MCQ", options: [...opts(3, [0]), { text: "option 1", isCorrect: false }] })).toContain("OPTION_DUPLICATE");
  });

  it("true/false is sent as True and False options, one of them correct", () => {
    const form = { ...emptyForm("TRUE_FALSE"), text: "A primary key can be NULL.", marks: "1", topic: "Keys", trueIsCorrect: false };
    const input = toInput(form);
    expect(input.options).toEqual([{ text: "True", isCorrect: false }, { text: "False", isCorrect: true }]);
    expect(codes(input)).toEqual([]);
    expect(codes(toInput({ ...form, trueIsCorrect: null }))).toContain("TF_NEEDS_ONE_CORRECT");
  });

  it("short answers need accepted answers, without duplicates, and send no options", () => {
    const form = { ...emptyForm("SHORT_ANSWER"), text: "What does SQL stand for?", marks: "2", topic: "SQL", acceptedAnswers: ["Structured Query Language", "  "] };
    const input = toInput(form);
    expect(input.acceptedAnswers).toEqual(["Structured Query Language"]);
    expect(input.options).toBeUndefined();
    expect(codes({ ...base, type: "SHORT_ANSWER", acceptedAnswers: [] })).toContain("SHORT_ANSWER_NEEDS_ACCEPTED");
    expect(codes({ ...base, type: "SHORT_ANSWER", acceptedAnswers: ["SQL", " sql "] })).toContain("ACCEPTED_DUPLICATE");
  });

  it("essay rubric marks must add up to the question's marks", () => {
    expect(rubricTotal([{ maxMarks: "3" }, { maxMarks: 4.5 }])).toBe(7.5);
    expect(codes({ ...base, type: "ESSAY", marks: 10, rubric: [{ description: "Definition", maxMarks: 3 }, { description: "Example", maxMarks: 7 }] })).toEqual([]);
    const mismatch = questionProblems({ ...base, type: "ESSAY", marks: 10, rubric: [{ description: "Definition", maxMarks: 3 }] });
    expect(mismatch).toEqual([{ code: "RUBRIC_TOTAL_MISMATCH", params: { expected: 10, actual: 3 } }]);
    expect(questionErrorText(t, mismatch[0])).toBe("Rubric marks add up to 3, but the question is worth 10.");
  });

  it("checks text, marks (2 decimals) and topic for every type", () => {
    expect(codes({ ...base, type: "SHORT_ANSWER", acceptedAnswers: ["x"], text: " ", marks: 1.234, topic: "" })).toEqual(["TEXT_REQUIRED", "MARKS_INVALID", "TOPIC_REQUIRED"]);
  });

  it("tells the two kinds of CSV duplicates apart", () => {
    expect(questionErrorText(t, { code: "DUPLICATE_QUESTION", params: { existing: "BANK" } })).toBe(dictionaries.en.questionErrors.DUPLICATE_QUESTION_BANK);
    expect(questionErrorText(t, { code: "DUPLICATE_QUESTION", params: { existingRow: 3 } })).toContain("row 3");
  });
});

describe("exam rules", () => {
  const rule = (p: Partial<RuleDraft>): RuleDraft => ({ questionType: "MCQ", difficulty: "EASY", marksPerQuestion: "2", questionCount: "5", topicIds: [], ...p });
  const summary = [
    { type: "MCQ" as const, difficulty: "EASY" as const, marks: 2, count: 6 },
    { type: "MCQ" as const, difficulty: "EASY" as const, marks: 1, count: 9 },
    { type: "ESSAY" as const, difficulty: "HARD" as const, marks: 10, count: 2 },
  ];

  it("counts eligible bank questions by type, difficulty and marks", () => {
    expect(availableFor(rule({}), summary)).toBe(6);
    expect(availableFor(rule({ marksPerQuestion: "1" }), summary)).toBe(9);
    expect(availableFor(rule({ questionType: "ESSAY", difficulty: "HARD", marksPerQuestion: "10" }), summary)).toBe(2);
    expect(availableFor(rule({ difficulty: "HARD" }), summary)).toBe(0);
  });

  it("totals and request body", () => {
    expect(ruleTotals([rule({}), rule({ questionType: "ESSAY", marksPerQuestion: "10", questionCount: "2" })])).toEqual({ questions: 7, marks: 30 });
    expect(rulesComplete([rule({ questionCount: "0" })])).toBe(false);
    expect(rulesComplete([rule({ questionCount: "2.5" })])).toBe(false);
    expect(toRuleInputs([rule({ topicIds: ["t1"] }), rule({ marksPerQuestion: "1" })])).toEqual([
      { questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 2, questionCount: 5, topicIds: ["t1"] },
      { questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 5 },
    ]);
  });

  it("reads schedule times as campus time (UTC+3), whatever the device time zone", () => {
    expect(campusInputToIso("2026-11-12T09:00")).toBe("2026-11-12T06:00:00.000Z");
    expect(campusInputToIso("")).toBeNull();
    expect(campusInputToIso("12/11/2026 09:00")).toBeNull();
  });
});

describe("coverage of backend codes", () => {
  function sources(dir: string): string[] {
    return readdirSync(join(BACKEND, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith(".ts") ? [read(join(dir, e.name))] : []));
  }

  it("has Somali and English text for every error the lecturer and registrar modules can return", () => {
    const modules = ["auth", "users", "courses", "imports", "questions", "exams", "schedules", "grading", "results", "analytics", "rooms"];
    const found = new Set<string>();
    for (const src of [...modules.flatMap((m) => sources(`modules/${m}`)), read("services/access.ts"), read("middleware/auth.ts"), read("lib/uploads.ts")]) {
      for (const m of src.matchAll(/(?:badRequest|conflict|notFound|unauthorized|forbidden)\("([A-Z_]+)"/g)) found.add(m[1]);
      for (const m of src.matchAll(/new AppError\(\d+, "([A-Z_]+)"/g)) found.add(m[1]);
    }
    expect(found.size).toBeGreaterThan(50);
    for (const code of found) {
      expect(dictionaries.en.errors, code).toHaveProperty(code);
      expect(dictionaries.so.errors, code).toHaveProperty(code);
    }
  });

  it("has text for every question content and CSV row code", () => {
    const found = new Set<string>();
    for (const file of ["modules/questions/question-content.ts", "modules/questions/question-import.ts"]) {
      for (const m of read(file).matchAll(/code: (?:q\.type === "MCQ" \? )?"([A-Z_]+)"(?: : "([A-Z_]+)")?/g)) [m[1], m[2]].filter(Boolean).forEach((c) => found.add(c));
    }
    found.delete("DUPLICATE_QUESTION"); // shown as DUPLICATE_QUESTION_BANK / _ROW
    expect(found.size).toBeGreaterThan(15);
    for (const code of found) {
      expect(dictionaries.en.questionErrors, code).toHaveProperty(code);
      expect(dictionaries.so.questionErrors, code).toHaveProperty(code);
    }
  });
});
