/**
 * Turns an API error into a message in the current language. The API sends a
 * stable code (e.g. "COURSE_EXISTS") plus values in `details`; the English
 * message from the server is never shown to users.
 */
import { ApiError } from "@/lib/api/client";
import type { MessageKey } from "./i18n";
import { errorsEn, importErrorsEn } from "./messages/admin.en";
import { lecturerErrorsEn, questionErrorsEn } from "./messages/lecturer.en";
import { invigilatorErrorsEn } from "./messages/invigilator.en";
import { studentErrorsEn } from "./messages/student.en";

const ERROR_CODES = { ...errorsEn, ...lecturerErrorsEn, ...studentErrorsEn, ...invigilatorErrorsEn };

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

export function hasErrorText(code: string): code is keyof typeof ERROR_CODES {
  return Object.hasOwn(ERROR_CODES, code);
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

/**
 * One question content problem (QUESTION_INVALID details.errors, or a question
 * CSV row error). DUPLICATE_QUESTION says whether the copy is in the bank or
 * on an earlier row of the file.
 */
export function questionErrorText(t: T, e: { code: string; params?: Record<string, string | number> }): string {
  if (e.code === "DUPLICATE_QUESTION") return e.params?.existingRow !== undefined ? t("questionErrors.DUPLICATE_QUESTION_ROW", e.params) : t("questionErrors.DUPLICATE_QUESTION_BANK");
  return Object.hasOwn(questionErrorsEn, e.code) ? t(`questionErrors.${e.code as keyof typeof questionErrorsEn}`, e.params) : e.code;
}
