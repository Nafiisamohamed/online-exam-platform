/**
 * Analytics endpoints (ADMIN, LECTURER). See docs/api.md#analytics.
 *
 * GET /api/exams/:id/analytics     exam statistics + per-question difficulty index and discrimination
 * GET /api/analytics/dashboard     chart data: average score by course, score distribution,
 *                                  exam and attempt counts; admin also payments, users and SMS
 */
import { Router } from "express";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, validate } from "../../middleware/validate.ts";
import * as analytics from "./analytics.service.ts";

export const analyticsRouter = Router();

const staff = [authenticate(), requireRole("ADMIN", "LECTURER")];

analyticsRouter.get("/exams/:id/analytics", ...staff, validate({ params: idParams }), async (req, res) => {
  res.json(await analytics.examAnalytics(currentUser(req), req.valid.params.id));
});

analyticsRouter.get("/analytics/dashboard", ...staff, async (req, res) => {
  res.json(await analytics.dashboard(currentUser(req)));
});
