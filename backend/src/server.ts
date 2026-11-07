/**
 * Starts the API server: checks the settings, connects to the database,
 * measures the database clock, starts the background jobs and listens on PORT.
 *
 * Run with `npm run dev` (reloads on change) or `npm run build && npm start`.
 * Stops cleanly on Ctrl+C (SIGINT) or SIGTERM.
 */
import { createApp } from "./app.ts";
import { env } from "./config/env.ts";
import { syncClock } from "./db/clock.ts";
import { disconnectDatabase } from "./db/prisma.ts";
import { startJobs } from "./jobs/scheduler.ts";
import { logger } from "./lib/logger.ts";

async function main() {
  const offset = await syncClock();
  logger.info("database connected", { clockOffsetMs: Math.round(offset) });

  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info("API listening", { url: `http://localhost:${env.PORT}/api` }));
  // The frontend forwards /api through a keep-alive connection pool. Node closes idle
  // connections after 5 s by default, so a forwarded request could land on a socket
  // that was just closing (ECONNRESET, shown to the user as a 500). Idle connections
  // now stay open longer than the proxy keeps them; headersTimeout must be larger.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  const stopJobs = env.JOBS_ENABLED ? startJobs(env.JOB_INTERVAL_MS) : () => {};

  const shutdown = (signal: string) => {
    logger.info("shutting down", { signal });
    stopJobs();
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error("startup failed", { error: error instanceof Error ? error.message : String(error) });
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
