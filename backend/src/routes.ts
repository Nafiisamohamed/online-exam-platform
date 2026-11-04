/**
 * Mounts every module's router under /api. The full endpoint list with
 * requests and responses is in docs/api.md.
 */
import { Router } from "express";
import { prisma } from "./db/prisma.ts";
import { now } from "./db/clock.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";

export const apiRouter = Router();

/**
 * GET /api/health - no login needed.
 * Response 200: { status: "ok", database: "ok", serverTime } or 503 when the database is unreachable.
 * serverTime lets the frontend show the server clock (4.7).
 */
apiRouter.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "ok", serverTime: now().toISOString() });
  } catch {
    res.status(503).json({ status: "error", database: "unreachable", serverTime: now().toISOString() });
  }
});

apiRouter.use("/auth", authRouter);
