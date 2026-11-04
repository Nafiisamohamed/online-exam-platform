/**
 * Authentication and role checks (baseline 6.2: permissions are checked on the
 * server for every request).
 *
 * - authenticate(): reads the session cookie, reloads the user and rejects
 *   missing/expired sessions (401 UNAUTHENTICATED), deactivated accounts and
 *   old tokens (401 SESSION_EXPIRED). Users who must change a temporary
 *   password can only reach routes marked allowPasswordChange
 *   (403 PASSWORD_CHANGE_REQUIRED).
 * - requireRole(...roles): 403 FORBIDDEN unless the user has one of the roles.
 *
 * Record-level checks (own course, own attempt, assigned session) are made in
 * the services, which return 404 so other users' records are not revealed.
 */
import type { NextFunction, Request, Response } from "express";
import { findSessionUser } from "../repositories/users.repository.ts";
import type { Language, RoleName } from "../generated/prisma/enums.ts";
import { forbidden, unauthorized } from "../lib/errors.ts";
import { readSession, SESSION_COOKIE } from "../lib/session-token.ts";

export interface AuthUser {
  id: string;
  role: RoleName;
  fullName: string;
  email: string | null;
  studentNumber: string | null;
  phone: string;
  preferredLanguage: Language;
  mustChangePassword: boolean;
  tokenVersion: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Loads the logged-in user, or throws 401. */
async function loadUser(req: Request): Promise<AuthUser> {
  const claims = readSession(req.cookies?.[SESSION_COOKIE]);
  if (!claims) throw unauthorized();
  const user = await findSessionUser(claims.sub);
  if (!user || !user.isActive || user.tokenVersion !== claims.ver) throw unauthorized("SESSION_EXPIRED", "Please log in again");
  const { role, isActive: _active, ...rest } = user;
  return { ...rest, role: role.name };
}

/** Requires a valid session. See the module comment for the options. */
export function authenticate(options: { allowPasswordChange?: boolean } = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const user = await loadUser(req);
    if (user.mustChangePassword && !options.allowPasswordChange) {
      throw forbidden("PASSWORD_CHANGE_REQUIRED", "Change your temporary password first");
    }
    req.user = user;
    next();
  };
}

/** Allows only the listed roles. Use after authenticate(). */
export function requireRole(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/** The logged-in user (only call after authenticate). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
