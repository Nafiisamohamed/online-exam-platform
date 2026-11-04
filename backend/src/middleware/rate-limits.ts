/**
 * Rate limiting (baseline 6.6: rate limiting on the network API).
 *
 * - apiLimiter:   every /api request: per session and per IP address (below).
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
import { createHash } from "node:crypto";
import { env } from "../config/env.ts";
import { SESSION_COOKIE } from "../lib/session-token.ts";

const skip = () => env.isTest && process.env.RATE_LIMITS_IN_TESTS !== "1";

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? "");

function handler(_req: Request, res: Response) {
  res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please wait and try again." } });
}


/**
 * General API limits, in two layers:
 * - per session (the login cookie, hashed): 300 requests a minute, far above
 *   what one exam screen needs (autosave plus a heartbeat every 5 seconds);
 * - per IP address: 3000 a minute. Higher, because an exam room behind one
 *   router (NAT) may show all of its students under a single address.
 */
const sessionKey = (req: Request) => {
  const cookie = req.cookies?.[SESSION_COOKIE];
  return cookie ? createHash("sha256").update(cookie).digest("base64url") : "";
};

const apiSessionLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => skip() || !sessionKey(req),
  handler,
  keyGenerator: sessionKey,
});

const apiIpLimiter = rateLimit({
  windowMs: 60_000,
  limit: 3000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  handler,
  keyGenerator: ipKey,
});

export const apiLimiter = [apiIpLimiter, apiSessionLimiter];

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
