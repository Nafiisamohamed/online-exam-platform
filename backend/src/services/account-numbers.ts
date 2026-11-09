/**
 * Automatic account numbers, which are also the username:
 *   Student S-YYYY-NNN, Lecturer T-YYYY-NNN, Registrar/Admin R-YYYY-NNN, Invigilator I-YYYY-NNN.
 * YYYY is the current year in Mogadishu time; NNN has at least 3 digits (…-999, then …-1000).
 *
 * Each role and year has one counter row in account_number_sequences. nextAccountNumber()
 * increments it with a single INSERT … ON CONFLICT DO UPDATE … RETURNING: the row lock is held
 * until the surrounding transaction ends, so accounts created at the same moment get
 * consecutive numbers and never the same one. If the account is not saved (the transaction
 * rolls back), the increment rolls back too, so no number is skipped. The unique index on
 * users.username is a second safeguard.
 *
 * Users never type these numbers; the server assigns them.
 */
import { now } from "../db/clock.ts";
import type { Db } from "../db/prisma.ts";
import { takeAccountNumber } from "../repositories/users.repository.ts";
import type { RoleName } from "../generated/prisma/enums.ts";

export const ACCOUNT_PREFIX: Record<RoleName, string> = { STUDENT: "S", LECTURER: "T", ADMIN: "R", INVIGILATOR: "I" };

/** Every valid account number: one of the four prefixes, a 4-digit year, at least 3 digits. */
export const ACCOUNT_NUMBER_RE = /^[STRI]-\d{4}-\d{3,}$/;

/** The calendar year in Mogadishu (UTC+3, no daylight saving) at the given moment. */
export function mogadishuYear(at: Date = now()): number {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Africa/Mogadishu", year: "numeric" }).format(at));
}

/** Formats an account number, e.g. ("STUDENT", 2026, 7) -> "S-2026-007". */
export function formatAccountNumber(role: RoleName, year: number, value: number): string {
  return `${ACCOUNT_PREFIX[role]}-${year}-${String(value).padStart(3, "0")}`;
}

/**
 * Takes the next number for this role in the current Mogadishu year.
 * Must run inside the transaction that creates the account (pass its client as `tx`).
 */
export async function nextAccountNumber(tx: Db, role: RoleName): Promise<string> {
  const year = mogadishuYear();
  return formatAccountNumber(role, year, await takeAccountNumber(role, year, tx));
}
