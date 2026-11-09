/**
 * Semester fee endpoints (Phase 4). See docs/api.md#semester-fees.
 *
 * GET   /api/semester-fees            ADMIN  ?academicYearId, facultyId
 * POST  /api/semester-fees            ADMIN  { academicYearId, facultyId, semesterNumber, amount, currency? }
 * PATCH /api/semester-fees/:id        ADMIN  { amount?, currency? }
 * GET   /api/fee-status               ADMIN  ?academicYearId (required), facultyId, semesterNumber, status, search, page, pageSize
 * POST  /api/fee-reminders            ADMIN  { academicYearId, facultyId?, semesterNumber?, studentIds? }
 * GET   /api/my/fees                  STUDENT: own semester fees, balances and payments
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, pageQuery, validate, zid } from "../../middleware/validate.ts";
import * as fees from "./fees.service.ts";

export const feesRouter = Router();

const money = z.number().positive().max(100_000).refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "at most 2 decimals");
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const semesterNumber = z.coerce.number().int().min(1).max(8);

feesRouter.get("/semester-fees", authenticate(), requireRole("ADMIN"), validate({ query: z.object({ academicYearId: zid.optional(), facultyId: zid.optional() }) }), async (req, res) => {
  res.json({ items: await fees.listFees(req.valid.query) });
});

feesRouter.post(
  "/semester-fees",
  authenticate(), requireRole("ADMIN"),
  validate({ body: z.object({ academicYearId: zid, facultyId: zid, semesterNumber, amount: money, currency: currency.optional() }) }),
  async (req, res) => {
    res.status(201).json({ fee: await fees.createFee(req.valid.body, currentUser(req).id, req) });
  },
);

feesRouter.patch(
  "/semester-fees/:id",
  authenticate(), requireRole("ADMIN"),
  validate({ params: idParams, body: z.object({ amount: money.optional(), currency: currency.optional() }).refine((v) => Object.keys(v).length > 0, "send at least one field") }),
  async (req, res) => {
    res.json({ fee: await fees.updateFee(req.valid.params.id, req.valid.body, currentUser(req).id, req) });
  },
);

feesRouter.get(
  "/fee-status",
  authenticate(), requireRole("ADMIN"),
  validate({ query: pageQuery.extend({ academicYearId: zid, facultyId: zid.optional(), semesterNumber: semesterNumber.optional(), status: z.enum(["PAID", "PARTIAL", "UNPAID", "NO_FEE"]).optional(), search: z.string().trim().min(1).max(100).optional() }) }),
  async (req, res) => {
    res.json(await fees.feeStatus(req.valid.query));
  },
);

feesRouter.post(
  "/fee-reminders",
  authenticate(), requireRole("ADMIN"),
  validate({ body: z.object({ academicYearId: zid, facultyId: zid.optional(), semesterNumber: semesterNumber.optional(), studentIds: z.array(zid).max(5000).optional() }) }),
  async (req, res) => {
    res.json(await fees.sendReminders(req.valid.body, currentUser(req).id, req));
  },
);

feesRouter.get("/my/fees", authenticate(), requireRole("STUDENT"), async (req, res) => {
  res.json(await fees.myFees(currentUser(req)));
});
