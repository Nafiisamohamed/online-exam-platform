/**
 * Test environment loading and safety checks.
 *
 * The test suite wipes and rebuilds its database on every run, so it must never
 * point at development data. loadTestEnv() refuses to continue unless:
 *   - TEST_DATABASE_URL is set (from the shell or backend/.env.test),
 *   - the database name ends with "_test",
 *   - it is not the same database as DATABASE_URL in backend/.env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Returns "host:port/database" so two URLs can be compared. */
function databaseKey(url) {
  const u = new URL(url);
  return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
}

/**
 * Loads backend/.env.test (values already set in the shell win) and validates it.
 * @returns {{ url: string, dbName: string }}
 * @throws {Error} when the URL is missing or could point at non-test data.
 */
export function loadTestEnv() {
  dotenv.config({ path: path.join(backendDir, ".env.test") });

  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Copy backend/.env.test.example to backend/.env.test " +
        "and point it at a dedicated test database (see docs/testing.md).",
    );
  }

  const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests: the test database "${dbName}" must have a name ending in "_test". ` +
        "The test run deletes everything in that database.",
    );
  }

  const devEnvFile = path.join(backendDir, ".env");
  if (fs.existsSync(devEnvFile)) {
    const devUrl = dotenv.parse(fs.readFileSync(devEnvFile)).DATABASE_URL;
    if (devUrl && databaseKey(devUrl) === databaseKey(url)) {
      throw new Error("Refusing to run tests: TEST_DATABASE_URL is the same database as DATABASE_URL in backend/.env.");
    }
  }

  return { url, dbName };
}

/** Connection string for the pg driver (drops Prisma's ?schema= parameter). */
export function pgConnectionString(url = process.env.TEST_DATABASE_URL) {
  const u = new URL(url);
  u.searchParams.delete("schema");
  return u.toString();
}
