/**
 * SMS Management (registrar only). All SMS are SIMULATED: nothing leaves the system.
 *
 * GET   /api/sms-templates                ?active=true|false
 * POST  /api/sms-templates                { name, category, bodySo, bodyEn }
 * PATCH /api/sms-templates/:id            { name?, category?, bodySo?, bodyEn?, isActive? }
 * POST  /api/sms/recipients               { roles, facultyId?, academicYearId?, semesterNumber?, courseId?, userIds? } -> preview
 * POST  /api/sms/send                     the same + { templateId? | bodySo + bodyEn, sendSms, sendNotification }
 * POST  /api/sms-outbox/:id/retry         queue a FAILED message again
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, validate, zid } from "../../middleware/validate.ts";
import * as sms from "./sms.service.ts";

export const smsRouter = Router();
const registrar = [authenticate(), requireRole("ADMIN")];

const CATEGORIES = ["UPCOMING_EXAM", "SCHEDULE_APPROVED", "PAYMENT_REMINDER", "PAYMENT_CONFIRMATION", "RESULTS_PUBLISHED", "RESULTS_REVISED", "GENERAL"] as const;
const body = z.string().trim().min(1).max(459);
const templateBody = z.object({ name: z.string().trim().min(1).max(100), category: z.enum(CATEGORIES), bodySo: body, bodyEn: body });
const recipients = z.object({
  roles: z.array(z.enum(["STUDENT", "LECTURER", "INVIGILATOR"])).max(3).default([]),
  facultyId: zid.optional(),
  academicYearId: zid.optional(),
  semesterNumber: z.number().int().min(1).max(8).optional(),
  courseId: zid.optional(),
  userIds: z.array(zid).max(500).optional(),
});

smsRouter.get("/sms-templates", ...registrar, validate({ query: z.object({ active: z.enum(["true", "false"]).optional() }) }), async (req, res) => {
  res.json(await sms.listTemplates(req.valid.query.active === undefined ? undefined : req.valid.query.active === "true"));
});

smsRouter.post("/sms-templates", ...registrar, validate({ body: templateBody }), async (req, res) => {
  res.status(201).json({ template: await sms.createTemplate(req.valid.body, currentUser(req).id, req) });
});

smsRouter.patch(
  "/sms-templates/:id",
  ...registrar,
  validate({ params: idParams, body: templateBody.partial().extend({ isActive: z.boolean().optional() }).refine((b) => Object.keys(b).length > 0, "nothing to change") }),
  async (req, res) => {
    res.json({ template: await sms.updateTemplate(req.valid.params.id, req.valid.body, currentUser(req).id, req) });
  },
);

smsRouter.post("/sms/recipients", ...registrar, validate({ body: recipients }), async (req, res) => {
  res.json(await sms.previewRecipients(req.valid.body));
});

smsRouter.post(
  "/sms/send",
  ...registrar,
  validate({ body: recipients.extend({ templateId: zid.optional(), bodySo: body.optional(), bodyEn: body.optional(), sendSms: z.boolean().default(true), sendNotification: z.boolean().default(true) }) }),
  async (req, res) => {
    res.status(201).json(await sms.sendGroupMessage(req.valid.body, currentUser(req).id, req));
  },
);

smsRouter.post("/sms-outbox/:id/retry", ...registrar, validate({ params: idParams }), async (req, res) => {
  res.json(await sms.retrySms(req.valid.params.id, currentUser(req).id, req));
});
