/**
 * Academic structure (Phase 2): academic years, lecturers assigned to faculties, and student
 * registrations (faculty and semester 1-8 per academic year), plus enrolling a whole semester
 * group in its courses.
 *
 * Rules:
 * - an academic year is named "YYYY/YYYY+1"; at most one is current;
 * - a course's lecturer must be assigned to the course's faculty (checked in courses.service);
 *   a lecturer cannot be removed from a faculty while teaching a course there;
 * - a student has at most one registration per academic year AND semester (so Semester 1 and
 *   Semester 2 of one year are two registrations); a mistake is corrected with PATCH, which is
 *   audited with the previous values;
 * - group enrolment uses the same rules as single enrolment, including the exam clash check;
 *   a student whose enrolment would create an exam clash is skipped and reported.
 */
import type { Request } from "express";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { transaction } from "../../db/prisma.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { paged } from "../../lib/format.ts";
import * as academicRepo from "../../repositories/academic.repository.ts";
import * as coursesRepo from "../../repositories/courses.repository.ts";
import { findStudent, findUserWithRole } from "../../repositories/users.repository.ts";
import { audit } from "../../services/audit.ts";
import { enrolmentConflicts } from "../courses/courses.service.ts";

// --- Academic years -------------------------------------------------------------------

const toYear = ({ _count, ...y }: Awaited<ReturnType<typeof academicRepo.listAcademicYears>>[number]) => ({ ...y, courses: _count.courses, registrations: _count.registrations });

export async function listAcademicYears() {
  return (await academicRepo.listAcademicYears()).map(toYear);
}

/** "2026/2027" must be two consecutive years; dates must be in order. */
function checkYear(name: string, startDate: Date, endDate: Date) {
  const m = /^(\d{4})\/(\d{4})$/.exec(name);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) throw badRequest("ACADEMIC_YEAR_NAME_INVALID", 'Use the form "2026/2027"');
  if (endDate <= startDate) throw badRequest("ACADEMIC_YEAR_DATES_INVALID", "The end date must be after the start date");
}

/** @throws 400 ACADEMIC_YEAR_NAME_INVALID / ACADEMIC_YEAR_DATES_INVALID, 409 ACADEMIC_YEAR_EXISTS */
export async function createAcademicYear(data: { name: string; startDate: Date; endDate: Date; isCurrent?: boolean }, actorId: string, req: Request) {
  checkYear(data.name, data.startDate, data.endDate);
  try {
    return await transaction(async (tx) => {
      let y = await academicRepo.insertAcademicYear({ name: data.name, startDate: data.startDate, endDate: data.endDate }, tx);
      if (data.isCurrent) y = await academicRepo.setCurrentAcademicYear(y.id, tx);
      await audit(tx, { actorId, action: "ACADEMIC_YEAR_CREATED", entityType: "academic_year", entityId: y.id, details: { name: y.name, current: y.isCurrent }, req });
      return y;
    });
  } catch (error) {
    if (isUniqueViolation(error, "name")) throw conflict("ACADEMIC_YEAR_EXISTS", "This academic year already exists");
    throw error;
  }
}

/** Changes the dates (the name identifies the year and stays). @throws 404 ACADEMIC_YEAR_NOT_FOUND */
export async function updateAcademicYear(id: string, data: { startDate?: Date; endDate?: Date }, actorId: string, req: Request) {
  const y = await academicRepo.findAcademicYear(id);
  if (!y) throw notFound("ACADEMIC_YEAR_NOT_FOUND");
  checkYear(y.name, data.startDate ?? y.startDate, data.endDate ?? y.endDate);
  return transaction(async (tx) => {
    const updated = await academicRepo.updateAcademicYear(id, data, tx);
    await audit(tx, { actorId, action: "ACADEMIC_YEAR_UPDATED", entityType: "academic_year", entityId: id, details: { fields: Object.keys(data) }, req });
    return updated;
  });
}

/** Makes this the current academic year (the previous current one stops being current). */
export async function activateAcademicYear(id: string, actorId: string, req: Request) {
  if (!(await academicRepo.findAcademicYear(id))) throw notFound("ACADEMIC_YEAR_NOT_FOUND");
  return transaction(async (tx) => {
    const y = await academicRepo.setCurrentAcademicYear(id, tx);
    await audit(tx, { actorId, action: "ACADEMIC_YEAR_ACTIVATED", entityType: "academic_year", entityId: id, details: { name: y.name }, req });
    return y;
  });
}

// --- Faculty lecturers ----------------------------------------------------------------

export async function listFacultyLecturers(facultyId: string) {
  if (!(await coursesRepo.findFaculty(facultyId))) throw notFound("FACULTY_NOT_FOUND");
  return (await academicRepo.listFacultyLecturers(facultyId)).map(({ lecturer: { _count, ...l }, assignedAt }) => ({ ...l, assignedAt, coursesInFaculty: _count.coursesTaught }));
}

/** @throws 404 FACULTY_NOT_FOUND, 400 LECTURER_INVALID, 409 LECTURER_ALREADY_ASSIGNED */
export async function assignLecturer(facultyId: string, lecturerId: string, actorId: string, req: Request) {
  const faculty = await coursesRepo.findFaculty(facultyId);
  if (!faculty) throw notFound("FACULTY_NOT_FOUND");
  const l = await findUserWithRole(lecturerId);
  if (!l || l.role.name !== "LECTURER" || !l.isActive) throw badRequest("LECTURER_INVALID", "Choose an active lecturer");
  if (await academicRepo.findFacultyLecturer(facultyId, lecturerId)) throw conflict("LECTURER_ALREADY_ASSIGNED", "This lecturer is already assigned to the faculty");
  return transaction(async (tx) => {
    const a = await academicRepo.insertFacultyLecturer(facultyId, lecturerId, tx);
    await audit(tx, { actorId, action: "FACULTY_LECTURER_ASSIGNED", entityType: "faculty", entityId: facultyId, details: { faculty: faculty.code, lecturer: l.username }, req });
    return a;
  });
}

/** @throws 404 ASSIGNMENT_NOT_FOUND, 409 LECTURER_TEACHES_IN_FACULTY { courses } */
export async function unassignLecturer(facultyId: string, lecturerId: string, actorId: string, req: Request) {
  if (!(await academicRepo.findFacultyLecturer(facultyId, lecturerId))) throw notFound("ASSIGNMENT_NOT_FOUND");
  const courses = await academicRepo.countCoursesTaughtInFaculty(facultyId, lecturerId);
  if (courses > 0) throw conflict("LECTURER_TEACHES_IN_FACULTY", "Give the lecturer's courses in this faculty to another lecturer first", { courses });
  const l = await findUserWithRole(lecturerId);
  return transaction(async (tx) => {
    await academicRepo.deleteFacultyLecturer(facultyId, lecturerId, tx);
    await audit(tx, { actorId, action: "FACULTY_LECTURER_REMOVED", entityType: "faculty", entityId: facultyId, details: { lecturer: l?.username }, req });
  });
}

/** The lecturer's own faculties, each with the number of courses they teach there. */
export async function myFaculties(user: AuthUser) {
  return (await academicRepo.listLecturerFaculties(user.id)).map(({ faculty: { _count, ...f } }) => ({ ...f, myCourses: _count.courses }));
}

// --- Student registrations ------------------------------------------------------------

type Group = { academicYearId: string; facultyId: string; semesterNumber: number };

export async function listRegistrations(q: Partial<Group> & { search?: string; page: number; pageSize: number }) {
  const where = {
    ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}),
    ...(q.facultyId ? { facultyId: q.facultyId } : {}),
    ...(q.semesterNumber ? { semesterNumber: q.semesterNumber } : {}),
    ...(q.search
      ? { student: { OR: [{ fullName: { contains: q.search, mode: "insensitive" as const } }, { username: { contains: q.search, mode: "insensitive" as const } }] } }
      : {}),
  };
  const [rows, total] = await academicRepo.listRegistrations(where, (q.page - 1) * q.pageSize, q.pageSize);
  return paged(rows, total, q.page, q.pageSize);
}

async function checkGroup(g: Group) {
  if (!(await academicRepo.findAcademicYear(g.academicYearId))) throw badRequest("ACADEMIC_YEAR_NOT_FOUND", "Academic year not found");
  if (!(await coursesRepo.findFaculty(g.facultyId))) throw badRequest("FACULTY_NOT_FOUND", "Faculty not found");
}

const REGISTRATION_EXISTS = () => conflict("REGISTRATION_EXISTS", "The student is already registered for this semester of this academic year");

/**
 * Registers a student in a faculty and semester for an academic year. A student may have
 * several semesters in one year, but each semester only once.
 * @throws 400 STUDENT_NOT_FOUND / ACADEMIC_YEAR_NOT_FOUND / FACULTY_NOT_FOUND, 409 REGISTRATION_EXISTS
 */
export async function registerStudent(input: Group & { studentId?: string; studentNumber?: string }, actorId: string, req: Request) {
  const student = await findStudent({ id: input.studentId, studentNumber: input.studentNumber?.toUpperCase() });
  if (!student) throw badRequest("STUDENT_NOT_FOUND", "No student with this id or number");
  await checkGroup(input);
  try {
    return await transaction(async (tx) => {
      const r = await academicRepo.insertRegistration({ studentId: student.id, academicYearId: input.academicYearId, facultyId: input.facultyId, semesterNumber: input.semesterNumber }, tx);
      await audit(tx, {
        actorId, action: "REGISTRATION_CREATED", entityType: "student_registration", entityId: r.id,
        details: { student: student.studentNumber, year: r.academicYear.name, faculty: r.faculty.code, semester: r.semesterNumber }, req,
      });
      return r;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw REGISTRATION_EXISTS();
    throw error;
  }
}

/**
 * Corrects a registration's faculty or semester (the academic year and student stay). The
 * previous values are kept in the audit log.
 * @throws 404 REGISTRATION_NOT_FOUND, 400 FACULTY_NOT_FOUND, 409 REGISTRATION_EXISTS
 */
export async function updateRegistration(id: string, data: { facultyId?: string; semesterNumber?: number }, actorId: string, req: Request) {
  const before = await academicRepo.findRegistrationById(id);
  if (!before) throw notFound("REGISTRATION_NOT_FOUND");
  if (data.facultyId && !(await coursesRepo.findFaculty(data.facultyId))) throw badRequest("FACULTY_NOT_FOUND", "Faculty not found");
  try {
    return await transaction(async (tx) => {
      const r = await academicRepo.updateRegistration(id, data, tx);
      await audit(tx, {
        actorId, action: "REGISTRATION_UPDATED", entityType: "student_registration", entityId: id,
        details: { student: before.student.studentNumber, year: before.academicYear.name, previous: { faculty: before.faculty.code, semester: before.semesterNumber }, now: { faculty: r.faculty.code, semester: r.semesterNumber } },
        req,
      });
      return r;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw REGISTRATION_EXISTS();
    throw error;
  }
}

/**
 * Enrols every active student of a group (year, faculty, semester) in every course offered to
 * that group. Existing active enrolments are left alone, dropped ones are reactivated. A student
 * whose new courses would clash with another of their exams is skipped for those courses.
 * @returns { students, courses, enrolled, reactivated, alreadyEnrolled, skipped: [{ student, conflicts }] }
 */
export async function enrolGroup(g: Group, actorId: string, req: Request) {
  await checkGroup(g);
  const [students, courses] = await Promise.all([academicRepo.findGroupStudents(g), academicRepo.findGroupCourses(g)]);
  if (courses.length === 0) throw badRequest("GROUP_HAS_NO_COURSES", "No courses are offered to this group yet");
  return transaction(async (tx) => {
    await coursesRepo.lockScheduling(tx);
    let enrolled = 0, reactivated = 0, alreadyEnrolled = 0;
    const skipped: { student: string; conflicts: unknown[] }[] = [];
    for (const { student } of students) {
      const todo: { courseId: string; existing: Awaited<ReturnType<typeof coursesRepo.findEnrolment>> }[] = [];
      for (const c of courses) {
        const existing = await coursesRepo.findEnrolment(student.id, c.id, tx);
        if (existing?.status === "ACTIVE") alreadyEnrolled++;
        else todo.push({ courseId: c.id, existing });
      }
      if (!todo.length) continue;
      const clashes = await enrolmentConflicts(tx, student.id, todo.map((t) => t.courseId));
      if (clashes.length) { skipped.push({ student: student.studentNumber!, conflicts: clashes }); continue; }
      for (const t of todo) {
        if (t.existing) { await coursesRepo.setEnrolmentStatus(t.existing.id, "ACTIVE", null, tx); reactivated++; }
        else { await coursesRepo.insertEnrolment(student.id, t.courseId, tx); enrolled++; }
      }
    }
    const result = { students: students.length, courses: courses.length, enrolled, reactivated, alreadyEnrolled, skipped };
    await audit(tx, { actorId, action: "GROUP_ENROLLED", entityType: "academic_year", entityId: g.academicYearId, details: { facultyId: g.facultyId, semester: g.semesterNumber, enrolled, reactivated, skipped: skipped.length }, req });
    return result;
  });
}

/**
 * The student's own academic placement: all registrations (newest year, highest semester first)
 * and the current one: the highest semester in the current academic year, else the latest.
 */
export async function myAcademic(user: AuthUser) {
  const regs = await academicRepo.listStudentRegistrations(user.id);
  const current = regs.find((r) => r.academicYear.isCurrent) ?? regs[0] ?? null;
  return { current, registrations: regs };
}
