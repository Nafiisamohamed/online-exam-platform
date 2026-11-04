/**
 * User management (Admin / Registrar).
 *
 * - New accounts get a random temporary password (Q1). It is returned once in
 *   the response for the registrar to hand over, stored only as a bcrypt hash,
 *   expires after TEMP_PASSWORD_DAYS and must be changed at first login.
 * - New students also get the ACCOUNT_CREATED SMS, which never contains the
 *   password (it says to collect it from the registrar).
 * - Deactivating an account or resetting its password ends its sessions.
 * - Users are never deleted, because exam history refers to them.
 */
import type { Request } from "express";
import { env } from "../../config/env.ts";
import { now } from "../../db/clock.ts";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { prisma, transaction } from "../../db/prisma.ts";
import type { Language, RoleName } from "../../generated/prisma/enums.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { paged } from "../../lib/format.ts";
import { generateTempPassword, hashPassword } from "../../lib/passwords.ts";
import { audit } from "../../services/audit.ts";
import { queueSms } from "../../services/messaging.ts";

/** Fields returned for a user. Never the password hash. */
export const userSelect = {
  id: true, studentNumber: true, email: true, fullName: true, phone: true, preferredLanguage: true,
  isActive: true, mustChangePassword: true, createdAt: true, role: { select: { name: true } },
} as const;

type UserRow = { role: { name: RoleName } } & Record<string, unknown>;
export const toUser = ({ role, ...u }: UserRow) => ({ ...u, role: role.name });

export interface NewUser {
  role: RoleName;
  fullName: string;
  phone: string;
  email?: string;
  studentNumber?: string;
  preferredLanguage?: Language;
}

export function tempPasswordExpiry(): Date {
  return new Date(now().getTime() + env.TEMP_PASSWORD_DAYS * 86_400_000);
}

/**
 * Creates one account with a temporary password.
 * @returns { user, temporaryPassword }  (the password is shown only this once)
 * @throws 400 STUDENT_NUMBER_REQUIRED / EMAIL_REQUIRED, 409 STUDENT_NUMBER_TAKEN / EMAIL_TAKEN
 */
export async function createUser(input: NewUser, actorId: string, req: Request) {
  const isStudent = input.role === "STUDENT";
  if (isStudent && !input.studentNumber) throw badRequest("STUDENT_NUMBER_REQUIRED", "Students need a student number");
  if (!isStudent && !input.email) throw badRequest("EMAIL_REQUIRED", "Staff accounts need an email address");
  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const role = await prisma.role.findUniqueOrThrow({ where: { name: input.role } });
  try {
    const user = await transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          roleId: role.id,
          studentNumber: isStudent ? input.studentNumber!.toUpperCase() : null,
          email: isStudent ? null : input.email!.toLowerCase(),
          fullName: input.fullName,
          phone: input.phone,
          preferredLanguage: input.preferredLanguage ?? "so",
          passwordHash,
          mustChangePassword: true,
          tempPasswordExpiresAt: tempPasswordExpiry(),
        },
        select: userSelect,
      });
      if (isStudent) {
        await queueSms(tx, { id: created.id, phone: created.phone, preferredLanguage: created.preferredLanguage }, "ACCOUNT_CREATED",
          { studentNumber: created.studentNumber! }, { type: "user", id: created.id });
      }
      await audit(tx, { actorId, action: "USER_CREATED", entityType: "user", entityId: created.id, details: { role: input.role }, req });
      return created;
    });
    return { user: toUser(user), temporaryPassword };
  } catch (error) {
    if (isUniqueViolation(error, "student_number")) throw conflict("STUDENT_NUMBER_TAKEN", "This student number is already used");
    if (isUniqueViolation(error, "email")) throw conflict("EMAIL_TAKEN", "This email address is already used");
    throw error;
  }
}

/** Lists users with optional role and search filters (name, email or student number). */
export async function listUsers(q: { role?: RoleName; search?: string; active?: boolean; page: number; pageSize: number }) {
  const where = {
    ...(q.role ? { role: { name: q.role } } : {}),
    ...(q.active !== undefined ? { isActive: q.active } : {}),
    ...(q.search
      ? {
          OR: [
            { fullName: { contains: q.search, mode: "insensitive" as const } },
            { email: { contains: q.search, mode: "insensitive" as const } },
            { studentNumber: { contains: q.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, orderBy: [{ fullName: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.user.count({ where }),
  ]);
  return paged(rows.map(toUser), total, q.page, q.pageSize);
}

export async function getUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!u) throw notFound("USER_NOT_FOUND");
  return toUser(u);
}

/**
 * Updates profile fields or the active flag. Deactivation ends the user's sessions.
 * @throws 400 CANNOT_DEACTIVATE_SELF
 */
export async function updateUser(
  id: string,
  patch: Partial<{ fullName: string; phone: string; preferredLanguage: Language; isActive: boolean }>,
  actorId: string,
  req: Request,
) {
  if (patch.isActive === false && id === actorId) throw badRequest("CANNOT_DEACTIVATE_SELF", "You cannot deactivate your own account");
  await getUser(id);
  return transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id },
      data: { ...patch, ...(patch.isActive === false ? { tokenVersion: { increment: 1 } } : {}) },
      select: userSelect,
    });
    await audit(tx, { actorId, action: "USER_UPDATED", entityType: "user", entityId: id, details: { fields: Object.keys(patch) }, req });
    return toUser(u);
  });
}

/** Issues a new temporary password and ends existing sessions. Returns it once. */
export async function resetPassword(id: string, actorId: string, req: Request) {
  await getUser(id);
  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry(), tokenVersion: { increment: 1 } },
    });
    await audit(tx, { actorId, action: "PASSWORD_RESET", entityType: "user", entityId: id, req });
  });
  return { temporaryPassword };
}

/** Active lecturers or invigilators (id and name only), for choosing graders and invigilators. */
export async function listStaff(role: "LECTURER" | "INVIGILATOR") {
  return prisma.user.findMany({
    where: { role: { name: role }, isActive: true },
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
  });
}
