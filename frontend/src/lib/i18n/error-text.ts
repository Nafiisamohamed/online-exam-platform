/**
 * Turns an API error into a message in the current language. The API sends a
 * stable code (e.g. "COURSE_EXISTS") plus values in `details`; the English
 * message from the server is never shown to users.
 */
import { ApiError } from "@/lib/api/client";
import type { MessageKey } from "./i18n";
import { errorsEn, importErrorsEn } from "./messages/admin.en";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Values for {placeholders}: lists are joined, objects are left out. */
function vars(details: Record<string, unknown> | undefined) {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(details ?? {})) {
    if (typeof v === "string" || typeof v === "number") out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number")) out[k] = v.join(", ");
  }
  return out;
}

export function hasErrorText(code: string): code is keyof typeof errorsEn {
  return Object.hasOwn(errorsEn, code);
}

export function errorText(t: T, error: unknown): string {
  if (!(error instanceof ApiError)) return t("errors.generic");
  if (hasErrorText(error.code)) return t(`errors.${error.code}`, vars(error.details));
  if (error.status === 404) return t("errors.NOT_FOUND");
  if (error.status === 403) return t("errors.FORBIDDEN");
  if (error.status === 429) return t("errors.RATE_LIMITED");
  return t("errors.generic");
}

/** One CSV preview row error, e.g. COURSE_NOT_FOUND { code: "CS999" }. */
export function importErrorText(t: T, e: { code: string; params?: Record<string, string | number> }): string {
  return Object.hasOwn(importErrorsEn, e.code) ? t(`importErrors.${e.code as keyof typeof importErrorsEn}`, e.params) : e.code;
}
