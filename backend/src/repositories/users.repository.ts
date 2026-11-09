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
  id: true, username: true, studentNumber: true, email: true, fullName: true, phone: true, preferredLanguage: true,
  isActive: true, mustChangePassword: true, createdAt: true, role: { select: { name: true } },
} as const;

/** Fields of the logged-in user's own profile. */
export const profileSelect = {
  id: true, username: true, fullName: true, email: true, studentNumber: true, phone: true, preferredLanguage: true,
  mustChangePassword: true, role: { select: { name: true } },
} as const;

/** The fields the auth middleware needs for every request. */
export function findSessionUser(id: string, db: Db = prisma) {
  return db.user.findUnique({ where: { id }, select: { ...profileSelect, tokenVersion: true, isActive: true } });
}

export function findRole(name: RoleName, db: Db = prisma) {
  return db.role.findUniqueOrThrow({ where: { name } });
}

/** Login lookup by email or username, including the password hash. */
export function findUserForLoginWithPassword(by: { email: string } | { username: string }, db: Db = prisma) {
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

/**
 * Ends the sessions of this token version: increments token_version only if it still equals
 * `version` (an old cookie cannot end a newer session). Returns how many rows changed (0 or 1).
 */
export async function revokeSessions(id: string, version: number, db: Db = prisma) {
  const r = await db.user.updateMany({ where: { id, tokenVersion: version }, data: { tokenVersion: { increment: 1 } } });
  return r.count;
}

/**
 * Increments the account-number counter of this role and year (creating it at 1) and returns the
 * new value. The upsert locks the counter row until the caller's transaction ends.
 */
export async function takeAccountNumber(role: RoleName, year: number, db: Db) {
  const rows = await db.$queryRaw<{ last_value: number }[]>`
    INSERT INTO "account_number_sequences" ("role", "year", "last_value")
    VALUES (${role}::"RoleName", ${year}, 1)
    ON CONFLICT ("role", "year") DO UPDATE SET "last_value" = "account_number_sequences"."last_value" + 1
    RETURNING "last_value"`;
  return Number(rows[0].last_value);
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

/** Students with these phone numbers (to stop an import from creating the same student twice). */
export function findStudentsByPhones(phones: string[], db: Db = prisma) {
  return db.user.findMany({
    where: { phone: { in: phones }, role: { name: "STUDENT" } },
    select: { id: true, studentNumber: true, fullName: true, phone: true },
  });
}

/** Active students of a course (for messages after a schedule approval). */
export function findActiveStudentsOfCourse(courseId: string, db: Db = prisma) {
  return db.user.findMany({
    where: { enrolments: { some: { courseId, status: "ACTIVE" } }, isActive: true },
    select: { id: true, phone: true, preferredLanguage: true },
  });
}
