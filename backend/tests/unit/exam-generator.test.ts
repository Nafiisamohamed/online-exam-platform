/** Fair exam generation (completion condition 1), pure logic without a database. */
import { describe, expect, it } from "vitest";
import { generateExam, NotEnoughQuestionsError, type PoolQuestion, type RuleWithPool, shuffle } from "../../src/services/exam-generator.ts";

function pool(prefix: string, n: number, type: PoolQuestion["type"] = "MCQ"): PoolQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    versionId: `${prefix}${i + 1}`,
    type,
    optionIds: type === "MCQ" ? ["a", "b", "c", "d"].map((o) => `${prefix}${i + 1}-${o}`) : type === "TRUE_FALSE" ? [`${prefix}${i + 1}-t`, `${prefix}${i + 1}-f`] : [],
    usage: 0,
  }));
}

const rules = (): RuleWithPool[] => [
  { id: "easy", position: 1, questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 10, pool: pool("E", 25) },
  { id: "medium", position: 2, questionType: "MCQ", difficulty: "MEDIUM", marksPerQuestion: 2, questionCount: 8, pool: pool("M", 20) },
  { id: "hard", position: 3, questionType: "ESSAY", difficulty: "HARD", marksPerQuestion: 5, questionCount: 5, pool: pool("H", 12, "ESSAY") },
];

/** Records the generated versions as used, as the database does after an attempt starts. */
function markUsed(r: RuleWithPool[], ids: string[]) {
  for (const rule of r) for (const q of rule.pool) if (ids.includes(q.versionId)) q.usage++;
}

describe("exam generator", () => {
  it("gives every student the same difficulty mix and total marks (10 easy, 8 medium, 5 hard)", () => {
    const r = rules();
    for (let i = 0; i < 50; i++) {
      const exam = generateExam(r, { shuffleQuestions: true, shuffleOptions: true });
      const byRule = (id: string) => exam.filter((q) => q.ruleId === id).length;
      expect([byRule("easy"), byRule("medium"), byRule("hard")]).toEqual([10, 8, 5]);
      expect(exam.reduce((s, q) => s + q.marks, 0)).toBe(10 * 1 + 8 * 2 + 5 * 5);
      expect(new Set(exam.map((q) => q.versionId)).size).toBe(23);
      expect(exam.map((q) => q.position)).toEqual(Array.from({ length: 23 }, (_, k) => k + 1));
    }
  });

  it("gives two students completely different question sets when the pools are large enough", () => {
    const r = rules();
    const first = generateExam(r, { shuffleQuestions: true, shuffleOptions: true });
    markUsed(r, first.map((q) => q.versionId));
    const second = generateExam(r, { shuffleQuestions: true, shuffleOptions: true });
    const overlap = second.filter((q) => first.some((f) => f.versionId === q.versionId));
    expect(overlap).toHaveLength(0);
  });

  it("still gives a different set when the pool is only slightly bigger than the rule", () => {
    const r: RuleWithPool[] = [{ id: "r", position: 1, questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 5, pool: pool("Q", 6) }];
    const a = generateExam(r, { shuffleQuestions: true, shuffleOptions: false });
    markUsed(r, a.map((q) => q.versionId));
    const b = generateExam(r, { shuffleQuestions: true, shuffleOptions: false });
    expect(new Set(a.map((q) => q.versionId))).not.toEqual(new Set(b.map((q) => q.versionId)));
    expect(b.some((q) => !a.some((x) => x.versionId === q.versionId))).toBe(true);
  });

  it("refuses to generate when a rule has too few questions, listing every shortage", () => {
    const r = rules();
    r[2].pool = pool("H", 3, "ESSAY");
    try {
      generateExam(r, { shuffleQuestions: true, shuffleOptions: true });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(NotEnoughQuestionsError);
      expect((e as NotEnoughQuestionsError).shortages).toEqual([{ position: 3, required: 5, available: 3 }]);
    }
  });

  it("shuffles multiple-choice options but keeps True/False in order", () => {
    const r: RuleWithPool[] = [
      { id: "mcq", position: 1, questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 20, pool: pool("M", 20) },
      { id: "tf", position: 2, questionType: "TRUE_FALSE", difficulty: "EASY", marksPerQuestion: 1, questionCount: 5, pool: pool("T", 5, "TRUE_FALSE") },
    ];
    const exam = generateExam(r, { shuffleQuestions: false, shuffleOptions: true });
    const mcq = exam.filter((q) => q.ruleId === "mcq");
    expect(mcq.some((q) => q.optionOrder.join() !== ["a", "b", "c", "d"].map((o) => `${q.versionId}-${o}`).join())).toBe(true);
    for (const q of mcq) expect([...q.optionOrder].sort()).toEqual(["a", "b", "c", "d"].map((o) => `${q.versionId}-${o}`));
    for (const q of exam.filter((x) => x.ruleId === "tf")) expect(q.optionOrder).toEqual([`${q.versionId}-t`, `${q.versionId}-f`]);
  });

  it("keeps rule order and bank order when question shuffling is off", () => {
    const r = rules();
    const exam = generateExam(r, { shuffleQuestions: false, shuffleOptions: false });
    expect(exam.slice(0, 10).every((q) => q.ruleId === "easy")).toBe(true);
    expect(exam.slice(10, 18).every((q) => q.ruleId === "medium")).toBe(true);
    const easyNumbers = exam.slice(0, 10).map((q) => Number(q.versionId.slice(1)));
    expect(easyNumbers).toEqual([...easyNumbers].sort((a, b) => a - b));
    for (const q of exam.filter((x) => x.ruleId !== "hard")) expect(q.optionOrder[0].endsWith("-a")).toBe(true);
  });

  it("shuffle keeps every item exactly once", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const s = shuffle(items);
    expect([...s].sort((a, b) => a - b)).toEqual(items);
    expect(s).not.toEqual(items);
  });
});
