/** Question analytics formulas (4.13, D9, D10). */
import { describe, expect, it } from "vitest";
import { type AnswerFact, examStatistics, groups, isCorrect, questionStatistics } from "../../src/services/analytics.ts";

const score = (attemptId: string, percentage: number) => ({ attemptId, percentage, totalScore: percentage / 10, maxScore: 10 });
const fact = (attemptId: string, questionVersionId: string, awarded: number, status = awarded > 0 ? "AUTO_CORRECT" : "AUTO_INCORRECT", type: AnswerFact["type"] = "MCQ", maxMarks = 1): AnswerFact => ({
  attemptId, questionVersionId, type, maxMarks, awarded, gradingStatus: status,
});

describe("exam statistics", () => {
  it("computes average, highest, lowest and the distribution", () => {
    const s = examStatistics([score("a", 95), score("b", 72.5), score("c", 40), score("d", 100)]);
    expect(s).toMatchObject({ students: 4, average: 76.88, highest: 100, lowest: 40 });
    expect(s.distribution.map((b) => b.count)).toEqual([0, 0, 0, 0, 1, 0, 0, 1, 0, 2]);
  });
});

describe("question analytics", () => {
  const ten = Array.from({ length: 10 }, (_, i) => score(`s${i}`, 100 - i * 10));

  it("difficulty index = share correct; essays count as correct from 50% of the marks", () => {
    expect(isCorrect(fact("a", "q", 7, "GRADED", "ESSAY", 10))).toBe(true);
    expect(isCorrect(fact("a", "q", 4.5, "GRADED", "ESSAY", 10))).toBe(false);
    expect(isCorrect(fact("a", "q", 0, "PENDING_ESSAY", "ESSAY", 10))).toBeNull();
    expect(isCorrect(fact("a", "q", 0, "NOT_ANSWERED"))).toBe(false);
  });

  it("uses the upper and lower 27% groups for discrimination", () => {
    const g = groups(ten);
    expect([...g.upper]).toEqual(["s0", "s1", "s2"]);
    expect([...g.lower]).toEqual(["s7", "s8", "s9"]);
    // Strong students right, weak students wrong: discrimination +1.
    const facts = ten.map((s, i) => fact(s.attemptId, "good", i < 5 ? 1 : 0));
    const [q] = questionStatistics(facts, ten);
    expect(q).toMatchObject({ difficultyIndex: 50, discrimination: 1, flags: [] });
    // The reverse: discrimination -1.
    const [r] = questionStatistics(ten.map((s, i) => fact(s.attemptId, "bad", i >= 5 ? 1 : 0)), ten);
    expect(r.discrimination).toBe(-1);
  });

  it("highlights questions answered correctly by under 20% or over 95%, and needs 5 students", () => {
    const hard = questionStatistics(ten.map((s, i) => fact(s.attemptId, "hard", i === 0 ? 1 : 0)), ten)[0];
    expect(hard).toMatchObject({ difficultyIndex: 10, flags: ["LOW_CORRECT_RATE"] });
    const easy = questionStatistics(ten.map((s) => fact(s.attemptId, "easy", 1)), ten)[0];
    expect(easy).toMatchObject({ difficultyIndex: 100, flags: ["HIGH_CORRECT_RATE"] });
    const few = questionStatistics(ten.slice(0, 4).map((s) => fact(s.attemptId, "few", 1)), ten)[0];
    expect(few).toMatchObject({ answered: 4, difficultyIndex: null, discrimination: null, flags: ["NOT_ENOUGH_DATA"] });
  });
});
