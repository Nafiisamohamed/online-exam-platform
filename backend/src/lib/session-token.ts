/**
 * Login session tokens: a signed JWT stored in an HTTP-only cookie.
 *
 * The token holds the user id and their token_version. Every request reloads
 * the user and compares the version, so changing a password, resetting it or
 * deactivating the account ends all existing sessions immediately.
 *
 * Cookie: HttpOnly (JavaScript cannot read it), SameSite=Strict (not sent by
 * other sites, which blocks CSRF), Secure when COOKIE_SECURE is true.
 */
import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.ts";

export const SESSION_COOKIE = "oe_session";

export interface SessionClaims {
  sub: string;
  ver: number;
}

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

function maxAgeMs(): number {
  const m = /^(\d+)([smhd])$/.exec(env.JWT_EXPIRES_IN)!;
  return Number(m[1]) * UNIT_MS[m[2]];
}

function cookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: "strict", secure: env.COOKIE_SECURE, path: "/" };
}

/** Signs a token for the user and sets the session cookie. */
export function issueSession(res: Response, userId: string, tokenVersion: number) {
  const token = jwt.sign({ ver: tokenVersion }, env.JWT_SECRET, {
    subject: userId,
    algorithm: "HS256",
    expiresIn: Math.floor(maxAgeMs() / 1000),
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: maxAgeMs() });
}

/** Removes the session cookie (logout). */
export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** Returns the claims of a valid token, or null for a missing, expired or forged one. */
export function readSession(token: string | undefined): SessionClaims | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if (typeof payload.sub !== "string" || typeof payload.ver !== "number") return null;
    return { sub: payload.sub, ver: payload.ver };
  } catch {
    return null;
  }
}
