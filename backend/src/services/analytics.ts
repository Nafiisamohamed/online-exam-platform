/**
 * Question analytics and exam statistics (section 4.13). Pure functions; the
 * analytics module loads the data.
 *
 * Difficulty index: percentage of students who answered a question correctly.
 *   - MCQ, True/False and auto-graded short answers: correct = full marks.
 *   - Essays and hand-graded short answers (D10): correct = at least 50% of
 *     the question's marks. The average mark percentage is shown as well.
 *   Answers still waiting for a lecturer are left out.
 * Discrimination (D9, upper-lower 27% method): students are ranked by their
 *   exam percentage; the top 27% and the bottom 27% are compared.
 *   D = (share correct in the top group) - (share correct in the bottom group),
 *   counting only group members who received the question (each student gets
 *   a different set). Range -1..+1; above 0.3 is good, near 0 or negative
 *   means the question needs review.
 * Flags: answered by fewer than 5 students -> NOT_ENOUGH_DATA (no other flag);
 *   difficulty index below 20% -> LOW_CORRECT_RATE; above 95% -> HIGH_CORRECT_RATE.
 */

export const MIN_STUDENTS = 5;
export const LOW_THRESHOLD = 20;
export const HIGH_THRESHOLD = 95;
export const GROUP_SHARE = 0.27;

export interface AnswerFact {
  attemptId: string;
  questionVersionId: string;
  type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
  maxMarks: number;
  awarded: number | null;
  gradingStatus: string | null;
}

export interface AttemptScore {
  attemptId: string;
  percentage: number;
  totalScore: number;
  maxScore: number;
}

const PENDING = new Set(["NEEDS_REVIEW", "PENDING_ESSAY", "AWAITING_SECOND_GRADE", "DISCREPANCY"]);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Is this answer counted as correct? null = not gradable yet. */
export function isCorrect(a: AnswerFact): boolean | null {
  if (!a.gradingStatus || PENDING.has(a.gradingStatus) || a.awarded === null) return a.gradingStatus === "NOT_ANSWERED" ? false : null;
  const manual = a.type === "ESSAY" || a.gradingStatus === "GRADED";
  return manual ? a.awarded >= 0.5 * a.maxMarks - 1e-9 : a.awarded >= a.maxMarks - 1e-9;
}

/** Average, highest, lowest and a 10-band distribution of percentages. */
export function examStatistics(scores: AttemptScore[]) {
  const n = scores.length;
  const bands = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9.99, count: 0 }));
  for (const s of scores) bands[Math.min(9, Math.floor(s.percentage / 10))].count++;
  if (n === 0) return { students: 0, average: null, highest: null, lowest: null, averageScore: null, distribution: bands };
  const pct = scores.map((s) => s.percentage);
  return {
    students: n,
    average: round(pct.reduce((a, b) => a + b, 0) / n),
    highest: round(Math.max(...pct)),
    lowest: round(Math.min(...pct)),
    averageScore: round(scores.reduce((a, s) => a + s.totalScore, 0) / n),
    distribution: bands,
  };
}

/** Upper and lower 27% groups of attempts (by percentage). */
export function groups(scores: AttemptScore[]) {
  const sorted = [...scores].sort((a, b) => b.percentage - a.percentage);
  const size = Math.max(1, Math.round(sorted.length * GROUP_SHARE));
  return { upper: new Set(sorted.slice(0, size).map((s) => s.attemptId)), lower: new Set(sorted.slice(-size).map((s) => s.attemptId)) };
}

/** Per-question statistics for every question version used in the exam. */
export function questionStatistics(facts: AnswerFact[], scores: AttemptScore[]) {
  const { upper, lower } = groups(scores);
  const byVersion = new Map<string, AnswerFact[]>();
  for (const f of facts) byVersion.set(f.questionVersionId, [...(byVersion.get(f.questionVersionId) ?? []), f]);

  return [...byVersion.entries()].map(([questionVersionId, list]) => {
    const graded = list.map((f) => ({ f, ok: isCorrect(f) })).filter((x) => x.ok !== null) as { f: AnswerFact; ok: boolean }[];
    const n = graded.length;
    const correct = graded.filter((x) => x.ok).length;
    const share = (set: Set<string>) => {
      const inGroup = graded.filter((x) => set.has(x.f.attemptId));
      return inGroup.length ? inGroup.filter((x) => x.ok).length / inGroup.length : null;
    };
    const pu = share(upper);
    const pl = share(lower);
    const enough = n >= MIN_STUDENTS;
    const difficultyIndex = n ? round((correct / n) * 100) : null;
    const flags: string[] = [];
    if (!enough) flags.push("NOT_ENOUGH_DATA");
    else if (difficultyIndex! < LOW_THRESHOLD) flags.push("LOW_CORRECT_RATE");
    else if (difficultyIndex! > HIGH_THRESHOLD) flags.push("HIGH_CORRECT_RATE");
    const marked = graded.filter((x) => x.f.awarded !== null);
    return {
      questionVersionId,
      type: list[0].type,
      maxMarks: list[0].maxMarks,
      timesUsed: list.length,
      answered: n,
      correct,
      difficultyIndex: enough ? difficultyIndex : null,
      discrimination: enough && pu !== null && pl !== null ? round(pu - pl) : null,
      averageMarkPercent: enough && marked.length ? round((marked.reduce((s, x) => s + x.f.awarded! / x.f.maxMarks, 0) / marked.length) * 100) : null,
      flags,
    };
  });
}
