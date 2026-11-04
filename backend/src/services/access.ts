/**
 * Record-level access checks shared by the modules (baseline 6.2 and the
 * "Student-level authorization lives in Express" rule in docs/database.md).
 *
 * The database role exam_app can see every row, so these checks are the
 * application's permission system:
 * - ADMIN: every course and exam;
 * - LECTURER: only courses they teach (and exams of those courses), plus
 *   essay grading for exams where they are the assigned second grader;
 * - STUDENT: only courses they are actively enrolled in;
 * - INVIGILATOR: only exam sessions they are assigned to.
 * A failed check throws 404, so other people's records are not revealed.
 */
import type { AuthUser } from "../middleware/auth.ts";
import type { Db } from "../db/prisma.ts";
import { notFound } from "../lib/errors.ts";
import { findCourse, findEnrolment } from "../repositories/courses.repository.ts";
import { findExamWithCourse } from "../repositories/exams.repository.ts";

/** Loads a course the user may manage (admin, or the course's lecturer). */
export async function manageableCourse(user: AuthUser, courseId: string, db?: Db) {
  const course = await findCourse(courseId, db);
  if (!course || (user.role !== "ADMIN" && !(user.role === "LECTURER" && course.lecturerId === user.id))) {
    throw notFound("COURSE_NOT_FOUND");
  }
  return course;
}

/** Loads a course the user may view (managers, or an actively enrolled student). */
export async function viewableCourse(user: AuthUser, courseId: string, db?: Db) {
  const course = await findCourse(courseId, db);
  if (!course) throw notFound("COURSE_NOT_FOUND");
  if (user.role === "ADMIN" || (user.role === "LECTURER" && course.lecturerId === user.id)) return course;
  if (user.role === "STUDENT") {
    const e = await findEnrolment(user.id, courseId, db);
    if (e?.status === "ACTIVE") return course;
  }
  throw notFound("COURSE_NOT_FOUND");
}

/**
 * Loads an exam the user may manage: admin, or the lecturer of its course.
 * - allowSecondGrader: the exam's assigned second grader is also allowed;
 * - ownerOnly: only the course lecturer (not the admin), for changes that
 *   belong to the lecturer such as building or grading the exam.
 */
export async function manageableExam(
  user: AuthUser,
  examId: string,
  opts: { allowSecondGrader?: boolean; ownerOnly?: boolean } = {},
  db?: Db,
) {
  const exam = await findExamWithCourse(examId, db);
  const ok =
    exam &&
    ((user.role === "ADMIN" && !opts.ownerOnly) ||
      (user.role === "LECTURER" && (exam.course.lecturerId === user.id || (opts.allowSecondGrader && exam.secondGraderId === user.id))));
  if (!ok) throw notFound("EXAM_NOT_FOUND");
  return exam!;
}
