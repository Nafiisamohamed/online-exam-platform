/**
 * Fair randomized exam generation (section 3, completion condition 1).
 *
 * Input: the exam's rules (D5/P2: each rule = N questions of one type, one
 * difficulty and one mark value) and, per rule, the pool of eligible question
 * versions. Output: the frozen list of questions one student receives.
 *
 * Fairness:
 * - Every student gets exactly the same number of questions of each type,
 *   difficulty and mark value, so all exams have the same difficulty mix and
 *   the same total marks.
 * - Inside each pool, the least-used questions of this exam are drawn first,
 *   with random tie-breaks. Two students therefore receive different
 *   questions whenever the pool has enough questions (with a pool of P and a
 *   rule of N, the second student gets min(N, P - N) different questions),
 *   instead of relying on luck.
 * - Question order (if shuffleQuestions) and multiple-choice option order (if
 *   shuffleOptions) are shuffled per student. True/False options keep the
 *   order True, False.
 *
 * Randomness comes from crypto.randomInt (not Math.random). Tests can pass
 * their own random function.
 *
 * This module is pure (no database access).
 */
import { randomInt } from "node:crypto";

export interface PoolQuestion {
  versionId: string;
  type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
  /** Option ids in their stored order (position 1, 2, ...). Empty for short answer / essay. */
  optionIds: string[];
  /** How many attempts of this exam already received this question. */
  usage: number;
}

export interface RuleWithPool {
  id: string;
  position: number;
  questionType: PoolQuestion["type"];
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marksPerQuestion: number;
  questionCount: number;
  /** Eligible questions, in bank order (oldest first). */
  pool: PoolQuestion[];
}

export interface GeneratedQuestion {
  position: number;
  ruleId: string;
  versionId: string;
  marks: number;
  optionOrder: string[];
}

/** Returns an integer in [0, max). */
export type RandomInt = (max: number) => number;
export const cryptoRandom: RandomInt = (max) => randomInt(max);

export class NotEnoughQuestionsError extends Error {
  constructor(readonly shortages: { position: number; required: number; available: number }[]) {
    super("NOT_ENOUGH_QUESTIONS");
  }
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[], rand: RandomInt = cryptoRandom): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Rules whose pool is smaller than their question count. */
export function shortages(rules: Pick<RuleWithPool, "position" | "questionCount" | "pool">[]) {
  return rules
    .filter((r) => r.pool.length < r.questionCount)
    .map((r) => ({ position: r.position, required: r.questionCount, available: r.pool.length }));
}

/** Picks `count` questions: least used first, random among equals. */
export function pickLeastUsed(pool: PoolQuestion[], count: number, rand: RandomInt = cryptoRandom): PoolQuestion[] {
  const tagged = shuffle(pool, rand).map((q, i) => ({ q, tie: i }));
  tagged.sort((a, b) => a.q.usage - b.q.usage || a.tie - b.tie);
  return tagged.slice(0, count).map((t) => t.q);
}

/**
 * Generates one student's exam.
 * @throws NotEnoughQuestionsError when any rule's pool is too small.
 */
export function generateExam(
  rules: RuleWithPool[],
  options: { shuffleQuestions: boolean; shuffleOptions: boolean },
  rand: RandomInt = cryptoRandom,
): GeneratedQuestion[] {
  const short = shortages(rules);
  if (short.length) throw new NotEnoughQuestionsError(short);

  const picked: Omit<GeneratedQuestion, "position">[] = [];
  for (const rule of [...rules].sort((a, b) => a.position - b.position)) {
    const chosen = pickLeastUsed(rule.pool, rule.questionCount, rand);
    // Without question shuffling, questions keep the bank order inside each rule.
    const ordered = options.shuffleQuestions ? chosen : rule.pool.filter((q) => chosen.includes(q));
    for (const q of ordered) {
      const optionOrder =
        q.type === "MCQ" && options.shuffleOptions ? shuffle(q.optionIds, rand) : [...q.optionIds];
      picked.push({ ruleId: rule.id, versionId: q.versionId, marks: rule.marksPerQuestion, optionOrder });
    }
  }
  const finalOrder = options.shuffleQuestions ? shuffle(picked, rand) : picked;
  return finalOrder.map((q, i) => ({ ...q, position: i + 1 }));
}
