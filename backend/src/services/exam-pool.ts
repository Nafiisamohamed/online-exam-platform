/**
 * Loads an exam's rules together with their pools of eligible questions, for
 * the exam generator (exam-generator.ts) and the "enough questions" check
 * (section 4.4).
 *
 * A question is eligible for a rule when it belongs to the exam's course, is
 * not archived, and its CURRENT version has the rule's type, difficulty and
 * mark value, and (if the rule lists topics) one of those topics. Rules never
 * share questions, because no two rules of an exam have the same
 * type + difficulty + marks (database unique constraint).
 */
import type { Db } from "../db/prisma.ts";
import { num0 } from "../lib/format.ts";
import type { PoolQuestion, RuleWithPool } from "./exam-generator.ts";

export interface RuleSpec {
  id: string;
  position: number;
  questionType: PoolQuestion["type"];
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marksPerQuestion: number;
  questionCount: number;
  topicIds: string[];
}

/** Eligible current versions for one rule, oldest question first. */
export async function poolFor(db: Db, courseId: string, rule: Omit<RuleSpec, "id" | "position" | "questionCount">) {
  const rows = await db.question.findMany({
    where: {
      courseId,
      isArchived: false,
      currentVersion: {
        type: rule.questionType,
        difficulty: rule.difficulty,
        marks: rule.marksPerQuestion,
        ...(rule.topicIds.length ? { topicId: { in: rule.topicIds } } : {}),
      },
    },
    orderBy: { createdAt: "asc" },
    select: { currentVersion: { select: { id: true, type: true, options: { select: { id: true }, orderBy: { position: "asc" } } } } },
  });
  return rows.map((r) => r.currentVersion!).map((v) => ({ versionId: v.id, type: v.type, optionIds: v.options.map((o) => o.id) }));
}

/** The exam's rules as plain values. */
export async function loadRuleSpecs(db: Db, examId: string): Promise<RuleSpec[]> {
  const rules = await db.examRule.findMany({ where: { examId }, include: { topics: true }, orderBy: { position: "asc" } });
  return rules.map((r) => ({
    id: r.id,
    position: r.position,
    questionType: r.questionType,
    difficulty: r.difficulty,
    marksPerQuestion: num0(r.marksPerQuestion),
    questionCount: r.questionCount,
    topicIds: r.topics.map((t) => t.topicId),
  }));
}

/**
 * Rules with pools. With `examIdForUsage`, each question's usage counts how
 * many attempts of that exam already received it (for least-used-first draws).
 */
export async function rulesWithPools(db: Db, courseId: string, rules: RuleSpec[], examIdForUsage?: string): Promise<RuleWithPool[]> {
  const usage = new Map<string, number>();
  if (examIdForUsage) {
    const counts = await db.attemptQuestion.groupBy({ by: ["questionVersionId"], where: { attempt: { examId: examIdForUsage } }, _count: { _all: true } });
    for (const c of counts) usage.set(c.questionVersionId, c._count._all);
  }
  const out: RuleWithPool[] = [];
  for (const r of rules) {
    const pool = await poolFor(db, courseId, r);
    out.push({ ...r, pool: pool.map((q) => ({ ...q, usage: usage.get(q.versionId) ?? 0 })) });
  }
  return out;
}
