/**
 * Authentication endpoints (/api/auth). See docs/api.md#authentication.
 *
 * POST  /api/auth/login            log in; sets the HTTP-only session cookie
 * POST  /api/auth/logout           clears the session cookie
 * GET   /api/auth/me               the logged-in user's profile
 * POST  /api/auth/change-password  change password (also ends other sessions)
 * PATCH /api/auth/language         switch between Somali and English
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser } from "../../middleware/auth.ts";
import { loginLimiter } from "../../middleware/rate-limits.ts";
import { validate } from "../../middleware/validate.ts";
import { passwordRule } from "../../lib/passwords.ts";
import { clearSession, issueSession } from "../../lib/session-token.ts";
import * as auth from "./auth.service.ts";

export const authRouter = Router();

const loginBody = z.object({
  identifier: z.string().trim().min(1, "is required").max(200),
  password: z.string().min(1, "is required").max(200),
});

/** Request: { identifier, password }. Response 200: { user: Profile }. Errors: 401 INVALID_CREDENTIALS, 401 TEMP_PASSWORD_EXPIRED, 429 RATE_LIMITED. */
authRouter.post("/login", loginLimiter, validate({ body: loginBody }), async (req, res) => {
  const { identifier, password } = req.valid.body;
  const { profile, tokenVersion } = await auth.login(identifier, password, req);
  issueSession(res, profile.id, tokenVersion);
  res.json({ user: profile });
});

/** Response 204. Always succeeds, even without a session. */
authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

/** Response 200: { user: Profile }. Works while a temporary password must still be changed. */
authRouter.get("/me", authenticate({ allowPasswordChange: true }), async (req, res) => {
  res.json({ user: await auth.getProfile(currentUser(req).id) });
});

const changeBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordRule });

/** Request: { currentPassword, newPassword }. Response 200: { user }. Issues a new session cookie. */
authRouter.post("/change-password", authenticate({ allowPasswordChange: true }), validate({ body: changeBody }), async (req, res) => {
  const user = currentUser(req);
  const version = await auth.changePassword(user.id, req.valid.body.currentPassword, req.valid.body.newPassword, req);
  issueSession(res, user.id, version);
  res.json({ user: await auth.getProfile(user.id) });
});

/** Request: { language: "so" | "en" }. Response 200: { user }. */
authRouter.patch("/language", authenticate({ allowPasswordChange: true }), validate({ body: z.object({ language: z.enum(["so", "en"]) }) }), async (req, res) => {
  res.json({ user: await auth.setLanguage(currentUser(req).id, req.valid.body.language) });
});
