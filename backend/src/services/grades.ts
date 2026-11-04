/**
 * Working grade of an attempt (the `grades` table).
 *
 * total = sum of awarded marks (answers still waiting for a lecturer count as
 * 0 for now), max = sum of the attempt's question marks, percentage rounded to
 * 2 decimals, letter from the current grading scale. Recalculated after
 * submission and after every grading change. Students never read this table
 * directly: they only see published snapshots (grade_revisions, P1).
 */
import type { Db } from "../db/prisma.ts";
import { num0 } from "../lib/format.ts";
import { letterFor, loadScale } from "../modules/grading-scale/grading-scale.ts";

export function computeTotals(items: { marks: number; awarded: number | null }[]) {
  const total = Math.round(items.reduce((s, i) => s + (i.awarded ?? 0), 0) * 100) / 100;
  const max = Math.round(items.reduce((s, i) => s + i.marks, 0) * 100) / 100;
  const percentage = max > 0 ? Math.round((total / max) * 10000) / 100 : 0;
  return { total, max, percentage };
}

/** Recalculates and saves the working grade of one submitted attempt. */
export async function recalcGrade(db: Db, attemptId: string) {
  const questions = await db.attemptQuestion.findMany({ where: { attemptId }, select: { marks: true, answer: { select: { marksAwarded: true } } } });
  const { total, max, percentage } = computeTotals(
    questions.map((q) => ({ marks: num0(q.marks), awarded: q.answer?.marksAwarded == null ? null : num0(q.answer.marksAwarded) })),
  );
  if (max <= 0) return null;
  const letterGrade = letterFor(percentage, await loadScale(db));
  return db.grade.upsert({
    where: { attemptId },
    create: { attemptId, totalScore: total, maxScore: max, percentage, letterGrade },
    update: { totalScore: total, maxScore: max, percentage, letterGrade, calculatedAt: new Date() },
  });
}
