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
 * - The username (S-/T-/R-/I-YYYY-NNN) is generated here, never typed (services/account-numbers.ts).
 *   A student's student number is their username.
 */
import type { Request } from "express";
import { env } from "../../config/env.ts";
import { now } from "../../db/clock.ts";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { transaction } from "../../db/prisma.ts";
import * as usersRepo from "../../repositories/users.repository.ts";
import type { Language, RoleName } from "../../generated/prisma/enums.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { paged } from "../../lib/format.ts";
import { generateTempPassword, hashPassword } from "../../lib/passwords.ts";
import { audit } from "../../services/audit.ts";
import { queueSms } from "../../services/messaging.ts";
import { nextAccountNumber } from "../../services/account-numbers.ts";

type UserRow = { role: { name: RoleName } } & Record<string, unknown>;
/** API shape of a user: the role as a plain name. tokenVersion is internal and dropped. */
export const toUser = ({ role, tokenVersion: _v, ...u }: UserRow) => ({ ...u, role: role.name });

export interface NewUser {
  role: RoleName;
  fullName: string;
  phone: string;
  email?: string;
  preferredLanguage?: Language;
}

/** When a temporary password issued now expires (TEMP_PASSWORD_DAYS). */
export function tempPasswordExpiry(): Date {
  return new Date(now().getTime() + env.TEMP_PASSWORD_DAYS * 86_400_000);
}

/**
 * Creates one account with a temporary password.
 * The username comes from the role's counter in the same transaction, so it is never duplicated.
 * @returns { user, temporaryPassword }  (the password is shown only this once)
 * @throws 400 EMAIL_REQUIRED, 409 EMAIL_TAKEN
 */
export async function createUser(input: NewUser, actorId: string, req: Request) {
  const isStudent = input.role === "STUDENT";
  if (!isStudent && !input.email) throw badRequest("EMAIL_REQUIRED", "Staff accounts need an email address");
  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const role = await usersRepo.findRole(input.role);
  try {
    const user = await transaction(async (tx) => {
      const username = await nextAccountNumber(tx, input.role);
      const created = await usersRepo.insertUser(
        {
          roleId: role.id,
          username,
          studentNumber: isStudent ? username : null,
          email: isStudent ? null : input.email!.toLowerCase(),
          fullName: input.fullName,
          phone: input.phone,
          preferredLanguage: input.preferredLanguage ?? "so",
          passwordHash,
          mustChangePassword: true,
          tempPasswordExpiresAt: tempPasswordExpiry(),
        },
        tx,
      );
      if (isStudent) {
        await queueSms(tx, { id: created.id, phone: created.phone, preferredLanguage: created.preferredLanguage }, "ACCOUNT_CREATED",
          { studentNumber: created.studentNumber! }, { type: "user", id: created.id });
      }
      await audit(tx, { actorId, action: "USER_CREATED", entityType: "user", entityId: created.id, details: { role: input.role }, req });
      return created;
    });
    return { user: toUser(user), temporaryPassword };
  } catch (error) {
    if (isUniqueViolation(error, "email")) throw conflict("EMAIL_TAKEN", "This email address is already used");
    throw error;
  }
}

/** Lists users with optional role and search filters (name, email or username). */
export async function listUsers(q: { role?: RoleName; search?: string; active?: boolean; page: number; pageSize: number }) {
  const where = {
    ...(q.role ? { role: { name: q.role } } : {}),
    ...(q.active !== undefined ? { isActive: q.active } : {}),
    ...(q.search
      ? {
          OR: [
            { fullName: { contains: q.search, mode: "insensitive" as const } },
            { email: { contains: q.search, mode: "insensitive" as const } },
            { username: { contains: q.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await usersRepo.listUsers(where, (q.page - 1) * q.pageSize, q.pageSize);
  return paged(rows.map(toUser), total, q.page, q.pageSize);
}

/** One user (no password hash). @throws 404 USER_NOT_FOUND */
export async function getUser(id: string) {
  const u = await usersRepo.findUser(id);
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
    const u = await usersRepo.updateUser(id, { ...patch, ...(patch.isActive === false ? { tokenVersion: { increment: 1 } } : {}) }, tx);
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
    await usersRepo.updateUser(id, { passwordHash, mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry(), tokenVersion: { increment: 1 } }, tx);
    await audit(tx, { actorId, action: "PASSWORD_RESET", entityType: "user", entityId: id, req });
  });
  return { temporaryPassword };
}

/** Active lecturers or invigilators (id and name only), for choosing graders and invigilators. */
export async function listStaff(role: "LECTURER" | "INVIGILATOR") {
  return usersRepo.listActiveStaff(role);
}
