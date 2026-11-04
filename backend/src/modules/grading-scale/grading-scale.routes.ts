/**
 * Grading scale endpoints (D6). See docs/api.md#grading-scale.
 *
 * GET /api/grading-scale   any logged-in user
 * PUT /api/grading-scale   ADMIN  replaces the whole scale:
 *   { bands: [{ letter: "A", minPercentage: 90 }, ...] }
 *   Rules: 2-12 bands, unique letters and minimums, one band starting at 0.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { validate } from "../../middleware/validate.ts";
import { loadScale, replaceScale } from "./grading-scale.ts";

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
  res.json({ bands: await replaceScale(req.valid.body.bands, currentUser(req).id, req) });
});
