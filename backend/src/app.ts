/**
 * Builds the Express application (without starting it), so tests can call it
 * directly with supertest.
 *
 * Layers (baseline 6.1):
 *   routes   (src/modules/<module>/<module>.routes.ts)  HTTP: validation, roles, response shape
 *   services (src/modules/<module>/<module>.service.ts) business rules
 *   data     (src/db/prisma.ts)                        Prisma Client, the only database access
 * Route handlers never query the database themselves.
 *
 * Security middleware: helmet headers, CORS limited to CORS_ORIGIN with
 * cookies, JSON bodies up to 1 MB, rate limiting on /api, and a final error
 * handler that never leaks stack traces.
 */
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { apiLimiter } from "./middleware/rate-limits.ts";
import { requestLogger } from "./middleware/request-log.ts";
import { apiRouter } from "./routes.ts";

/** Creates the configured Express app (security middleware, /api routes, error handling). Does not listen. */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY ? 1 : false);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(requestLogger);

  app.use("/api", apiLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
