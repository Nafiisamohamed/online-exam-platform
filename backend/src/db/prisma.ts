/**
 * Data access layer: the single Prisma Client used by every service.
 *
 * Connects with DATABASE_URL (the restricted exam_app role) through the
 * node-postgres driver adapter. The pg settings come from the shared helper
 * scripts/lib/pg-connection.mjs, which verifies Supabase's TLS certificate
 * against the bundled Supabase root CA and removes Prisma-CLI-only URL
 * parameters.
 *
 * Every database session is set to UTC when it opens. Prisma's pg adapter
 * sends and reads timestamps as UTC without a time-zone offset, so a server
 * running in local time (for example a campus server set to Africa/Mogadishu)
 * would otherwise shift every deadline by hours. Supabase already uses UTC.
 *
 * Route handlers never use this client directly; only services do.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "../config/env.ts";
import { PrismaClient } from "../generated/prisma/client.ts";
import { pgClientConfig } from "../../scripts/lib/pg-connection.mjs";

export { Prisma } from "../generated/prisma/client.ts";
export type { PrismaClient } from "../generated/prisma/client.ts";

/**
 * A pg client that switches its session to UTC as part of connecting, before
 * the pool hands it out. (A startup "options" parameter would be simpler, but
 * the Supabase pooler silently ignores it.)
 */
class UtcClient extends pg.Client {
  override connect(): Promise<pg.Client>;
  override connect(callback: (err: Error | null, c?: pg.Client) => void): void;
  override connect(callback?: (err: Error | null, c?: pg.Client) => void): Promise<pg.Client> | void {
    const ready = super.connect().then(async () => {
      await this.query("SET TIME ZONE 'UTC'");
      return this as pg.Client;
    });
    if (!callback) return ready;
    ready.then((c) => callback(null, c), (err: Error) => callback(err));
  }
}

const pool = new pg.Pool({ ...pgClientConfig(env.DATABASE_URL), max: 10, Client: UtcClient as unknown as typeof pg.Client });

export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** The client type inside an interactive transaction. */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
/** Either the main client or a transaction client. */
export type Db = typeof prisma | Tx;

/**
 * Runs `fn` in one database transaction with limits suited to a remote
 * database (Supabase adds network latency to every statement).
 */
export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 15_000, timeout: 30_000 });
}

/** True when the database answers a trivial query (health check). */
export async function databaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Closes the connection pool (on shutdown). */
export function disconnectDatabase(): Promise<void> {
  return prisma.$disconnect();
}
