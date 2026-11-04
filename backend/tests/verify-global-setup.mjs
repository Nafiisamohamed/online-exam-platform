/**
 * Verification mode: read-only checks before the tests run. Nothing is reset,
 * migrated or written here.
 *   - every migration in prisma/migrations is applied;
 *   - the four roles exist (the fixtures build on them).
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { backendDir, pgConfig } from "./helpers/env.mjs";
import { loadVerifyEnv } from "./helpers/verify-env.mjs";

export default async function setup() {
  const { url } = loadVerifyEnv();
  const client = new pg.Client(pgConfig(url));
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const folders = fs.readdirSync(path.join(backendDir, "prisma/migrations"), { withFileTypes: true }).filter((d) => d.isDirectory()).length;
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    if (rows[0].n !== folders) throw new Error(`Verification needs all ${folders} migrations applied; the database has ${rows[0].n}.`);
    const roles = await client.query(`SELECT count(*)::int AS n FROM roles WHERE name IN ('ADMIN', 'LECTURER', 'STUDENT', 'INVIGILATOR')`);
    if (roles.rows[0].n !== 4) throw new Error("Verification needs the four roles (run npm run db:seed:demo, or insert the roles).");
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}
