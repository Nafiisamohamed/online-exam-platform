/** Academic years, faculty lecturer assignments and student registrations (Phase 2). */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";

// --- Academic years -------------------------------------------------------------------

export function listAcademicYears(db: Db = prisma) {
  return db.academicYear.findMany({
    orderBy: { name: "desc" },
    include: { _count: { select: { courses: true, registrations: true } } },
  });
}

export function findAcademicYear(id: string, db: Db = prisma) {
  return db.academicYear.findUnique({ where: { id } });
}

export function findCurrentAcademicYear(db: Db = prisma) {
  return db.academicYear.findFirst({ where: { isCurrent: true } });
}

export function insertAcademicYear(data: { name: string; startDate: Date; endDate: Date }, db: Db = prisma) {
  return db.academicYear.create({ data });
}

export function updateAcademicYear(id: string, data: Prisma.AcademicYearUpdateInput, db: Db = prisma) {
  return db.academicYear.update({ where: { id }, data });
}

/** Makes `id` the only current year (two statements in the caller's transaction). */
export async function setCurrentAcademicYear(id: string, db: Db) {
  await db.academicYear.updateMany({ where: { isCurrent: true, NOT: { id } }, data: { isCurrent: false } });
  return db.academicYear.update({ where: { id }, data: { isCurrent: true } });
}

// --- Faculty lecturers ----------------------------------------------------------------

export function listFacultyLecturers(facultyId: string, db: Db = prisma) {
  return db.facultyLecturer.findMany({
    where: { facultyId },
    orderBy: { lecturer: { fullName: "asc" } },
    include: {
      lecturer: {
        select: { id: true, fullName: true, username: true, email: true, isActive: true, _count: { select: { coursesTaught: { where: { facultyId } } } } },
      },
    },
  });
}

export function findFacultyLecturer(facultyId: string, lecturerId: string, db: Db = prisma) {
  return db.facultyLecturer.findUnique({ where: { facultyId_lecturerId: { facultyId, lecturerId } } });
}

export function insertFacultyLecturer(facultyId: string, lecturerId: string, db: Db = prisma) {
  return db.facultyLecturer.create({ data: { facultyId, lecturerId } });
}

export function deleteFacultyLecturer(facultyId: string, lecturerId: string, db: Db = prisma) {
  return db.facultyLecturer.delete({ where: { facultyId_lecturerId: { facultyId, lecturerId } } });
}

export function countCoursesTaughtInFaculty(facultyId: string, lecturerId: string, db: Db = prisma) {
  return db.course.count({ where: { facultyId, lecturerId } });
}

/** The faculties a lecturer is assigned to, with how many of their own courses each has. */
export function listLecturerFaculties(lecturerId: string, db: Db = prisma) {
  return db.facultyLecturer.findMany({
    where: { lecturerId },
    orderBy: { faculty: { code: "asc" } },
    include: { faculty: { select: { id: true, code: true, name: true, _count: { select: { courses: { where: { lecturerId } } } } } } },
  });
}

// --- Student registrations ------------------------------------------------------------

const registrationInclude = {
  student: { select: { id: true, fullName: true, username: true, studentNumber: true, isActive: true } },
  academicYear: { select: { id: true, name: true, isCurrent: true } },
  faculty: { select: { id: true, code: true, name: true } },
} as const;

export function listRegistrations(where: Prisma.StudentRegistrationWhereInput, skip: number, take: number, db: Db = prisma) {
  return Promise.all([
    db.studentRegistration.findMany({ where, include: registrationInclude, orderBy: [{ semesterNumber: "asc" }, { student: { fullName: "asc" } }], skip, take }),
    db.studentRegistration.count({ where }),
  ]);
}

export function findRegistrationById(id: string, db: Db = prisma) {
  return db.studentRegistration.findUnique({ where: { id }, include: registrationInclude });
}

export function insertRegistration(data: { studentId: string; academicYearId: string; facultyId: string; semesterNumber: number }, db: Db = prisma) {
  return db.studentRegistration.create({ data, include: registrationInclude });
}

export function updateRegistration(id: string, data: { facultyId?: string; semesterNumber?: number }, db: Db = prisma) {
  return db.studentRegistration.update({ where: { id }, data, include: registrationInclude });
}

/** A student's registrations, newest academic year and highest semester first. */
export function listStudentRegistrations(studentId: string, db: Db = prisma) {
  return db.studentRegistration.findMany({ where: { studentId }, include: registrationInclude, orderBy: [{ academicYear: { name: "desc" } }, { semesterNumber: "desc" }] });
}

/** Active students registered in one group (year, faculty, semester). */
export function findGroupStudents(group: { academicYearId: string; facultyId: string; semesterNumber: number }, db: Db = prisma) {
  return db.studentRegistration.findMany({
    where: { ...group, student: { isActive: true } },
    select: { student: { select: { id: true, studentNumber: true } } },
  });
}

/** Courses offered to one group. */
export function findGroupCourses(group: { academicYearId: string; facultyId: string; semesterNumber: number }, db: Db = prisma) {
  return db.course.findMany({ where: group, select: { id: true, code: true } });
}
