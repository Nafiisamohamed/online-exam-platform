/**
 * CSV import endpoints (sections 4.1 and 4.3). See docs/api.md#csv-imports.
 *
 * GET  /api/imports/templates/enrolments.csv           ADMIN     empty template with the columns
 * POST /api/imports/enrolments        (multipart)      ADMIN     file + semester -> preview
 * GET  /api/imports/:id                                uploader  the stored preview / result
 * POST /api/imports/:id/confirm                        uploader  save the valid rows
 * (question imports are added by the questions module)
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.ts";
import { notFound } from "../../lib/errors.ts";
import { csvUpload, toCsv } from "../../lib/uploads.ts";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, validate } from "../../middleware/validate.ts";
import { confirmEnrolmentImport, ENROLMENT_COLUMNS, previewEnrolmentImport } from "./enrolment-import.ts";

export const importsRouter = Router();

importsRouter.use(authenticate());

importsRouter.get("/templates/enrolments.csv", requireRole("ADMIN"), (_req, res) => {
  res.type("text/csv").attachment("enrolment-template.csv").send(toCsv(ENROLMENT_COLUMNS, [["DEMO-2026-0101", "Hodan Maxamed Cali", "+252615123401", "CS201;CS105"]]));
});

/** Multipart: file (CSV), semester (e.g. "2026-Fall"). Response 201: { batch, rows }. */
importsRouter.post("/enrolments", requireRole("ADMIN"), csvUpload, validate({ body: z.object({ semester: z.string().trim().regex(/^\d{4}-[A-Za-z]{3,10}$/) }) }), async (req, res) => {
  res.status(201).json(await previewEnrolmentImport(req.file, req.valid.body.semester, currentUser(req).id));
});

/** The batch with every row's status and error codes. Only the uploader (or an admin) can read it. */
importsRouter.get("/:id", requireRole("ADMIN", "LECTURER"), validate({ params: idParams }), async (req, res) => {
  const user = currentUser(req);
  const batch = await prisma.importBatch.findUnique({ where: { id: req.valid.params.id } });
  if (!batch || (user.role !== "ADMIN" && batch.uploadedById !== user.id)) throw notFound("IMPORT_NOT_FOUND");
  const { rowResults, ...rest } = batch;
  res.json({ batch: rest, rows: rowResults });
});

/** Saves the valid rows. Enrolment imports also return { temporaryPasswords } once. */
importsRouter.post("/:id/confirm", requireRole("ADMIN", "LECTURER"), validate({ params: idParams }), async (req, res) => {
  const user = currentUser(req);
  const batch = await prisma.importBatch.findUnique({ where: { id: req.valid.params.id } });
  if (!batch || batch.uploadedById !== user.id) throw notFound("IMPORT_NOT_FOUND");
  if (batch.type === "ENROLMENTS") {
    if (user.role !== "ADMIN") throw notFound("IMPORT_NOT_FOUND");
    return res.json(await confirmEnrolmentImport(batch.id, user.id, req));
  }
  throw notFound("IMPORT_NOT_FOUND");
});
