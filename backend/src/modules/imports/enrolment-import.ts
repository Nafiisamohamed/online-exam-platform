/**
 * Enrolment CSV import (section 4.1, Admin / Registrar).
 *
 * File columns: student_id, student_name, phone, course_codes
 *   student_id: leave it EMPTY for a new student: the server creates the account and gives it
 *   the next number (S-YYYY-NNN). Fill it only with the number of an EXISTING student, to
 *   enrol that student. Numbers are never chosen in the file.
 *   course_codes holds one or more codes separated by ";" "|" or spaces,
 *   e.g. "CS201;CS105". Codes are looked up in the semester the admin chooses.
 *
 * Workflow (same as the question import):
 * 1. preview: every row is validated and the results are stored in an
 *    import_batches row (status PREVIEW). Errors are codes, not sentences (P10).
 * 2. confirm: the rows are checked again and only VALID rows are saved:
 *    new students are created with an automatic number and a temporary password (Q1) and enrolled;
 *    existing students are only enrolled. The temporary passwords are returned
 *    once, for the registrar to print or download, and stored only as hashes.
 *
 * Row error codes: STUDENT_ID_INVALID, STUDENT_NOT_FOUND {studentNumber}, STUDENT_NAME_REQUIRED,
 * PHONE_INVALID, COURSE_CODES_REQUIRED, COURSE_NOT_FOUND {code},
 * DUPLICATE_STUDENT_IN_FILE {firstRow}, STUDENT_NAME_MISMATCH {existingName},
 * STUDENT_ALREADY_EXISTS {studentNumber}: a row without a number has the name and phone of an
 * existing student (use that student's number instead of creating a second account),
 * SCHEDULE_CONFLICT {course, exam, otherCourse, otherExam}: one of the new
 * courses has an upcoming exam at the same time as another exam of the student.
 */
import type { Request } from "express";
import { transaction } from "../../db/prisma.ts";
import { findCoursesInSemester, findEnrolment, findOverlappingSchedules, insertEnrolment, lockScheduling, setEnrolmentStatus } from "../../repositories/courses.repository.ts";
import { findImportBatch, insertImportBatch, lockImportBatch, markImportConfirmed } from "../../repositories/imports.repository.ts";
import { findRole, findStudentsByNumbers, findStudentsByPhones, insertUser } from "../../repositories/users.repository.ts";
import { ACCOUNT_NUMBER_RE, nextAccountNumber } from "../../services/account-numbers.ts";
import { enrolmentConflicts } from "../courses/courses.service.ts";
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
  const courses = await findCoursesInSemester(semester);
  const courseByCode = new Map(courses.map((c) => [c.code.toUpperCase(), c.id]));
  const numbers = rows.map((r) => (r.student_id ?? "").trim().toUpperCase()).filter(Boolean);
  const existing = await findStudentsByNumbers(numbers);
  const existingByNumber = new Map(existing.map((u) => [u.studentNumber!, u]));
  const phones = rows.map((r) => normalizeSomaliPhone(r.phone ?? "")).filter((p): p is string => !!p);
  const samePhone = await findStudentsByPhones([...new Set(phones)]);
  const firstRow = new Map<string, number>();

  const results: EnrolmentRow[] = [];
  for (const [i, raw] of rows.entries()) {
    const row = i + 2;
    const errors: RowError[] = [];
    const studentNumber = (raw.student_id ?? "").trim().toUpperCase();
    const fullName = (raw.student_name ?? "").trim().replace(/\s+/g, " ");
    const phone = normalizeSomaliPhone(raw.phone ?? "");
    const courseCodes = [...new Set((raw.course_codes ?? "").split(/[;|\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];

    if (studentNumber && !ACCOUNT_NUMBER_RE.test(studentNumber)) errors.push({ code: "STUDENT_ID_INVALID" });
    else if (studentNumber && !existingByNumber.has(studentNumber)) errors.push({ code: "STUDENT_NOT_FOUND", params: { studentNumber } });
    if (!fullName) errors.push({ code: "STUDENT_NAME_REQUIRED" });
    if (!phone) errors.push({ code: "PHONE_INVALID" });
    if (courseCodes.length === 0) errors.push({ code: "COURSE_CODES_REQUIRED" });
    for (const code of courseCodes) if (!courseByCode.has(code)) errors.push({ code: "COURSE_NOT_FOUND", params: { code } });
    // The same student twice in one file: same number, or (new students) same name and phone.
    const fileKey = studentNumber || (fullName && phone ? `new:${normalizeText(fullName)}|${phone}` : "");
    if (fileKey) {
      if (firstRow.has(fileKey)) errors.push({ code: "DUPLICATE_STUDENT_IN_FILE", params: { firstRow: firstRow.get(fileKey)! } });
      else firstRow.set(fileKey, row);
    }
    if (!studentNumber && fullName && phone) {
      const twin = samePhone.find((s) => s.phone === phone && normalizeText(s.fullName) === normalizeText(fullName));
      if (twin) errors.push({ code: "STUDENT_ALREADY_EXISTS", params: { studentNumber: twin.studentNumber! } });
    }
    const known = existingByNumber.get(studentNumber);
    if (known && fullName && normalizeText(known.fullName) !== normalizeText(fullName)) {
      // Student IDs are unique: the same ID with a different name is probably a typing mistake.
      errors.push({ code: "STUDENT_NAME_MISMATCH", params: { existingName: known.fullName } });
    }
    const activeCourseIds = new Set(known?.enrolments.map((e) => e.courseId) ?? []);
    const alreadyEnrolled = courseCodes.filter((c) => activeCourseIds.has(courseByCode.get(c) ?? ""));
    if (!errors.length) {
      // 4.5: the new courses must not bring an exam that overlaps another exam of this student.
      const newIds = courseCodes.map((c) => courseByCode.get(c)!).filter((id) => !activeCourseIds.has(id));
      const clashes = await findOverlappingSchedules(newIds, [...activeCourseIds, ...newIds]);
      for (const c of clashes) errors.push({ code: "SCHEDULE_CONFLICT", params: c });
    }
    results.push({
      row,
      status: errors.length ? "INVALID" : "VALID",
      errors,
      data: { studentNumber, fullName, phone: phone ?? (raw.phone ?? ""), courseCodes, existingStudent: !!known, alreadyEnrolled },
    });
  }
  return results;
}

function summary(rows: EnrolmentRow[]) {
  return { totalRows: rows.length, validRows: rows.filter((r) => r.status === "VALID").length, invalidRows: rows.filter((r) => r.status === "INVALID").length };
}

/** Step 1: validate the file and store a PREVIEW batch. */
export async function previewEnrolmentImport(file: Express.Multer.File | undefined, semester: string, actorId: string) {
  const rows = parseCsv(file, ENROLMENT_COLUMNS);
  const results = await validateRows(rows, semester);
  const batch = await insertImportBatch({
    type: "ENROLMENTS", semester, uploadedById: actorId, filename: (file?.originalname ?? "enrolments.csv").slice(0, 200),
    ...summary(results), duplicateRows: 0, rowResults: results as unknown as object,
  });
  return { batch: { id: batch.id, type: batch.type, semester, status: batch.status, filename: batch.filename, ...summary(results) }, rows: results };
}

/**
 * Step 2: saves the valid rows of a PREVIEW batch.
 * @returns counts and the temporary passwords of the newly created students (shown once).
 * @throws 404 IMPORT_NOT_FOUND, 409 IMPORT_ALREADY_CONFIRMED
 */
export async function confirmEnrolmentImport(batchId: string, actorId: string, req: Request) {
  const batch = await findImportBatch(batchId);
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

  const role = await findRole("STUDENT");
  const courses = await findCoursesInSemester(batch.semester!);
  const courseByCode = new Map(courses.map((c) => [c.code, c.id]));

  const result = await transaction(async (tx) => {
    // Lock the batch row so two confirms cannot run at once.
    if ((await lockImportBatch(batchId, tx)) !== "PREVIEW") throw conflict("IMPORT_ALREADY_CONFIRMED", "This import was already saved");

    let enrolled = 0;
    let reactivated = 0;
    const created: { row: number; studentNumber: string; studentId: string }[] = [];
    for (const c of credentials) {
      const username = await nextAccountNumber(tx, "STUDENT");
      const u = await insertUser(
        {
          roleId: role.id, username, studentNumber: username, fullName: c.row.data.fullName, phone: c.row.data.phone,
          passwordHash: c.hash, mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry(),
        },
        tx,
      );
      await queueSms(tx, { id: u.id, phone: u.phone, preferredLanguage: u.preferredLanguage }, "ACCOUNT_CREATED", { studentNumber: u.studentNumber! }, { type: "user", id: u.id });
      created.push({ row: c.row.row, studentNumber: username, studentId: u.id });
    }
    const students = await findStudentsByNumbers(valid.map((r) => r.data.studentNumber).filter(Boolean), tx);
    const idByNumber = new Map(students.map((s) => [s.studentNumber!, s.id]));
    const idByRow = new Map(created.map((c) => [c.row, c.studentId]));
    // Same lock as schedule approval: no approval can create a clash while these enrolments are written.
    await lockScheduling(tx);
    for (const r of valid) {
      const studentId = r.data.studentNumber ? idByNumber.get(r.data.studentNumber)! : idByRow.get(r.row)!;
      const courseIds = r.data.courseCodes.map((code) => courseByCode.get(code)!);
      const clashes = await enrolmentConflicts(tx, studentId, courseIds);
      if (clashes.length) throw conflict("ENROLMENT_SCHEDULE_CONFLICT", "A schedule changed since the preview; preview the file again", { row: r.row, conflicts: clashes });
      for (const courseId of courseIds) {
        const e = await findEnrolment(studentId, courseId, tx);
        if (!e) {
          await insertEnrolment(studentId, courseId, tx);
          enrolled++;
        } else if (e.status === "DROPPED") {
          await setEnrolmentStatus(e.id, "ACTIVE", null, tx);
          reactivated++;
        }
      }
    }
    await markImportConfirmed(batchId, summary(fresh), fresh as unknown as object, tx);
    await audit(tx, {
      actorId, action: "ENROLMENTS_IMPORTED", entityType: "import_batch", entityId: batchId,
      details: { semester: batch.semester, validRows: valid.length, newStudents: credentials.length, enrolled, reactivated }, req,
    });
    return { enrolled, reactivated, created };
  });
  const numberByRow = new Map(result.created.map((c) => [c.row, c.studentNumber]));

  return {
    ...summary(fresh),
    savedRows: valid.length,
    newStudents: credentials.length,
    enrolled: result.enrolled,
    reactivated: result.reactivated,
    rows: fresh,
    /** Shown once. Give each student their password privately; it is never stored in plain text. */
    temporaryPasswords: credentials.map((c) => ({ studentNumber: numberByRow.get(c.row.row)!, fullName: c.row.data.fullName, temporaryPassword: c.temporaryPassword })),
  };
}
