/**
 * Server clock (section 4.7: the deadline uses the server's clock, never the
 * student's device).
 *
 * The database is the final judge of every deadline: the answers trigger
 * compares with PostgreSQL's clock_timestamp(). So that the API agrees with
 * it exactly, the API measures the difference between its own clock and the
 * database clock at startup and once a minute, and `now()` applies it.
 * Without a database (unit tests) the offset is simply 0.
 */
import type { Db } from "./prisma.ts";

let offsetMs = 0;

/** The current server time (database clock). */
export function now(): Date {
  return new Date(Date.now() + offsetMs);
}

/**
 * Measures the offset with one query. The round-trip time is split in half,
 * which is accurate to a few milliseconds on a campus network.
 */
export async function syncClock(db: Db): Promise<number> {
  const before = Date.now();
  // Epoch milliseconds, so the database time zone setting cannot affect the result.
  const rows = await db.$queryRaw<{ ms: number }[]>`SELECT (extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms`;
  const after = Date.now();
  offsetMs = Number(rows[0].ms) - (before + after) / 2;
  return offsetMs;
}
