/**
 * Runs once before the whole test suite.
 *
 * 1. Checks the test settings (see helpers/env.mjs). In Supabase mode it also
 *    checks the test project's marker table before anything is deleted.
 * 2. Local mode only: creates the test database if it does not exist yet.
 * 3. Removes the application's own objects from the "public" schema: tables,
 *    enum types and oe_* trigger functions owned by the test user, including
 *    Prisma's migration history. The schema itself and anything owned by
 *    others (e.g. Supabase's own settings) are left alone.
 * 4. Applies every Prisma migration (prisma migrate deploy).
 * 5. Inserts the four official roles (reference data the tests build on).
 *
 * Every run therefore starts from a freshly migrated database. Development
 * and production data are never touched.
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

/** Supabase mode: the marker table must exist and name this project. */
async function assertSupabaseTestMarker(client, supabaseRef) {
  let rows;
  try {
    ({ rows } = await client.query(`SELECT project_ref FROM test_guard.marker`));
  } catch (error) {
    if (error.code === "42P01" || error.code === "3F000") {
      throw new Error(
        "Refusing to run: this Supabase database has no test_guard.marker table, so it is not the dedicated test project. " +
          "See docs/testing.md for the one-time marker setup.",
      );
    }
    throw error;
  }
  if (rows.length !== 1 || rows[0].project_ref !== supabaseRef) {
    throw new Error("Refusing to run: test_guard.marker does not name the project in TEST_SUPABASE_PROJECT_REF.");
  }
}

/** Drops the application's tables, enum types and trigger functions owned by the test user. */
const RESET_APP_OBJECTS = `
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables
            WHERE schemaname = 'public' AND tableowner = current_user LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'public' AND t.typtype = 'e' AND pg_get_userbyid(t.typowner) = current_user LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'oe\\_%' AND pg_get_userbyid(p.proowner) = current_user LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.signature || ' CASCADE';
  END LOOP;
END $$;`;

export default async function setup() {
  const { url, dbName, mode, supabaseRef } = loadTestEnv();
  if (mode === "local") await ensureDatabaseExists(url, dbName);

  const client = new pg.Client({ connectionString: pgConnectionString(url) });
  await client.connect();
  try {
    if (mode === "supabase") await assertSupabaseTestMarker(client, supabaseRef);
    await client.query(RESET_APP_OBJECTS);
    const leftover = await client.query(`SELECT string_agg(tablename, ', ') AS names FROM pg_tables WHERE schemaname = 'public'`);
    if (leftover.rows[0].names) {
      throw new Error(
        `The test database still has tables in "public" that the test user does not own: ${leftover.rows[0].names}. ` +
          "Use a fresh test database owned by the test user (see docs/testing.md).",
      );
    }
  } finally {
    await client.end();
  }

  try {
    execSync("npx prisma migrate deploy", {
      cwd: backendDir,
      env: { ...process.env, MIGRATE_DATABASE_URL: url },
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
