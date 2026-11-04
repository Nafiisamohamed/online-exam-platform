/** Faculties, courses and enrolments. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export function findCourse(id: string, db: Db = prisma) {
  return db.course.findUnique({ where: { id } });
}

export function findEnrolment(studentId: string, courseId: string, db: Db = prisma) {
  return db.enrolment.findUnique({ where: { studentId_courseId: { studentId, courseId } } });
}

// --- Faculties ----------------------------------------------------------------------

export function listFaculties(db: Db = prisma) {
  return db.faculty.findMany({ orderBy: { code: "asc" }, include: { _count: { select: { courses: true } } } });
}

export function findFaculty(id: string, db: Db = prisma) {
  return db.faculty.findUnique({ where: { id } });
}

export function insertFaculty(data: { code: string; name: string }, db: Db = prisma) {
  return db.faculty.create({ data });
}

export function updateFaculty(id: string, data: { name?: string }, db: Db = prisma) {
  return db.faculty.update({ where: { id }, data });
}

// --- Courses ------------------------------------------------------------------------

const courseInclude = {
  faculty: { select: { id: true, code: true, name: true } },
  lecturer: { select: { id: true, fullName: true, email: true } },
  _count: { select: { enrolments: { where: { status: "ACTIVE" as const } } } },
};

export function listCourses(where: Prisma.CourseWhereInput, db: Db = prisma) {
  return db.course.findMany({ where, include: courseInclude, orderBy: [{ semester: "desc" }, { code: "asc" }] });
}

export function findCourseDetail(id: string, db: Db = prisma) {
  return db.course.findUniqueOrThrow({ where: { id }, include: courseInclude });
}

export function insertCourse(data: Prisma.CourseUncheckedCreateInput, db: Db = prisma) {
  return db.course.create({ data });
}

export function updateCourse(id: string, data: Prisma.CourseUncheckedUpdateInput, db: Db = prisma) {
  return db.course.update({ where: { id }, data });
}

export function findCoursesInSemester(semester: string, db: Db = prisma) {
  return db.course.findMany({ where: { semester }, select: { id: true, code: true } });
}

// --- Enrolments ---------------------------------------------------------------------

export function listEnrolments(courseId: string, status: "ACTIVE" | "DROPPED" | undefined, db: Db = prisma) {
  return db.enrolment.findMany({
    where: { courseId, ...(status ? { status } : {}) },
    include: { student: { select: { id: true, studentNumber: true, fullName: true, phone: true } } },
    orderBy: { student: { studentNumber: "asc" } },
  });
}

export function insertEnrolment(studentId: string, courseId: string, db: Db = prisma) {
  return db.enrolment.create({ data: { studentId, courseId } });
}

export function setEnrolmentStatus(id: string, status: "ACTIVE" | "DROPPED", at: Date | null, db: Db = prisma) {
  return db.enrolment.update({ where: { id }, data: { status, droppedAt: status === "DROPPED" ? at : null } });
}

/** Ids of the courses a student is actively enrolled in. */
export async function findActiveCourseIds(studentId: string, db: Db = prisma) {
  return (await db.enrolment.findMany({ where: { studentId, status: "ACTIVE" }, select: { courseId: true } })).map((e) => e.courseId);
}

/**
 * Approved, not yet finished exam schedules of `newCourseIds` that overlap an
 * approved, not yet finished schedule of another exam in `withCourseIds`.
 */
export async function findOverlappingSchedules(newCourseIds: string[], withCourseIds: string[], db: Db = prisma) {
  if (newCourseIds.length === 0 || withCourseIds.length === 0) return [];
  const rows = await db.$queryRaw<{ course: string; exam: string; other_course: string; other_exam: string }[]>`
    SELECT c.code AS course, e.title AS exam, oc.code AS other_course, oe.title AS other_exam
      FROM exam_schedules s
      JOIN exams e ON e.id = s.exam_id
      JOIN courses c ON c.id = e.course_id
      JOIN exam_schedules os ON os.status = 'APPROVED' AND os.exam_id <> s.exam_id
       AND os.window_start < s.window_end AND os.window_end > s.window_start AND os.window_end > now()
      JOIN exams oe ON oe.id = os.exam_id
      JOIN courses oc ON oc.id = oe.course_id
     WHERE s.status = 'APPROVED' AND s.window_end > now()
       AND e.course_id = ANY (${newCourseIds}::uuid[])
       AND oe.course_id = ANY (${withCourseIds}::uuid[])
     LIMIT 10`;
  return rows.map((r) => ({ course: r.course, exam: r.exam, otherCourse: r.other_course, otherExam: r.other_exam }));
}

/** Serialises enrolment changes with schedule approvals, so the two cannot race. */
export async function lockScheduling(db: Db) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('exam_schedule_approval'))`;
}
