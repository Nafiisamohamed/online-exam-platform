/**
 * Runs once before the whole test suite.
 *
 * 1. Checks that TEST_DATABASE_URL points at a dedicated "_test" database.
 * 2. Creates that database if it does not exist yet.
 * 3. Deletes everything in its "public" schema.
 * 4. Applies every Prisma migration (prisma migrate deploy), so the tests run
 *    against exactly the schema, constraints and triggers that production uses.
 * 5. Inserts the four official roles (reference data the tests build on).
 *
 * Because the database is rebuilt on every run, the suite can be run any number
 * of times, and development data is never touched.
 */
import { execSync } from "node:child_process";
import pg from "pg";
import { backendDir, loadTestEnv, pgConnectionString } from "./helpers/env.mjs";

async function ensureDatabaseExists(url, dbName) {
  const probe = new pg.Client({ connectionString: pgConnectionString(url) });
  try {
    await probe.connect();
    await probe.end();
  } catch (error) {
    if (error.code !== "3D000") throw error; // 3D000 = database does not exist
    const adminUrl = new URL(pgConnectionString(url));
    adminUrl.pathname = "/postgres";
    const admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    await admin.end();
  }
}

export default async function setup() {
  const { url, dbName } = loadTestEnv();
  await ensureDatabaseExists(url, dbName);

  const client = new pg.Client({ connectionString: pgConnectionString(url) });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.end();

  try {
    execSync("npx prisma migrate deploy", {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
  } catch (error) {
    throw new Error("prisma migrate deploy failed on the test database:\n" + (error.stderr?.toString() || error.message));
  }

  const seed = new pg.Client({ connectionString: pgConnectionString(url) });
  await seed.connect();
  await seed.query(`INSERT INTO roles(name) VALUES ('ADMIN'), ('LECTURER'), ('STUDENT'), ('INVIGILATOR')`);
  await seed.end();
}
