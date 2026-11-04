/**
 * Enrolment CSV import (section 4.1, Admin / Registrar).
 *
 * File columns: student_id, student_name, phone, course_codes
 *   course_codes holds one or more codes separated by ";" "|" or spaces,
 *   e.g. "CS201;CS105". Codes are looked up in the semester the admin chooses.
 *
 * Workflow (same as the question import):
 * 1. preview: every row is validated and the results are stored in an
 *    import_batches row (status PREVIEW). Errors are codes, not sentences (P10).
 * 2. confirm: the rows are checked again and only VALID rows are saved:
 *    new students are created with temporary passwords (Q1) and enrolled;
 *    existing students are only enrolled. The temporary passwords are returned
 *    once, for the registrar to print or download, and stored only as hashes.
 *
 * Row error codes: STUDENT_ID_REQUIRED, STUDENT_ID_INVALID, STUDENT_NAME_REQUIRED,
 * PHONE_INVALID, COURSE_CODES_REQUIRED, COURSE_NOT_FOUND {code},
 * DUPLICATE_STUDENT_IN_FILE {firstRow}, STUDENT_NAME_MISMATCH {existingName}.
 */
import type { Request } from "express";
import { prisma, transaction } from "../../db/prisma.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { normalizeText } from "../../lib/format.ts";
import { generateTempPassword, hashPassword } from "../../lib/passwords.ts";
import { normalizeSomaliPhone } from "../../lib/phone.ts";
import { parseCsv } from "../../lib/uploads.ts";
import { audit } from "../../services/audit.ts";
import { queueSms } from "../../services/messaging.ts";
import { tempPasswordExpiry } from "../users/users.service.ts";

export const ENROLMENT_COLUMNS = ["student_id", "student_name", "phone", "course_codes"];

type RowError = { code: string; params?: Record<string, string | number> };
export interface EnrolmentRow {
  row: number;
  status: "VALID" | "INVALID";
  errors: RowError[];
  data: { studentNumber: string; fullName: string; phone: string; courseCodes: string[]; existingStudent: boolean; alreadyEnrolled: string[] };
}

/** Validates all rows against the database. Row numbers count the header as row 1. */
async function validateRows(rows: Record<string, string>[], semester: string): Promise<EnrolmentRow[]> {
  const courses = await prisma.course.findMany({ where: { semester }, select: { id: true, code: true } });
  const courseByCode = new Map(courses.map((c) => [c.code.toUpperCase(), c.id]));
  const numbers = rows.map((r) => (r.student_id ?? "").trim().toUpperCase()).filter(Boolean);
  const existing = await prisma.user.findMany({
    where: { studentNumber: { in: numbers } },
    select: { id: true, studentNumber: true, fullName: true, enrolments: { where: { status: "ACTIVE" }, select: { courseId: true } } },
  });
  const existingByNumber = new Map(existing.map((u) => [u.studentNumber!, u]));
  const firstRow = new Map<string, number>();

  return rows.map((raw, i) => {
    const row = i + 2;
    const errors: RowError[] = [];
    const studentNumber = (raw.student_id ?? "").trim().toUpperCase();
    const fullName = (raw.student_name ?? "").trim().replace(/\s+/g, " ");
    const phone = normalizeSomaliPhone(raw.phone ?? "");
    const courseCodes = [...new Set((raw.course_codes ?? "").split(/[;|\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];

    if (!studentNumber) errors.push({ code: "STUDENT_ID_REQUIRED" });
    else if (!/^[A-Z0-9-]{3,30}$/.test(studentNumber)) errors.push({ code: "STUDENT_ID_INVALID" });
    if (!fullName) errors.push({ code: "STUDENT_NAME_REQUIRED" });
    if (!phone) errors.push({ code: "PHONE_INVALID" });
    if (courseCodes.length === 0) errors.push({ code: "COURSE_CODES_REQUIRED" });
    for (const code of courseCodes) if (!courseByCode.has(code)) errors.push({ code: "COURSE_NOT_FOUND", params: { code } });
    if (studentNumber) {
      if (firstRow.has(studentNumber)) errors.push({ code: "DUPLICATE_STUDENT_IN_FILE", params: { firstRow: firstRow.get(studentNumber)! } });
      else firstRow.set(studentNumber, row);
    }
    const known = existingByNumber.get(studentNumber);
    if (known && fullName && normalizeText(known.fullName) !== normalizeText(fullName)) {
      // Student IDs are unique: the same ID with a different name is probably a typing mistake.
      errors.push({ code: "STUDENT_NAME_MISMATCH", params: { existingName: known.fullName } });
    }
    const activeCourseIds = new Set(known?.enrolments.map((e) => e.courseId) ?? []);
    const alreadyEnrolled = courseCodes.filter((c) => activeCourseIds.has(courseByCode.get(c) ?? ""));
    return {
      row,
      status: errors.length ? "INVALID" : "VALID",
      errors,
      data: { studentNumber, fullName, phone: phone ?? (raw.phone ?? ""), courseCodes, existingStudent: !!known, alreadyEnrolled },
    };
  });
}

function summary(rows: EnrolmentRow[]) {
  return { totalRows: rows.length, validRows: rows.filter((r) => r.status === "VALID").length, invalidRows: rows.filter((r) => r.status === "INVALID").length };
}

/** Step 1: validate the file and store a PREVIEW batch. */
export async function previewEnrolmentImport(file: Express.Multer.File | undefined, semester: string, actorId: string) {
  const rows = parseCsv(file, ENROLMENT_COLUMNS);
  const results = await validateRows(rows, semester);
  const batch = await prisma.importBatch.create({
    data: {
      type: "ENROLMENTS", semester, uploadedById: actorId, filename: (file?.originalname ?? "enrolments.csv").slice(0, 200),
      ...summary(results), duplicateRows: 0, rowResults: results as unknown as object,
    },
  });
  return { batch: { id: batch.id, type: batch.type, semester, status: batch.status, filename: batch.filename, ...summary(results) }, rows: results };
}

/**
 * Step 2: saves the valid rows of a PREVIEW batch.
 * @returns counts and the temporary passwords of the newly created students (shown once).
 * @throws 404 IMPORT_NOT_FOUND, 409 IMPORT_ALREADY_CONFIRMED
 */
export async function confirmEnrolmentImport(batchId: string, actorId: string, req: Request) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.type !== "ENROLMENTS") throw notFound("IMPORT_NOT_FOUND");
  if (batch.status !== "PREVIEW") throw conflict("IMPORT_ALREADY_CONFIRMED", "This import was already saved");
  const stored = batch.rowResults as unknown as EnrolmentRow[];

  // Re-validate: the database may have changed since the preview.
  const fresh = await validateRows(
    stored.map((r) => ({ student_id: r.data.studentNumber, student_name: r.data.fullName, phone: r.data.phone, course_codes: r.data.courseCodes.join(";") })),
    batch.semester!,
  );
  const valid = fresh.filter((r) => r.status === "VALID");
  if (valid.length === 0) throw badRequest("IMPORT_NO_VALID_ROWS", "There are no valid rows to save");

  const newStudents = valid.filter((r) => !r.data.existingStudent);
  const credentials = await Promise.all(
    newStudents.map(async (r) => {
      const temporaryPassword = generateTempPassword();
      return { row: r, temporaryPassword, hash: await hashPassword(temporaryPassword) };
    }),
  );

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "STUDENT" } });
  const courses = await prisma.course.findMany({ where: { semester: batch.semester! }, select: { id: true, code: true } });
  const courseByCode = new Map(courses.map((c) => [c.code, c.id]));

  const result = await transaction(async (tx) => {
    // Lock the batch row so two confirms cannot run at once.
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT status::text FROM import_batches WHERE id = ${batchId}::uuid FOR UPDATE`;
    if (locked[0]?.status !== "PREVIEW") throw conflict("IMPORT_ALREADY_CONFIRMED", "This import was already saved");

    let enrolled = 0;
    let reactivated = 0;
    for (const c of credentials) {
      const u = await tx.user.create({
        data: {
          roleId: role.id, studentNumber: c.row.data.studentNumber, fullName: c.row.data.fullName, phone: c.row.data.phone,
          passwordHash: c.hash, mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry(),
        },
      });
      await queueSms(tx, { id: u.id, phone: u.phone, preferredLanguage: u.preferredLanguage }, "ACCOUNT_CREATED", { studentNumber: u.studentNumber! }, { type: "user", id: u.id });
    }
    const students = await tx.user.findMany({ where: { studentNumber: { in: valid.map((r) => r.data.studentNumber) } }, select: { id: true, studentNumber: true } });
    const idByNumber = new Map(students.map((s) => [s.studentNumber!, s.id]));
    for (const r of valid) {
      const studentId = idByNumber.get(r.data.studentNumber)!;
      for (const code of r.data.courseCodes) {
        const courseId = courseByCode.get(code)!;
        const e = await tx.enrolment.findUnique({ where: { studentId_courseId: { studentId, courseId } } });
        if (!e) {
          await tx.enrolment.create({ data: { studentId, courseId } });
          enrolled++;
        } else if (e.status === "DROPPED") {
          await tx.enrolment.update({ where: { id: e.id }, data: { status: "ACTIVE", droppedAt: null } });
          reactivated++;
        }
      }
    }
    await tx.importBatch.update({ where: { id: batchId }, data: { status: "CONFIRMED", ...summary(fresh), rowResults: fresh as unknown as object } });
    await audit(tx, {
      actorId, action: "ENROLMENTS_IMPORTED", entityType: "import_batch", entityId: batchId,
      details: { semester: batch.semester, validRows: valid.length, newStudents: credentials.length, enrolled, reactivated }, req,
    });
    return { enrolled, reactivated };
  });

  return {
    ...summary(fresh),
    savedRows: valid.length,
    newStudents: credentials.length,
    ...result,
    rows: fresh,
    /** Shown once. Give each student their password privately; it is never stored in plain text. */
    temporaryPasswords: credentials.map((c) => ({ studentNumber: c.row.data.studentNumber, fullName: c.row.data.fullName, temporaryPassword: c.temporaryPassword })),
  };
}
