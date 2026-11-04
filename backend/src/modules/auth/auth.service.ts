/**
 * Authentication service: login, password change and language preference.
 *
 * Login names: students use their student number (e.g. DEMO-2026-0001), staff
 * use their email address. A failed login always returns the same
 * INVALID_CREDENTIALS error, whether the account is missing, inactive or the
 * password is wrong, and takes the same time (a dummy bcrypt comparison runs
 * for unknown names), so accounts cannot be discovered.
 *
 * Temporary passwords (Q1): accepted until temp_password_expires_at; after
 * login the user must change it before using anything else.
 */
import type { Request } from "express";
import { now } from "../../db/clock.ts";
import { prisma, transaction } from "../../db/prisma.ts";
import type { Language } from "../../generated/prisma/enums.ts";
import { AppError, badRequest, unauthorized } from "../../lib/errors.ts";
import { dummyVerify, hashPassword, verifyPassword } from "../../lib/passwords.ts";
import { audit } from "../../services/audit.ts";

/** Public profile returned by login and /auth/me. Never includes the password hash. */
export interface Profile {
  id: string;
  role: string;
  fullName: string;
  email: string | null;
  studentNumber: string | null;
  phone: string;
  preferredLanguage: Language;
  mustChangePassword: boolean;
}

const profileSelect = {
  id: true, fullName: true, email: true, studentNumber: true, phone: true, preferredLanguage: true,
  mustChangePassword: true, role: { select: { name: true } },
} as const;

/** Builds the profile from an allow-list of fields, so secrets can never be included by accident. */
function toProfile(u: { role: { name: string } } & Omit<Profile, "role">): Profile {
  return {
    id: u.id,
    role: u.role.name,
    fullName: u.fullName,
    email: u.email,
    studentNumber: u.studentNumber,
    phone: u.phone,
    preferredLanguage: u.preferredLanguage,
    mustChangePassword: u.mustChangePassword,
  };
}

/** Finds a user by email (contains "@") or by student number. */
function findByIdentifier(identifier: string) {
  const id = identifier.trim();
  return id.includes("@")
    ? prisma.user.findUnique({ where: { email: id.toLowerCase() }, include: { role: true } })
    : prisma.user.findUnique({ where: { studentNumber: id.toUpperCase() }, include: { role: true } });
}

/**
 * Checks the login and returns the user with their token version.
 * @throws 401 INVALID_CREDENTIALS, 401 TEMP_PASSWORD_EXPIRED
 */
export async function login(identifier: string, password: string, req: Request) {
  const user = await findByIdentifier(identifier);
  const ok = user ? await verifyPassword(password, user.passwordHash) : await dummyVerify(password);
  if (!user || !ok || !user.isActive) {
    await audit(prisma, {
      actorId: null, action: "LOGIN_FAILED", entityType: "user", entityId: user?.id ?? null,
      details: { identifier: identifier.trim().slice(0, 100) }, req,
    });
    throw unauthorized("INVALID_CREDENTIALS", "The login name or password is incorrect");
  }
  if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt <= now()) {
    throw new AppError(401, "TEMP_PASSWORD_EXPIRED", "The temporary password has expired. Ask the registrar for a new one.");
  }
  await audit(prisma, { actorId: user.id, action: "LOGIN_SUCCESS", entityType: "user", entityId: user.id, req });
  return { profile: toProfile({ ...user, role: user.role }), tokenVersion: user.tokenVersion };
}

/** The user's public profile (no password hash). */
export async function getProfile(userId: string): Promise<Profile> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: profileSelect });
  return toProfile(u);
}

/**
 * Changes the user's password. Ends all other sessions (token_version + 1) and
 * clears the temporary-password flag.
 * @returns the new token version, used to issue a fresh session cookie.
 * @throws 400 WRONG_CURRENT_PASSWORD, 400 PASSWORD_UNCHANGED
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string, req: Request) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest("WRONG_CURRENT_PASSWORD", "The current password is incorrect");
  }
  if (currentPassword === newPassword) throw badRequest("PASSWORD_UNCHANGED", "Choose a different password");
  const passwordHash = await hashPassword(newPassword);
  return transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, tempPasswordExpiresAt: null, tokenVersion: { increment: 1 } },
    });
    await audit(tx, { actorId: userId, action: "PASSWORD_CHANGED", entityType: "user", entityId: userId, req });
    return updated.tokenVersion;
  });
}

/** Saves the user's language (Somali "so" or English "en"). */
export async function setLanguage(userId: string, language: Language): Promise<Profile> {
  const u = await prisma.user.update({ where: { id: userId }, data: { preferredLanguage: language }, select: profileSelect });
  return toProfile(u);
}
