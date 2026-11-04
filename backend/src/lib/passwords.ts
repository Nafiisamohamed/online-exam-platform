/**
 * Password hashing and temporary passwords (baseline 6.6: bcrypt).
 *
 * - hashPassword / verifyPassword use bcrypt with BCRYPT_ROUNDS (default 12).
 * - generateTempPassword makes a random 12-character password from letters and
 *   digits that are easy to read aloud (no 0/O, 1/l/I). Q1: it is shown once to
 *   the registrar and never stored in plain text (not even in the SMS outbox).
 * - passwordRule is the rule for passwords users choose themselves.
 */
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../config/env.ts";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Compared when a login name does not exist, so a failed login takes the same
 * time whether or not the account exists. Created once at startup.
 */
let dummyHash: string | null = null;
export async function dummyVerify(plain: string): Promise<false> {
  dummyHash ??= await bcrypt.hash("dummy-password-for-timing", env.BCRYPT_ROUNDS);
  await bcrypt.compare(plain, dummyHash);
  return false;
}

export function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  // Guarantee at least one digit and one letter.
  if (!/\d/.test(out)) out = out.slice(0, -1) + String(randomInt(2, 10));
  if (!/[A-Za-z]/.test(out)) out = "K" + out.slice(1);
  return out;
}

/** At least 8 characters with at least one letter and one digit. */
export const passwordRule = z
  .string()
  .min(8, "must be at least 8 characters")
  .max(128)
  .regex(/[A-Za-z]/, "must contain a letter")
  .regex(/\d/, "must contain a digit");
