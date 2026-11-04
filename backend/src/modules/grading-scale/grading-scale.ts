/**
 * University grading scale (D6: editable data, provisional A 90 / B 80 /
 * C 70 / D 60 / F 0). See docs/api.md#grading-scale.
 *
 * GET /api/grading-scale   any logged-in user
 * PUT /api/grading-scale   ADMIN  replaces the whole scale:
 *   { bands: [{ letter: "A", minPercentage: 90 }, ...] }
 *   Rules: 2-12 bands, unique letters and minimums, one band starting at 0.
 *
 * Letters are copied into each grade when it is calculated, so changing the
 * scale never alters results that were already published.
 */
import { Router } from "express";
import { z } from "zod";
import type { Db } from "../../db/prisma.ts";
import { prisma, transaction } from "../../db/prisma.ts";
import { num } from "../../lib/format.ts";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { validate } from "../../middleware/validate.ts";
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

export const gradingScaleRouter = Router();

gradingScaleRouter.use(authenticate());

gradingScaleRouter.get("/", async (_req, res) => {
  res.json({ bands: await loadScale() });
});

const bandsBody = z.object({
  bands: z
    .array(z.object({ letter: z.string().trim().min(1).max(3), minPercentage: z.number().min(0).max(100) }))
    .min(2)
    .max(12)
    .refine((b) => new Set(b.map((x) => x.letter.toUpperCase())).size === b.length, "letters must be unique")
    .refine((b) => new Set(b.map((x) => x.minPercentage)).size === b.length, "minimum percentages must be unique")
    .refine((b) => b.some((x) => x.minPercentage === 0), "one band must start at 0"),
});

gradingScaleRouter.put("/", requireRole("ADMIN"), validate({ body: bandsBody }), async (req, res) => {
  const bands = [...req.valid.body.bands].sort((a, b) => b.minPercentage - a.minPercentage);
  await transaction(async (tx) => {
    await tx.gradingScale.deleteMany({});
    await tx.gradingScale.createMany({
      data: bands.map((b, i) => ({ letter: b.letter.toUpperCase(), minPercentage: b.minPercentage, sortOrder: i + 1 })),
    });
    await audit(tx, { actorId: currentUser(req).id, action: "GRADING_SCALE_UPDATED", entityType: "grading_scale", details: { bands }, req });
  });
  res.json({ bands: await loadScale() });
});
