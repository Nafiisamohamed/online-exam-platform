/**
 * University grading scale (D6: editable data, provisional A 90 / B 80 /
 * C 70 / D 60 / F 0).
 *
 * Letters are copied into each grade when it is calculated, so changing the
 * scale never alters results that were already published.
 */
import type { Request } from "express";
import type { Db } from "../../db/prisma.ts";
import { prisma, transaction } from "../../db/prisma.ts";
import { num } from "../../lib/format.ts";
import { audit } from "../../services/audit.ts";

export const DEFAULT_SCALE = [
  { letter: "A", minPercentage: 90 },
  { letter: "B", minPercentage: 80 },
  { letter: "C", minPercentage: 70 },
  { letter: "D", minPercentage: 60 },
  { letter: "F", minPercentage: 0 },
];

/** The scale sorted from the highest band down. Uses the defaults if the table is empty. */
export async function loadScale(db: Db = prisma): Promise<{ letter: string; minPercentage: number }[]> {
  const rows = await db.gradingScale.findMany({ orderBy: { minPercentage: "desc" } });
  if (rows.length === 0) return DEFAULT_SCALE;
  return rows.map((r) => ({ letter: r.letter, minPercentage: num(r.minPercentage)! }));
}

/** Letter for a percentage: the highest band whose minimum is reached. */
export function letterFor(percentage: number, scale: { letter: string; minPercentage: number }[]): string {
  const sorted = [...scale].sort((a, b) => b.minPercentage - a.minPercentage);
  return (sorted.find((b) => percentage >= b.minPercentage) ?? sorted[sorted.length - 1]).letter;
}

/** Replaces the whole scale (validated by the route) and audits the change. */
export async function replaceScale(bands: { letter: string; minPercentage: number }[], actorId: string, req: Request) {
  const sorted = [...bands].sort((a, b) => b.minPercentage - a.minPercentage);
  await transaction(async (tx) => {
    await tx.gradingScale.deleteMany({});
    await tx.gradingScale.createMany({
      data: sorted.map((b, i) => ({ letter: b.letter.toUpperCase(), minPercentage: b.minPercentage, sortOrder: i + 1 })),
    });
    await audit(tx, { actorId, action: "GRADING_SCALE_UPDATED", entityType: "grading_scale", details: { bands: sorted }, req });
  });
  return loadScale();
}
