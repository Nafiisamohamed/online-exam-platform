/**
 * Application errors.
 *
 * Every error sent to the browser has a stable code (for example
 * ATTEMPT_DEADLINE_PASSED). The frontend translates the code into Somali or
 * English (P10), so the API never relies on English sentences.
 *
 * Response shape: { "error": { "code": "...", "message": "...", "details": {...} } }
 * - code:    stable, machine-readable;
 * - message: a short English description for developers and logs;
 * - details: optional values for the translated message (counts, limits).
 */
export class AppError extends Error {
  constructor(
    /** HTTP status code. */
    readonly status: number,
    /** Stable error code. */
    readonly code: string,
    message?: string,
    /** Optional values, e.g. { required: 10, available: 6 }. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message?: string, details?: Record<string, unknown>) =>
  new AppError(400, code, message, details);
export const unauthorized = (code = "UNAUTHENTICATED", message = "Log in first") => new AppError(401, code, message);
export const forbidden = (code = "FORBIDDEN", message = "You do not have permission for this action") =>
  new AppError(403, code, message);
/** Also used when a record exists but belongs to someone else, so its existence is not revealed. */
export const notFound = (code = "NOT_FOUND", message = "Not found") => new AppError(404, code, message);
export const conflict = (code: string, message?: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, details);
