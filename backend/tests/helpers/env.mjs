/**
 * Test environment loading and safety checks.
 *
 * The test suite deletes and rebuilds the application's objects in its
 * database on every run, so it must never point at real data. There are two
 * modes, and each refuses to start unless its rules are met.
 *
 * Local mode (npm test, file backend/.env.test) - the default:
 *   - the database name must end with "_test";
 *   - the host must not be a Supabase host;
 *   - TEST_SUPABASE_PROJECT_REF must not be set.
 *
 * Supabase mode (npm run test:supabase, file backend/.env.supabase-test):
 *   - TEST_SUPABASE_PROJECT_REF must be set and appear in TEST_DATABASE_URL;
 *   - the database must contain the marker table test_guard.marker holding
 *     that same project ref (checked in global-setup before anything is
 *     deleted). Only the dedicated test project has this marker.
 *
 * In both modes the test database must differ from DATABASE_URL and
 * MIGRATE_DATABASE_URL in backend/.env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SUPABASE_ENV_FILE = ".env.supabase-test";

/** Returns "host:port/database" so two URLs can be compared. */
function databaseKey(url) {
  const u = new URL(url);
  return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
}

/**
 * Loads the test env file (values already set in the shell win) and validates it.
 * @returns {{ url: string, dbName: string, mode: "local" | "supabase", supabaseRef: string | null }}
 * @throws {Error} when the settings are missing or could point at non-test data.
 */
export function loadTestEnv() {
  const envFile = process.env.TEST_ENV_FILE || ".env.test";
  const mode = envFile === SUPABASE_ENV_FILE ? "supabase" : "local";
  dotenv.config({ path: path.join(backendDir, envFile) });

  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      `TEST_DATABASE_URL is not set. Copy backend/${envFile}.example to backend/${envFile} ` +
        "and point it at a dedicated test database (see docs/testing.md).",
    );
  }

  const parsed = new URL(url);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const supabaseRef = process.env.TEST_SUPABASE_PROJECT_REF?.trim() || null;
  const isSupabaseHost = parsed.hostname.toLowerCase().includes("supabase");

  if (mode === "supabase") {
    if (!supabaseRef || !/^[a-z0-9]+$/.test(supabaseRef)) {
      throw new Error(`Refusing to run: set TEST_SUPABASE_PROJECT_REF in backend/${SUPABASE_ENV_FILE} to the TEST project's ref.`);
    }
    if (!url.includes(supabaseRef)) {
      throw new Error("Refusing to run: TEST_DATABASE_URL does not belong to the Supabase project named in TEST_SUPABASE_PROJECT_REF.");
    }
  } else {
    if (supabaseRef) {
      throw new Error(`Refusing to run: TEST_SUPABASE_PROJECT_REF belongs only in backend/${SUPABASE_ENV_FILE} (npm run test:supabase).`);
    }
    if (isSupabaseHost) {
      throw new Error("Refusing to run: npm test only runs against local PostgreSQL. Use npm run test:supabase for the Supabase test project.");
    }
    if (!dbName.endsWith("_test")) {
      throw new Error(
        `Refusing to run tests: the test database "${dbName}" must have a name ending in "_test". ` +
          "The test run deletes the application's tables in that database.",
      );
    }
  }

  const devEnvFile = path.join(backendDir, ".env");
  if (fs.existsSync(devEnvFile)) {
    const devEnv = dotenv.parse(fs.readFileSync(devEnvFile));
    for (const name of ["DATABASE_URL", "MIGRATE_DATABASE_URL"]) {
      const devUrl = devEnv[name];
      if (devUrl && databaseKey(devUrl) === databaseKey(url)) {
        throw new Error(`Refusing to run tests: TEST_DATABASE_URL is the same database as ${name} in backend/.env.`);
      }
    }
  }

  return { url, dbName, mode, supabaseRef };
}

/** Connection string for the pg driver (drops Prisma's ?schema= parameter). */
export function pgConnectionString(url = process.env.TEST_DATABASE_URL) {
  const u = new URL(url);
  u.searchParams.delete("schema");
  return u.toString();
}
