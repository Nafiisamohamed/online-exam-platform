/**
 * CSV import endpoints (sections 4.1 and 4.3). See docs/api.md#csv-imports.
 *
 * GET  /api/imports/templates/enrolments.csv           ADMIN     empty template with the columns
 * POST /api/imports/enrolments        (multipart)      ADMIN     file + semester -> preview
 * GET  /api/imports/:id                                uploader  the stored preview / result
 * POST /api/imports/:id/confirm                        uploader  save the valid rows
 * Question previews are uploaded with POST /api/courses/:courseId/question-imports
 * (questions module) and confirmed here too.
 */
import { Router } from "express";
import { z } from "zod";
import { semesterLabel } from "../../lib/semester-label.ts";
import { csvUpload, toCsv } from "../../lib/uploads.ts";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, validate } from "../../middleware/validate.ts";
import { ENROLMENT_COLUMNS, previewEnrolmentImport } from "./enrolment-import.ts";
import * as imports from "./imports.service.ts";

export const importsRouter = Router();

importsRouter.use(authenticate());

importsRouter.get("/templates/enrolments.csv", requireRole("ADMIN"), (_req, res) => {
  res.type("text/csv").attachment("enrolment-template.csv").send(toCsv(ENROLMENT_COLUMNS, [["", "Hodan Maxamed Cali", "+252615123401", "CS201;CS105"]]));
});

/** Multipart: file (CSV), semester (a course label such as "2026/2027 S1" or "2026-Fall"). Response 201: { batch, rows }. */
importsRouter.post("/enrolments", requireRole("ADMIN"), csvUpload, validate({ body: z.object({ semester: semesterLabel }) }), async (req, res) => {
  res.status(201).json(await previewEnrolmentImport(req.file, req.valid.body.semester, currentUser(req).id));
});

/** The batch with every row's status and error codes. Only the uploader (or an admin) can read it. */
importsRouter.get("/:id", requireRole("ADMIN", "LECTURER"), validate({ params: idParams }), async (req, res) => {
  res.json(await imports.getBatch(currentUser(req), req.valid.params.id));
});

/** Saves the valid rows. Enrolment imports also return { temporaryPasswords } once. */
importsRouter.post("/:id/confirm", requireRole("ADMIN", "LECTURER"), validate({ params: idParams }), async (req, res) => {
  res.json(await imports.confirmBatch(currentUser(req), req.valid.params.id, req));
});
