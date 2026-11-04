/**
 * Faculties, courses and enrolment (section 4.1, Admin / Registrar).
 *
 * Rules:
 * - a course is unique by code + semester (Q3) and has one lecturer;
 * - students can only take exams for courses they are ACTIVE in;
 * - dropping a student sets the enrolment to DROPPED and keeps every past
 *   attempt and result (rows are never deleted); enrolling again reactivates it.
 */
import type { Request } from "express";
import { now } from "../../db/clock.ts";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { prisma, transaction } from "../../db/prisma.ts";
import type { AuthUser } from "../../middleware/auth.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { audit } from "../../services/audit.ts";
import { manageableCourse, viewableCourse } from "../../services/access.ts";

// --- Faculties ------------------------------------------------------------------

export function listFaculties() {
  return prisma.faculty.findMany({ orderBy: { code: "asc" }, include: { _count: { select: { courses: true } } } });
}

/** @throws 409 FACULTY_CODE_TAKEN */
export async function createFaculty(data: { code: string; name: string }, actorId: string, req: Request) {
  try {
    return await transaction(async (tx) => {
      const f = await tx.faculty.create({ data: { code: data.code.toUpperCase(), name: data.name } });
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
  if (!(await prisma.faculty.findUnique({ where: { id } }))) throw notFound("FACULTY_NOT_FOUND");
  return transaction(async (tx) => {
    const f = await tx.faculty.update({ where: { id }, data });
    await audit(tx, { actorId, action: "FACULTY_UPDATED", entityType: "faculty", entityId: id, req });
    return f;
  });
}

// --- Courses --------------------------------------------------------------------

const courseInclude = {
  faculty: { select: { id: true, code: true, name: true } },
  lecturer: { select: { id: true, fullName: true, email: true } },
  _count: { select: { enrolments: { where: { status: "ACTIVE" as const } } } },
};

/** Courses the user may see: admin all; lecturer own; student ACTIVE enrolments; invigilator none. */
export async function listCourses(user: AuthUser, q: { semester?: string; facultyId?: string }) {
  const filter = { ...(q.semester ? { semester: q.semester } : {}), ...(q.facultyId ? { facultyId: q.facultyId } : {}) };
  const scope =
    user.role === "ADMIN" ? {} :
    user.role === "LECTURER" ? { lecturerId: user.id } :
    user.role === "STUDENT" ? { enrolments: { some: { studentId: user.id, status: "ACTIVE" as const } } } :
    { id: "00000000-0000-0000-0000-000000000000" };
  const rows = await prisma.course.findMany({ where: { ...filter, ...scope }, include: courseInclude, orderBy: [{ semester: "desc" }, { code: "asc" }] });
  return rows.map(({ _count, ...c }) => ({ ...c, activeStudents: _count.enrolments }));
}

/** One course with its faculty, lecturer and active student count. @throws 404 COURSE_NOT_FOUND */
export async function getCourse(user: AuthUser, id: string) {
  await viewableCourse(user, id);
  const { _count, ...c } = await prisma.course.findUniqueOrThrow({ where: { id }, include: courseInclude });
  return { ...c, activeStudents: _count.enrolments };
}

async function assertLecturer(lecturerId: string) {
  const l = await prisma.user.findUnique({ where: { id: lecturerId }, include: { role: true } });
  if (!l || l.role.name !== "LECTURER" || !l.isActive) throw badRequest("LECTURER_INVALID", "Choose an active lecturer");
}

/** @throws 400 LECTURER_INVALID / FACULTY_NOT_FOUND, 409 COURSE_EXISTS */
export async function createCourse(data: { facultyId: string; code: string; name: string; semester: string; lecturerId: string }, actorId: string, req: Request) {
  await assertLecturer(data.lecturerId);
  if (!(await prisma.faculty.findUnique({ where: { id: data.facultyId } }))) throw badRequest("FACULTY_NOT_FOUND", "Faculty not found");
  try {
    return await transaction(async (tx) => {
      const c = await tx.course.create({ data: { ...data, code: data.code.toUpperCase() } });
      await audit(tx, { actorId, action: "COURSE_CREATED", entityType: "course", entityId: c.id, details: { code: c.code, semester: c.semester }, req });
      return c;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("COURSE_EXISTS", "This course code already exists in this semester");
    throw error;
  }
}

/** Changes a course's name, lecturer or faculty. @throws 404 COURSE_NOT_FOUND, 400 LECTURER_INVALID */
export async function updateCourse(id: string, data: { name?: string; lecturerId?: string; facultyId?: string }, actorId: string, req: Request) {
  if (!(await prisma.course.findUnique({ where: { id } }))) throw notFound("COURSE_NOT_FOUND");
  if (data.lecturerId) await assertLecturer(data.lecturerId);
  return transaction(async (tx) => {
    const c = await tx.course.update({ where: { id }, data });
    await audit(tx, { actorId, action: "COURSE_UPDATED", entityType: "course", entityId: id, details: { fields: Object.keys(data) }, req });
    return c;
  });
}

// --- Enrolments -----------------------------------------------------------------

/** Students of a course (admin or the course lecturer). Includes dropped students, marked DROPPED. */
export async function listEnrolments(user: AuthUser, courseId: string, status?: "ACTIVE" | "DROPPED") {
  await manageableCourse(user, courseId);
  const rows = await prisma.enrolment.findMany({
    where: { courseId, ...(status ? { status } : {}) },
    include: { student: { select: { id: true, studentNumber: true, fullName: true, phone: true } } },
    orderBy: { student: { studentNumber: "asc" } },
  });
  return rows.map((e) => ({ id: e.id, status: e.status, enrolledAt: e.enrolledAt, droppedAt: e.droppedAt, student: e.student }));
}

/**
 * Enrols one student (by id or student number). Reactivates a dropped enrolment.
 * @throws 400 STUDENT_NOT_FOUND, 409 ALREADY_ENROLLED
 */
export async function enrolStudent(courseId: string, who: { studentId?: string; studentNumber?: string }, actorId: string, req: Request) {
  if (!(await prisma.course.findUnique({ where: { id: courseId } }))) throw notFound("COURSE_NOT_FOUND");
  const student = await prisma.user.findFirst({
    where: { ...(who.studentId ? { id: who.studentId } : { studentNumber: who.studentNumber?.toUpperCase() }), role: { name: "STUDENT" } },
  });
  if (!student) throw badRequest("STUDENT_NOT_FOUND", "No student with this id or number");
  return transaction(async (tx) => {
    const existing = await tx.enrolment.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId } } });
    if (existing?.status === "ACTIVE") throw conflict("ALREADY_ENROLLED", "The student is already enrolled");
    const e = existing
      ? await tx.enrolment.update({ where: { id: existing.id }, data: { status: "ACTIVE", droppedAt: null } })
      : await tx.enrolment.create({ data: { studentId: student.id, courseId } });
    await audit(tx, { actorId, action: existing ? "ENROLMENT_REACTIVATED" : "ENROLMENT_CREATED", entityType: "course", entityId: courseId, details: { student: student.studentNumber }, req });
    return e;
  });
}

/** Drops a student. Their attempts and results stay. @throws 404 ENROLMENT_NOT_FOUND, 409 ALREADY_DROPPED */
export async function dropStudent(courseId: string, studentId: string, actorId: string, req: Request) {
  const e = await prisma.enrolment.findUnique({ where: { studentId_courseId: { studentId, courseId } }, include: { student: true } });
  if (!e) throw notFound("ENROLMENT_NOT_FOUND");
  if (e.status === "DROPPED") throw conflict("ALREADY_DROPPED", "The student is already dropped");
  return transaction(async (tx) => {
    const updated = await tx.enrolment.update({ where: { id: e.id }, data: { status: "DROPPED", droppedAt: now() } });
    await audit(tx, { actorId, action: "ENROLMENT_DROPPED", entityType: "course", entityId: courseId, details: { student: e.student.studentNumber }, req });
    return updated;
  });
}
