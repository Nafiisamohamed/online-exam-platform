/**
 * Logs one line per request: method, path, status, duration and user id.
 * Bodies and query strings are never logged (they can hold passwords or PINs).
 */
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.ts";

/** Express middleware: logs the request when the response has been sent. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger.info("request", { method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms), user: req.user?.id });
  });
  next();
}
