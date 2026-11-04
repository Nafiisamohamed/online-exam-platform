/**
 * Helpers for the API tests.
 *
 * The API tests call the real Express app (supertest, no network port) with
 * the real database rules: the test database, migrated from scratch, used as
 * the restricted exam_app role (see tests/setup-env.mjs). Rows they create
 * are committed and removed by the reset at the start of the next run, so
 * every builder uses unique names and codes.
 */
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../src/app.ts";
import { prisma } from "../../src/db/prisma.ts";
import { hashPassword } from "../../src/lib/passwords.ts";
import type { RoleName } from "../../src/generated/prisma/enums.ts";

if (/supabase\.(com|co)/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("API tests must never run against Supabase");
}

export const app = createApp();
export { prisma };

let seq = 0;
/** A short unique suffix for codes and names. */
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase();

export const PASSWORD = "Passw0rd-test";
let cachedHash: string | null = null;

/** Creates a user with password PASSWORD. Students get a student number, staff an email. */
export async function createUser(role: RoleName, extra: Partial<{ fullName: string; phone: string; mustChangePassword: boolean; tempPasswordExpiresAt: Date; isActive: boolean; preferredLanguage: "so" | "en" }> = {}) {
  cachedHash ??= await hashPassword(PASSWORD);
  const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const id = uid();
  return prisma.user.create({
    data: {
      roleId: r.id,
      studentNumber: role === "STUDENT" ? `T-${id}` : null,
      email: role === "STUDENT" ? null : `${role.toLowerCase()}.${id.toLowerCase()}@test.local`,
      fullName: extra.fullName ?? `${role} ${id}`,
      phone: extra.phone ?? "+252615000000",
      passwordHash: cachedHash,
      mustChangePassword: extra.mustChangePassword ?? false,
      tempPasswordExpiresAt: extra.tempPasswordExpiresAt ?? null,
      isActive: extra.isActive ?? true,
      preferredLanguage: extra.preferredLanguage ?? "so",
    },
  });
}

/** Logs in and returns a supertest agent that keeps the session cookie. */
export async function loginAs(user: { email: string | null; studentNumber: string | null }, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ identifier: user.email ?? user.studentNumber, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

/** Creates a user of the role and returns [user, logged-in agent]. */
export async function userAgent(role: RoleName) {
  const user = await createUser(role);
  return [user, await loginAs(user)] as const;
}

export { request, randomUUID };
