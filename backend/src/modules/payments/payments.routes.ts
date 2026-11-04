/**
 * Simulated payment endpoints (section 7). See docs/api.md#payments-simulated.
 *
 * POST /api/payments                     STUDENT { examId, provider, phone, idempotencyKey } (201 new, 200 same payment)
 * GET  /api/payments                     STUDENT own; ADMIN all (examId, status, provider)
 * GET  /api/payments/:id                 owner or ADMIN
 * POST /api/payments/:id/confirm         STUDENT { accept: true | false }  (Yes / No)
 * POST /api/payments/:id/pin             STUDENT { pin }  rate limited; never logged
 * POST /api/payments/:id/cancel          STUDENT
 * GET  /api/payments/:id/receipt.pdf     owner or ADMIN, SUCCESS only (?lang=so|en)
 *
 * The amount is never accepted from the browser.
 */
import { Router } from "express";
import { z } from "zod";
import { registerJob } from "../../jobs/scheduler.ts";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { pinLimiter } from "../../middleware/rate-limits.ts";
import { idParams, validate, zid } from "../../middleware/validate.ts";
import { phoneField } from "../users/users.routes.ts";
import * as payments from "./payments.service.ts";

registerJob({ name: "payment-expiry", run: () => payments.expireDuePayments() });

export const paymentsRouter = Router();

paymentsRouter.use(authenticate());

/** `.strict()` rejects extra fields such as "amount", so a changed price can never be sent. */
const createBody = z
  .object({ examId: zid, provider: z.enum(["EVC_PLUS", "ZAAD", "EDAHAB"]), phone: phoneField, idempotencyKey: zid })
  .strict();

paymentsRouter.post("/", requireRole("STUDENT"), validate({ body: createBody }), async (req, res) => {
  const result = await payments.createPayment(currentUser(req), req.valid.body, req);
  res.status(result.reused ? 200 : 201).json(result);
});

paymentsRouter.get(
  "/",
  requireRole("STUDENT", "ADMIN"),
  validate({ query: z.object({ examId: zid.optional(), status: z.enum(["PENDING_CONFIRMATION", "PENDING_PIN", "SUCCESS", "FAILED", "CANCELLED", "EXPIRED"]).optional(), provider: z.enum(["EVC_PLUS", "ZAAD", "EDAHAB"]).optional() }) }),
  async (req, res) => {
    res.json({ items: await payments.listPayments(currentUser(req), req.valid.query) });
  },
);

paymentsRouter.get("/:id", requireRole("STUDENT", "ADMIN"), validate({ params: idParams }), async (req, res) => {
  res.json({ payment: await payments.getPayment(currentUser(req), req.valid.params.id) });
});

paymentsRouter.post("/:id/confirm", requireRole("STUDENT"), validate({ params: idParams, body: z.object({ accept: z.boolean() }) }), async (req, res) => {
  res.json({ payment: await payments.confirmPayment(currentUser(req), req.valid.params.id, req.valid.body.accept, req) });
});

/** Response 200: { result: "SUCCESS" | "WRONG_PIN" | "FAILED", payment }. */
paymentsRouter.post("/:id/pin", requireRole("STUDENT"), pinLimiter, validate({ params: idParams, body: z.object({ pin: z.string().regex(/^\d{4,6}$/, "4-6 digits") }) }), async (req, res) => {
  res.json(await payments.submitPin(currentUser(req), req.valid.params.id, req.valid.body.pin, req));
});

paymentsRouter.post("/:id/cancel", requireRole("STUDENT"), validate({ params: idParams }), async (req, res) => {
  res.json({ payment: await payments.cancelPayment(currentUser(req), req.valid.params.id, req) });
});

paymentsRouter.get("/:id/receipt.pdf", requireRole("STUDENT", "ADMIN"), validate({ params: idParams, query: z.object({ lang: z.enum(["so", "en"]).optional() }) }), async (req, res) => {
  const user = currentUser(req);
  const { pdf, filename } = await payments.receiptPdf(user, req.valid.params.id, req.valid.query.lang ?? user.preferredLanguage);
  res.type("application/pdf").attachment(filename).send(pdf);
});
