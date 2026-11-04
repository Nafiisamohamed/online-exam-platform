/**
 * Throwaway PostgreSQL 17 for the automated tests, so `npm test` works on a
 * fresh computer and in CI with one command: no Docker and no PostgreSQL
 * installation. The `embedded-postgres` npm package (dev dependency) ships the
 * official PostgreSQL binaries for Windows, macOS and Linux.
 *
 * Used only when no test database is configured (no TEST_DATABASE_URL in the
 * shell and no backend/.env.test). It then:
 * - keeps its data in backend/.test-db/ (ignored by git);
 * - listens on localhost:54329 only;
 * - creates the non-superuser owner role exam_owner and the database
 *   online_exam_test, as documented for a manual local setup;
 * - is stopped again when the test run ends.
 * The test-only password below protects nothing: the server accepts local
 * connections only and holds nothing but test data.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";

export const EMBEDDED_PORT = 54329;
const PASSWORD = "test_only";
export const EMBEDDED_TEST_URL = `postgresql://exam_owner:${PASSWORD}@localhost:${EMBEDDED_PORT}/online_exam_test?schema=public`;

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

/**
 * Starts the embedded server (or reuses one already listening on the port).
 * @param {string} backendDir
 * @returns {Promise<() => Promise<void>>} stop function
 */
export async function startEmbeddedPostgres(backendDir) {
  if (await portInUse(EMBEDDED_PORT)) return async () => {};

  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const databaseDir = path.join(backendDir, ".test-db");
  const server = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: PASSWORD,
    port: EMBEDDED_PORT,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });
  if (!fs.existsSync(path.join(databaseDir, "PG_VERSION"))) await server.initialise();
  await server.start();

  const admin = new pg.Client({ connectionString: `postgresql://postgres:${PASSWORD}@localhost:${EMBEDDED_PORT}/postgres` });
  await admin.connect();
  try {
    const role = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = 'exam_owner'`);
    if (role.rowCount === 0) {
      await admin.query(`CREATE ROLE exam_owner LOGIN PASSWORD '${PASSWORD}' NOSUPERUSER CREATEROLE NOCREATEDB`);
    }
    const db = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'online_exam_test'`);
    if (db.rowCount === 0) await admin.query(`CREATE DATABASE online_exam_test OWNER exam_owner`);
  } finally {
    await admin.end();
  }
  return async () => {
    await server.stop();
  };
}
