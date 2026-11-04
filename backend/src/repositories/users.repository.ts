/**
 * Users and roles. Selections never include the password hash, except the
 * two functions whose names say "WithPassword" (used only to check a login or
 * a password change).
 */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { RoleName } from "../generated/prisma/enums.ts";

/** Fields returned for a user in admin screens. */
export const userSelect = {
  id: true, studentNumber: true, email: true, fullName: true, phone: true, preferredLanguage: true,
  isActive: true, mustChangePassword: true, createdAt: true, role: { select: { name: true } },
} as const;

/** Fields of the logged-in user's own profile. */
export const profileSelect = {
  id: true, fullName: true, email: true, studentNumber: true, phone: true, preferredLanguage: true,
  mustChangePassword: true, role: { select: { name: true } },
} as const;

/** The fields the auth middleware needs for every request. */
export function findSessionUser(id: string, db: Db = prisma) {
  return db.user.findUnique({ where: { id }, select: { ...profileSelect, tokenVersion: true, isActive: true } });
}

export function findRole(name: RoleName, db: Db = prisma) {
  return db.role.findUniqueOrThrow({ where: { name } });
}

/** Login lookup by email or student number, including the password hash. */
export function findUserForLoginWithPassword(by: { email: string } | { studentNumber: string }, db: Db = prisma) {
  return db.user.findUnique({ where: by, include: { role: true } });
}

export function findUserWithPassword(id: string, db: Db = prisma) {
  return db.user.findUniqueOrThrow({ where: { id } });
}

export function findProfile(id: string, db: Db = prisma) {
  return db.user.findUniqueOrThrow({ where: { id }, select: profileSelect });
}

export function updateProfile(id: string, data: Prisma.UserUpdateInput, db: Db = prisma) {
  return db.user.update({ where: { id }, data, select: profileSelect });
}

export function findUser(id: string, db: Db = prisma) {
  return db.user.findUnique({ where: { id }, select: userSelect });
}

export function insertUser(data: Prisma.UserUncheckedCreateInput, db: Db = prisma) {
  return db.user.create({ data, select: userSelect });
}

/** Changes a user. Returns the public fields and the new token version. */
export function updateUser(id: string, data: Prisma.UserUpdateInput, db: Db = prisma) {
  return db.user.update({ where: { id }, data, select: { ...userSelect, tokenVersion: true } });
}

export function listUsers(where: Prisma.UserWhereInput, skip: number, take: number, db: Db = prisma) {
  return Promise.all([
    db.user.findMany({ where, select: userSelect, orderBy: [{ fullName: "asc" }], skip, take }),
    db.user.count({ where }),
  ]);
}

export function listActiveStaff(role: "LECTURER" | "INVIGILATOR", db: Db = prisma) {
  return db.user.findMany({ where: { role: { name: role }, isActive: true }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: "asc" } });
}

/** A user with their role (for checking that someone is an active lecturer, invigilator or student). */
export function findUserWithRole(id: string, db: Db = prisma) {
  return db.user.findUnique({ where: { id }, include: { role: true } });
}

/** How many of these ids are active users with the role. */
export function countActiveWithRole(ids: string[], role: RoleName, db: Db = prisma) {
  return db.user.count({ where: { id: { in: ids }, isActive: true, role: { name: role } } });
}

/** A student found by id or student number. */
export function findStudent(by: { id?: string; studentNumber?: string }, db: Db = prisma) {
  return db.user.findFirst({ where: { ...(by.id ? { id: by.id } : { studentNumber: by.studentNumber }), role: { name: "STUDENT" } } });
}

/** Students with these numbers, with the courses they are actively enrolled in. */
export function findStudentsByNumbers(numbers: string[], db: Db = prisma) {
  return db.user.findMany({
    where: { studentNumber: { in: numbers } },
    select: { id: true, studentNumber: true, fullName: true, enrolments: { where: { status: "ACTIVE" }, select: { courseId: true } } },
  });
}

/** Active students of a course (for messages after a schedule approval). */
export function findActiveStudentsOfCourse(courseId: string, db: Db = prisma) {
  return db.user.findMany({
    where: { enrolments: { some: { courseId, status: "ACTIVE" } }, isActive: true },
    select: { id: true, phone: true, preferredLanguage: true },
  });
}
