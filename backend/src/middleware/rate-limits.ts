/**
 * Rate limiting (baseline 6.6: rate limiting on the network API).
 *
 * - apiLimiter:   every /api request, generous enough for exam autosave and
 *                 heartbeats (one student sends roughly 30 requests a minute).
 * - loginLimiter: 10 attempts per 15 minutes per IP address and login name.
 * - pinLimiter:   10 demo-PIN tries per 15 minutes per user (the payment itself
 *                 fails after 3 wrong PINs).
 *
 * Exceeded limits return 429 RATE_LIMITED with the usual error shape.
 * Limits are switched off in automated tests (NODE_ENV=test), except where a
 * test enables them explicitly with RATE_LIMITS_IN_TESTS=1.
 */
import type { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.ts";

const skip = () => env.isTest && process.env.RATE_LIMITS_IN_TESTS !== "1";

function handler(_req: Request, res: Response) {
  res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please wait and try again." } });
}

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? "");

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  handler,
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  handler,
  keyGenerator: (req) => `${ipKey(req)}|${String(req.body?.identifier ?? "").trim().toLowerCase()}`,
});

export const pinLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  handler,
  keyGenerator: (req) => req.user?.id ?? ipKey(req),
});
