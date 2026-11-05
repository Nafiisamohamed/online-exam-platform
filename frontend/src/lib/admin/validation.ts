/**
 * Form checks that mirror the backend's validation rules, so the registrar sees
 * a clear, translated message before sending. The server still checks
 * everything; these never replace its validation.
 *
 * Each check returns a message key, or null when the value is fine.
 */
import type { MessageKey } from "@/lib/i18n/i18n";

/** Same rule as backend/src/lib/phone.ts: Somali mobile numbers, returned as +2526XXXXXXXX / +2527XXXXXXXX. */
export function normalizeSomaliPhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (/^252\d{9}$/.test(digits)) digits = "+" + digits;
  if (/^0[67]\d{8}$/.test(digits)) digits = "+252" + digits.slice(1);
  if (/^[67]\d{8}$/.test(digits)) digits = "+252" + digits;
  return /^\+252[67]\d{8}$/.test(digits) ? digits : null;
}

export const checks = {
  required: (v: string): MessageKey | null => (v.trim() ? null : "validation.required"),
  fullName: (v: string): MessageKey | null => (!v.trim() ? "validation.required" : v.trim().length > 150 ? "validation.tooLong" : null),
  phone: (v: string): MessageKey | null => (!v.trim() ? "validation.required" : normalizeSomaliPhone(v) ? null : "validation.phone"),
  email: (v: string): MessageKey | null => (!v.trim() ? "validation.required" : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "validation.email"),
  /** users.routes studentNumberField: 3-30 letters, digits or dashes. */
  studentNumber: (v: string): MessageKey | null => (!v.trim() ? "validation.required" : /^[A-Za-z0-9-]{3,30}$/.test(v.trim()) ? null : "validation.studentNumber"),
  /** courses.routes code: 2-20 letters, digits or dashes. */
  code: (v: string): MessageKey | null => (!v.trim() ? "validation.required" : /^[A-Za-z0-9-]{2,20}$/.test(v.trim()) ? null : "validation.code"),
  /** courses.routes semester: "2026-Fall". */
  semester: (v: string): MessageKey | null => (!v.trim() ? "validation.required" : /^\d{4}-[A-Za-z]{3,10}$/.test(v.trim()) ? null : "validation.semester"),
  name: (v: string): MessageKey | null => (!v.trim() ? "validation.required" : v.trim().length > 200 ? "validation.tooLong" : null),
};

/** Runs the checks and returns only the failing fields. */
export function validateForm<K extends string>(rules: Record<K, MessageKey | null>): Partial<Record<K, MessageKey>> {
  const out: Partial<Record<K, MessageKey>> = {};
  for (const [k, v] of Object.entries(rules) as [K, MessageKey | null][]) if (v) out[k] = v;
  return out;
}
