/**
 * Shared CSV import actions: reading a stored preview and confirming it.
 * Only the person who uploaded a batch can confirm it; an admin may also read
 * any batch. The type-specific rules live in enrolment-import.ts and
 * ../questions/question-import.ts.
 */
import type { Request } from "express";
import { findImportBatch } from "../../repositories/imports.repository.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { notFound } from "../../lib/errors.ts";
import { confirmQuestionImport } from "../questions/question-import.ts";
import { confirmEnrolmentImport } from "./enrolment-import.ts";

/** The batch with every row's status and error codes. @throws 404 IMPORT_NOT_FOUND */
export async function getBatch(user: AuthUser, id: string) {
  const batch = await findImportBatch(id);
  if (!batch || (user.role !== "ADMIN" && batch.uploadedById !== user.id)) throw notFound("IMPORT_NOT_FOUND");
  const { rowResults, course: _course, ...rest } = batch;
  return { batch: rest, rows: rowResults };
}

/** Saves the valid rows of the uploader's own PREVIEW batch. */
export async function confirmBatch(user: AuthUser, id: string, req: Request) {
  const batch = await findImportBatch(id);
  if (!batch || batch.uploadedById !== user.id) throw notFound("IMPORT_NOT_FOUND");
  if (batch.type === "ENROLMENTS") {
    if (user.role !== "ADMIN") throw notFound("IMPORT_NOT_FOUND");
    return confirmEnrolmentImport(batch.id, user.id, req);
  }
  return confirmQuestionImport(batch.id, user, req);
}
