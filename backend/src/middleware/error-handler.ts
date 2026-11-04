/**
 * Final error handler: every error becomes a JSON response with a stable code.
 *
 * - AppError                -> its own status and code;
 * - recognised DB errors    -> mapped by db-errors.ts (409/400);
 * - invalid JSON body       -> 400 INVALID_JSON;
 * - upload errors (multer)  -> 400 UPLOAD_ERROR;
 * - anything else           -> 500 INTERNAL_ERROR.
 * Internal details (stack traces, SQL, constraint names) are only logged on the
 * server, never sent to the browser.
 */
import type { NextFunction, Request, Response } from "express";
import { mapDbError } from "../db/db-errors.ts";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";

/** 404 ROUTE_NOT_FOUND for any path no router handled. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "ROUTE_NOT_FOUND", `No endpoint ${req.method} ${req.path}`));
}

/** Errors thrown by body-parser and multer carry these fields. */
type FrameworkError = { type?: string; name?: string; code?: string; message?: string; stack?: string };

function frameworkError(err: FrameworkError): AppError | null {
  if (err.type === "entity.parse.failed") return new AppError(400, "INVALID_JSON", "The request body is not valid JSON");
  if (err.type === "entity.too.large") return new AppError(413, "PAYLOAD_TOO_LARGE", "The request is too large");
  if (err.name === "MulterError") return new AppError(400, "UPLOAD_ERROR", "The upload was rejected", { reason: err.code });
  return null;
}

/** Express error middleware: converts any error into the standard JSON error response. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const fe = (err && typeof err === "object" ? err : {}) as FrameworkError;
  let appError = mapDbError(err) ?? frameworkError(fe);
  if (appError?.details?.constraint) {
    // Database rule names are internal: log them, but do not send them to the client.
    logger.warn("database rule rejected a request", { method: req.method, path: req.path, code: appError.code, constraint: appError.details.constraint });
    appError = new AppError(appError.status, appError.code, appError.message);
  }
  if (!appError) {
    logger.error("Unhandled error", { method: req.method, path: req.path, error: fe.stack ?? String(err) });
    appError = new AppError(500, "INTERNAL_ERROR", "Something went wrong on the server");
  }
  const body: Record<string, unknown> = { code: appError.code, message: appError.message };
  if (appError.details) body.details = appError.details;
  res.status(appError.status).json({ error: body });
}
