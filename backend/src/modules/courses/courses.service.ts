/**
 * Faculties, courses and enrolment (section 4.1, Admin / Registrar).
 *
 * Rules:
 * - a course is unique by code + semester label (Q3) and has one lecturer, who must be assigned
 *   to the course's faculty; since Phase 2 a new course also has an academic year and a
 *   semester (1-8), and its label is "2026/2027 S1";
 * - students can only take exams for courses they are ACTIVE in;
 * - dropping a student sets the enrolment to DROPPED and keeps every past
 *   attempt and result (rows are never deleted); enrolling again reactivates it;
 * - enrolling (or reactivating) is refused when one of the course's upcoming
 *   approved exams overlaps another upcoming exam of the student (4.5: two exams
 *   of the same student must never overlap). See enrolmentConflicts().
 */
import type { Request } from "express";
import { now } from "../../db/clock.ts";
import { isUniqueViolation } from "../../db/db-errors.ts";
import type { Tx } from "../../db/prisma.ts";
import { transaction } from "../../db/prisma.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import * as coursesRepo from "../../repositories/courses.repository.ts";
import { findStudent, findUserWithRole } from "../../repositories/users.repository.ts";
import { audit } from "../../services/audit.ts";
import { manageableCourse, viewableCourse } from "../../services/access.ts";
import { findAcademicYear, findFacultyLecturer } from "../../repositories/academic.repository.ts";
import { offeringLabel } from "../../lib/semester-label.ts";

// --- Faculties ------------------------------------------------------------------

/** All faculties with their number of courses. */
export function listFaculties() {
  return coursesRepo.listFaculties();
}

/** @throws 409 FACULTY_CODE_TAKEN */
export async function createFaculty(data: { code: string; name: string }, actorId: string, req: Request) {
  try {
    return await transaction(async (tx) => {
      const f = await coursesRepo.insertFaculty({ code: data.code.toUpperCase(), name: data.name }, tx);
      await audit(tx, { actorId, action: "FACULTY_CREATED", entityType: "faculty", entityId: f.id, details: { code: f.code }, req });
      return f;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("FACULTY_CODE_TAKEN", "A faculty with this code exists");
    throw error;
  }
}

/** Renames a faculty. @throws 404 FACULTY_NOT_FOUND */
export async function updateFaculty(id: string, data: { name?: string }, actorId: string, req: Request) {
  if (!(await coursesRepo.findFaculty(id))) throw notFound("FACULTY_NOT_FOUND");
  return transaction(async (tx) => {
    const f = await coursesRepo.updateFaculty(id, data, tx);
    await audit(tx, { actorId, action: "FACULTY_UPDATED", entityType: "faculty", entityId: id, req });
    return f;
  });
}

// --- Courses --------------------------------------------------------------------

type CourseRow = Awaited<ReturnType<typeof coursesRepo.findCourseDetail>>;
const toCourse = ({ _count, ...c }: CourseRow) => ({ ...c, activeStudents: _count.enrolments });

/** Courses the user may see: admin all; lecturer own; student ACTIVE enrolments; invigilator none. */
export async function listCourses(user: AuthUser, q: { semester?: string; facultyId?: string; academicYearId?: string; semesterNumber?: number }) {
  const filter = {
    ...(q.semester ? { semester: q.semester } : {}), ...(q.facultyId ? { facultyId: q.facultyId } : {}),
    ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}), ...(q.semesterNumber ? { semesterNumber: q.semesterNumber } : {}),
  };
  const scope =
    user.role === "ADMIN" ? {} :
    user.role === "LECTURER" ? { lecturerId: user.id } :
    user.role === "STUDENT" ? { enrolments: { some: { studentId: user.id, status: "ACTIVE" as const } } } :
    { id: "00000000-0000-0000-0000-000000000000" };
  return (await coursesRepo.listCourses({ ...filter, ...scope })).map(toCourse);
}

/** One course with its faculty, lecturer and active student count. @throws 404 COURSE_NOT_FOUND */
export async function getCourse(user: AuthUser, id: string) {
  await viewableCourse(user, id);
  return toCourse(await coursesRepo.findCourseDetail(id));
}

async function assertLecturer(lecturerId: string) {
  const l = await findUserWithRole(lecturerId);
  if (!l || l.role.name !== "LECTURER" || !l.isActive) throw badRequest("LECTURER_INVALID", "Choose an active lecturer");
  return l;
}

/** A course's lecturer must be assigned to the course's faculty. @throws 400 LECTURER_NOT_IN_FACULTY */
async function assertLecturerInFaculty(lecturerId: string, facultyId: string) {
  if (!(await findFacultyLecturer(facultyId, lecturerId))) throw badRequest("LECTURER_NOT_IN_FACULTY", "Assign the lecturer to this faculty first");
}

/** @throws 400 ACADEMIC_YEAR_NOT_FOUND */
async function yearOf(academicYearId: string) {
  const y = await findAcademicYear(academicYearId);
  if (!y) throw badRequest("ACADEMIC_YEAR_NOT_FOUND", "Academic year not found");
  return y;
}

/**
 * Creates a course in a faculty, academic year and semester (1-8).
 * @throws 400 LECTURER_INVALID / FACULTY_NOT_FOUND / ACADEMIC_YEAR_NOT_FOUND / LECTURER_NOT_IN_FACULTY, 409 COURSE_EXISTS
 */
export async function createCourse(
  data: { facultyId: string; code: string; name: string; academicYearId: string; semesterNumber: number; lecturerId: string },
  actorId: string,
  req: Request,
) {
  await assertLecturer(data.lecturerId);
  if (!(await coursesRepo.findFaculty(data.facultyId))) throw badRequest("FACULTY_NOT_FOUND", "Faculty not found");
  const year = await yearOf(data.academicYearId);
  await assertLecturerInFaculty(data.lecturerId, data.facultyId);
  try {
    return await transaction(async (tx) => {
      const c = await coursesRepo.insertCourse({ ...data, code: data.code.toUpperCase(), semester: offeringLabel(year.name, data.semesterNumber) }, tx);
      await audit(tx, { actorId, action: "COURSE_CREATED", entityType: "course", entityId: c.id, details: { code: c.code, semester: c.semester }, req });
      return c;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("COURSE_EXISTS", "This course code already exists in this semester");
    throw error;
  }
}

/**
 * Changes a course's name, lecturer, faculty, or academic year and semester (both together).
 * The lecturer must be assigned to the (new) faculty. A lecturer change is recorded with the
 * previous and new lecturer, so the assignment history is in the audit log.
 * @throws 404 COURSE_NOT_FOUND, 400 LECTURER_INVALID / LECTURER_NOT_IN_FACULTY / ACADEMIC_YEAR_NOT_FOUND, 409 COURSE_EXISTS
 */
export async function updateCourse(
  id: string,
  data: { name?: string; lecturerId?: string; facultyId?: string; academicYearId?: string; semesterNumber?: number },
  actorId: string,
  req: Request,
) {
  const before = await coursesRepo.findCourse(id);
  if (!before) throw notFound("COURSE_NOT_FOUND");
  if (data.lecturerId) await assertLecturer(data.lecturerId);
  if (data.facultyId && !(await coursesRepo.findFaculty(data.facultyId))) throw badRequest("FACULTY_NOT_FOUND", "Faculty not found");
  if (data.lecturerId || data.facultyId) await assertLecturerInFaculty(data.lecturerId ?? before.lecturerId, data.facultyId ?? before.facultyId);
  const label = data.academicYearId ? offeringLabel((await yearOf(data.academicYearId)).name, data.semesterNumber!) : undefined;
  try {
    return await transaction(async (tx) => {
      const c = await coursesRepo.updateCourse(id, { ...data, ...(label ? { semester: label } : {}) }, tx);
      const lecturerChange = data.lecturerId && data.lecturerId !== before.lecturerId ? { lecturer: { from: before.lecturerId, to: data.lecturerId } } : {};
      const offeringChange = label && label !== before.semester ? { offering: { from: before.semester, to: label } } : {};
      await audit(tx, { actorId, action: "COURSE_UPDATED", entityType: "course", entityId: id, details: { fields: Object.keys(data), ...lecturerChange, ...offeringChange }, req });
      return c;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("COURSE_EXISTS", "This course code already exists in this semester");
    throw error;
  }
}

// --- Enrolments -----------------------------------------------------------------

/** Students of a course (admin or the course lecturer). Includes dropped students, marked DROPPED. */
export async function listEnrolments(user: AuthUser, courseId: string, status?: "ACTIVE" | "DROPPED") {
  await manageableCourse(user, courseId);
  const rows = await coursesRepo.listEnrolments(courseId, status);
  return rows.map((e) => ({ id: e.id, status: e.status, enrolledAt: e.enrolledAt, droppedAt: e.droppedAt, student: e.student }));
}

/**
 * Exam clashes that enrolling the student in `newCourseIds` would create:
 * upcoming approved exams of the new courses that overlap an upcoming exam of
 * the student's other active courses, or of another new course. Call it inside
 * the enrolment transaction after lockScheduling(), so a schedule approval
 * cannot slip in between the check and the enrolment.
 */
export async function enrolmentConflicts(tx: Tx, studentId: string, newCourseIds: string[]) {
  const current = (await coursesRepo.findActiveCourseIds(studentId, tx)).filter((id) => !newCourseIds.includes(id));
  return coursesRepo.findOverlappingSchedules(newCourseIds, [...current, ...newCourseIds], tx);
}

/**
 * Enrols one student (by id or student number). Reactivates a dropped enrolment.
 * @throws 400 STUDENT_NOT_FOUND, 409 ALREADY_ENROLLED, 409 ENROLMENT_SCHEDULE_CONFLICT { conflicts }
 */
export async function enrolStudent(courseId: string, who: { studentId?: string; studentNumber?: string }, actorId: string, req: Request) {
  if (!(await coursesRepo.findCourse(courseId))) throw notFound("COURSE_NOT_FOUND");
  const student = await findStudent({ id: who.studentId, studentNumber: who.studentNumber?.toUpperCase() });
  if (!student) throw badRequest("STUDENT_NOT_FOUND", "No student with this id or number");
  return transaction(async (tx) => {
    const existing = await coursesRepo.findEnrolment(student.id, courseId, tx);
    if (existing?.status === "ACTIVE") throw conflict("ALREADY_ENROLLED", "The student is already enrolled");
    await coursesRepo.lockScheduling(tx);
    const conflicts = await enrolmentConflicts(tx, student.id, [courseId]);
    if (conflicts.length) throw conflict("ENROLMENT_SCHEDULE_CONFLICT", "The student already has an exam at the same time", { conflicts });
    const e = existing
      ? await coursesRepo.setEnrolmentStatus(existing.id, "ACTIVE", null, tx)
      : await coursesRepo.insertEnrolment(student.id, courseId, tx);
    await audit(tx, { actorId, action: existing ? "ENROLMENT_REACTIVATED" : "ENROLMENT_CREATED", entityType: "course", entityId: courseId, details: { student: student.studentNumber }, req });
    return e;
  });
}

/** Drops a student. Their attempts and results stay. @throws 404 ENROLMENT_NOT_FOUND, 409 ALREADY_DROPPED */
export async function dropStudent(courseId: string, studentId: string, actorId: string, req: Request) {
  const e = await coursesRepo.findEnrolment(studentId, courseId);
  if (!e) throw notFound("ENROLMENT_NOT_FOUND");
  if (e.status === "DROPPED") throw conflict("ALREADY_DROPPED", "The student is already dropped");
  const student = await findUserWithRole(studentId);
  return transaction(async (tx) => {
    const updated = await coursesRepo.setEnrolmentStatus(e.id, "DROPPED", now(), tx);
    await audit(tx, { actorId, action: "ENROLMENT_DROPPED", entityType: "course", entityId: courseId, details: { student: student?.studentNumber }, req });
    return updated;
  });
}
