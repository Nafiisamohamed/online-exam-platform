/** Pure business rules: grading, question content, phones, networks, CSV, translations, errors. */
import { describe, expect, it } from "vitest";
import { mapDbError } from "../../src/db/db-errors.ts";
import { LABELS, NOTIFICATION_TEMPLATES, renderSms, SMS_TEMPLATES } from "../../src/i18n/messages.ts";
import { normalizeText } from "../../src/lib/format.ts";
import { isValidCidr } from "../../src/lib/network.ts";
import { normalizeSomaliPhone } from "../../src/lib/phone.ts";
import { csvCell } from "../../src/lib/uploads.ts";
import { letterFor } from "../../src/modules/grading-scale/grading-scale.ts";
import { validateQuestion } from "../../src/modules/questions/question-content.ts";
import { autoGrade } from "../../src/services/auto-grade.ts";
import { computeTotals } from "../../src/services/grades.ts";

describe("automatic grading (4.10)", () => {
  it("grades choices and short answers, and never marks an unmatched short answer wrong", () => {
    expect(autoGrade({ type: "MCQ", marks: 2, selectedOptionId: "a", textAnswer: null, correctOptionId: "a" })).toEqual({ status: "AUTO_CORRECT", marksAwarded: 2 });
    expect(autoGrade({ type: "TRUE_FALSE", marks: 1, selectedOptionId: "b", textAnswer: null, correctOptionId: "a" })).toEqual({ status: "AUTO_INCORRECT", marksAwarded: 0 });
    expect(autoGrade({ type: "MCQ", marks: 1, selectedOptionId: null, textAnswer: null, correctOptionId: "a" }).status).toBe("NOT_ANSWERED");
    const accepted = [normalizeText("Structured Query Language")];
    expect(autoGrade({ type: "SHORT_ANSWER", marks: 2, selectedOptionId: null, textAnswer: "  STRUCTURED query   language ", acceptedNormalized: accepted }).status).toBe("AUTO_CORRECT");
    // Punctuation is kept (D20), so this needs review rather than being wrong.
    expect(autoGrade({ type: "SHORT_ANSWER", marks: 2, selectedOptionId: null, textAnswer: "Structured Query Language.", acceptedNormalized: accepted })).toEqual({ status: "NEEDS_REVIEW", marksAwarded: null });
    expect(autoGrade({ type: "ESSAY", marks: 10, selectedOptionId: null, textAnswer: "text" })).toEqual({ status: "PENDING_ESSAY", marksAwarded: null });
    expect(autoGrade({ type: "ESSAY", marks: 10, selectedOptionId: null, textAnswer: "   " }).status).toBe("NOT_ANSWERED");
  });

  it("totals, percentages and letters", () => {
    expect(computeTotals([{ marks: 10, awarded: 7.5 }, { marks: 14, awarded: 14 }, { marks: 1, awarded: null }])).toEqual({ total: 21.5, max: 25, percentage: 86 });
    const scale = [{ letter: "A", minPercentage: 90 }, { letter: "B", minPercentage: 80 }, { letter: "C", minPercentage: 70 }, { letter: "D", minPercentage: 60 }, { letter: "F", minPercentage: 0 }];
    expect([95, 90, 89.99, 70, 59.99, 0].map((p) => letterFor(p, scale))).toEqual(["A", "A", "B", "C", "F", "F"]);
  });
});

describe("question content rules (4.2)", () => {
  const base = { text: "Q?", marks: 2, difficulty: "EASY" as const, topic: "T" };
  const opts = (n: number, correct: number[]) => Array.from({ length: n }, (_, i) => ({ text: `O${i}`, isCorrect: correct.includes(i) }));
  it("multiple choice needs 4-5 options with exactly one correct", () => {
    expect(validateQuestion({ ...base, type: "MCQ", options: opts(4, [0]) })).toEqual([]);
    expect(validateQuestion({ ...base, type: "MCQ", options: opts(5, [4]) })).toEqual([]);
    expect(validateQuestion({ ...base, type: "MCQ", options: opts(3, [0]) }).map((e) => e.code)).toContain("MCQ_OPTION_COUNT");
    expect(validateQuestion({ ...base, type: "MCQ", options: opts(4, [0, 1]) }).map((e) => e.code)).toContain("MCQ_NEEDS_ONE_CORRECT");
    expect(validateQuestion({ ...base, type: "MCQ", options: opts(4, []) }).map((e) => e.code)).toContain("MCQ_NEEDS_ONE_CORRECT");
  });
  it("true/false, short answer and essay rules", () => {
    expect(validateQuestion({ ...base, type: "TRUE_FALSE", options: opts(2, [1]) })).toEqual([]);
    expect(validateQuestion({ ...base, type: "SHORT_ANSWER", acceptedAnswers: [] }).map((e) => e.code)).toEqual(["SHORT_ANSWER_NEEDS_ACCEPTED"]);
    expect(validateQuestion({ ...base, type: "ESSAY", marks: 10, rubric: [{ description: "A", maxMarks: 6 }, { description: "B", maxMarks: 4 }] })).toEqual([]);
    expect(validateQuestion({ ...base, type: "ESSAY", marks: 10, rubric: [{ description: "A", maxMarks: 6 }] })[0]).toEqual({ code: "RUBRIC_TOTAL_MISMATCH", params: { expected: 10, actual: 6 } });
    expect(validateQuestion({ ...base, type: "MCQ", marks: 0, options: opts(4, [0]) }).map((e) => e.code)).toContain("MARKS_INVALID");
  });
});

describe("input helpers", () => {
  it("normalises Somali mobile numbers", () => {
    expect(["+252 61 512 3401", "00252615123401", "0615123401", "615123401", "252634234502"].map(normalizeSomaliPhone)).toEqual([
      "+252615123401", "+252615123401", "+252615123401", "+252615123401", "+252634234502",
    ]);
    expect(normalizeSomaliPhone("12345")).toBeNull();
    expect(normalizeSomaliPhone("+254712345678")).toBeNull();
  });
  it("checks exam-room network ranges", () => {
    expect(isValidCidr("10.10.4.0/24")).toBe(true);
    expect(isValidCidr("10.10.4.0/33")).toBe(false);
  });
  it("normalises text for duplicate checks (D19)", () => {
    expect(normalizeText("  What IS   a key? ")).toBe("what is a key?");
  });
  it("neutralises spreadsheet formulas in CSV exports but keeps phone numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+252615123401")).toBe("+252615123401");
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell('Cali, "Xasan"')).toBe('"Cali, ""Xasan"""');
  });
});

describe("Somali and English text (6.8, P10)", () => {
  it("has every template and label in both languages", () => {
    for (const t of Object.values(SMS_TEMPLATES)) expect(Object.keys(t).sort()).toEqual(["en", "so"]);
    for (const t of Object.values(NOTIFICATION_TEMPLATES)) expect(Object.keys(t).sort()).toEqual(["en", "so"]);
    expect(Object.keys(LABELS.so).sort()).toEqual(Object.keys(LABELS.en).sort());
  });
  it("SMS bodies start with [DEMO] and never contain a password", () => {
    const params = { studentNumber: "S1", course: "CS201", date: "01/01/2027", window: "09:00–11:00", amount: "5.00 USD", merchant: "Jaamacadda Demo", merchantNumber: "000000", receipt: "DEMO-EVC-20270101-ABCDEF", password: "secret123" };
    for (const key of Object.keys(SMS_TEMPLATES)) {
      for (const lang of ["so", "en"] as const) {
        const body = renderSms(key, lang, params);
        expect(body.startsWith("[DEMO]")).toBe(true);
        expect(body).not.toContain("secret123");
      }
    }
  });
});

describe("database error mapping", () => {
  it("turns trigger codes into stable 409 errors", () => {
    const e = Object.assign(new Error("Database error. Code: `P0001`. Message: `ATTEMPT_DEADLINE_PASSED`"), { code: "P2039" });
    expect(mapDbError(e)).toMatchObject({ status: 409, code: "ATTEMPT_DEADLINE_PASSED" });
    expect(mapDbError(new Error("Message: `PAYMENT_NOT_EXPIRED`"))?.code).toBe("PAYMENT_NOT_EXPIRED");
  });
  it("names the constraint of a check violation", () => {
    const e = new Error('Message: `new row for relation "exam_attempts" violates check constraint "exam_attempts_base_deadline_chk"`');
    expect(mapDbError(e)).toMatchObject({ status: 400, code: "CONSTRAINT_VIOLATION", details: { constraint: "exam_attempts_base_deadline_chk" } });
  });
});

describe("campus time zone", () => {
  it("prints UTC times in Mogadishu time (UTC+3) for SMS and PDFs", async () => {
    const { formatDateTime } = await import("../../src/i18n/messages.ts");
    expect(formatDateTime(new Date("2026-11-12T06:00:00Z"), "Africa/Mogadishu")).toBe("12/11/2026 09:00");
    expect(formatDateTime(new Date("2026-11-12T22:30:00Z"), "Africa/Mogadishu")).toBe("13/11/2026 01:30");
  });
});

describe("error responses", () => {
  it("never send database constraint names or stack traces to the client", async () => {
    const { errorHandler } = await import("../../src/middleware/error-handler.ts");
    const capture = () => {
      const res: { statusCode?: number; payload?: unknown; status: (n: number) => typeof res; json: (b: unknown) => void } = {
        status(n) { this.statusCode = n; return this; },
        json(b) { this.payload = b; },
      };
      return res;
    };
    const req = { method: "POST", path: "/x" } as never;
    const check = capture();
    errorHandler(new Error('violates check constraint "exam_attempts_base_deadline_chk"'), req, check as never, () => {});
    expect(check.statusCode).toBe(400);
    expect(JSON.stringify(check.payload)).not.toMatch(/exam_attempts|constraint"/);
    const crash = capture();
    errorHandler(new Error("SELECT * FROM secret_table failed at line 3"), req, crash as never, () => {});
    expect(crash.statusCode).toBe(500);
    expect(JSON.stringify(crash.payload)).toBe('{"error":{"code":"INTERNAL_ERROR","message":"Something went wrong on the server"}}');
  });
});
