/**
 * Turns database errors into AppErrors with stable codes.
 *
 * The database is the last line of defence: triggers raise SQLSTATE P0001 with
 * a code as the message (e.g. ATTEMPT_DEADLINE_PASSED), and constraints reject
 * invalid rows. Services check the same rules first, so these errors normally
 * only appear in races (two requests at the same moment). When they do, the
 * user still gets a clear, translated message instead of a 500 error.
 */
import { AppError } from "../lib/errors.ts";

/** Trigger message codes raised by the migrations, with their HTTP status. */
const TRIGGER_CODES: Record<string, number> = {
  QUESTION_VERSION_LOCKED: 409,
  APPEND_ONLY_TABLE: 409,
  ATTEMPT_ALREADY_SUBMITTED: 409,
  ATTEMPT_DEADLINE_PASSED: 409,
  PAYMENT_DELETE_FORBIDDEN: 409,
  PAYMENT_FIELDS_IMMUTABLE: 409,
  PAYMENT_ALREADY_FINAL: 409,
  PAYMENT_EXPIRED: 409,
  PAYMENT_NOT_EXPIRED: 409,
  PAYMENT_INVALID_TRANSITION: 409,
  PAYMENT_INVALID_INSERT: 409,
  PAYMENT_PIN_ATTEMPTS_DECREASED: 409,
  PAYMENT_PIN_ATTEMPTS_INVALID: 409,
};

/** Collects every message, code and constraint name found on the error and its causes. */
function inspect(error: unknown) {
  const texts: string[] = [];
  const codes: string[] = [];
  let constraint: string | undefined;
  const seen = new Set<unknown>();
  const visit = (e: any, depth: number) => {
    if (!e || typeof e !== "object" || seen.has(e) || depth > 6) return;
    seen.add(e);
    for (const k of ["message", "originalMessage"]) if (typeof e[k] === "string") texts.push(e[k]);
    for (const k of ["code", "originalCode"]) if (typeof e[k] === "string") codes.push(e[k]);
    if (typeof e.constraint === "string") constraint ??= e.constraint;
    if (e.constraint && typeof e.constraint === "object") {
      const c = e.constraint;
      constraint ??= c.index ?? (Array.isArray(c.fields) ? c.fields.join(",") : undefined);
    }
    if (e.meta) {
      if (typeof e.meta.constraint === "string") constraint ??= e.meta.constraint;
      if (typeof e.meta.code === "string") codes.push(e.meta.code);
      if (typeof e.meta.message === "string") texts.push(e.meta.message);
      visit(e.meta.driverAdapterError, depth + 1);
    }
    visit(e.cause, depth + 1);
  };
  visit(error, 0);
  // Prisma sometimes only gives the constraint name inside the message text.
  if (!constraint) {
    for (const t of texts) {
      const m = /constraint "([a-z0-9_]+)"/i.exec(t);
      if (m) { constraint = m[1]; break; }
    }
  }
  return { texts, codes, constraint };
}

/**
 * Returns an AppError for a recognised database error, or null.
 * - trigger codes          -> their status (409), code = trigger code;
 * - unique violations      -> 409 DUPLICATE;
 * - CHECK violations       -> 400 CONSTRAINT_VIOLATION (constraint in details);
 * - foreign key violations -> 400 INVALID_REFERENCE.
 */
export function mapDbError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;
  const { texts, codes, constraint } = inspect(error);
  for (const text of texts) {
    for (const [code, status] of Object.entries(TRIGGER_CODES)) {
      // The code must stand alone, so PAYMENT_EXPIRED does not match PAYMENT_NOT_EXPIRED.
      if (new RegExp(`(^|[^A-Z_])${code}([^A-Z_]|$)`).test(text)) return new AppError(status, code, `Rejected by the database: ${code}`);
    }
  }
  const has = (...c: string[]) => codes.some((x) => c.includes(x)) || texts.some((t) => c.some((x) => t.includes(x)));
  const details = constraint ? { constraint } : undefined;
  if (has("P2002", "23505", "UniqueConstraintViolation")) return new AppError(409, "DUPLICATE", "This record already exists", details);
  if (has("23514", "CheckConstraintViolation") || texts.some((t) => /violates check constraint/.test(t)))
    return new AppError(400, "CONSTRAINT_VIOLATION", "The data breaks a database rule", details);
  if (has("P2003", "23503", "ForeignKeyConstraintViolation")) return new AppError(400, "INVALID_REFERENCE", "A referenced record does not exist", details);
  if (has("22P02", "P2023")) return new AppError(400, "INVALID_ID", "Invalid identifier");
  return null;
}

/** True when the error is a unique violation (optionally on one constraint/index). */
export function isUniqueViolation(error: unknown, constraintPart?: string): boolean {
  const mapped = mapDbError(error);
  if (!mapped || mapped.code !== "DUPLICATE") return false;
  if (!constraintPart) return true;
  const c = String(mapped.details?.constraint ?? "");
  const { texts } = inspect(error);
  return c.includes(constraintPart) || texts.some((t) => t.includes(constraintPart));
}
