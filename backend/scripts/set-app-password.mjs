/**
 * Enables login for the exam_app role with a new random password, and writes
 * the matching DATABASE_URL into backend/.env.
 *
 * - Connects as the owner (MIGRATE_DATABASE_URL).
 * - The password is turned into a SCRAM-SHA-256 verifier on this computer, so the
 *   plain password is never sent to the database server (or its logs).
 * - DATABASE_URL reuses the owner URL's host, port, database and parameters.
 *   On the Supabase pooler the user becomes exam_app.<project-ref>.
 * - Nothing secret is printed.
 *
 * Usage: npm run db:app-password
 * Exit code: 0 on success, 1 on error.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { pgClientConfig } from "./lib/pg-connection.mjs";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(backendDir, ".env");
dotenv.config({ path: envFile });

/** PostgreSQL SCRAM-SHA-256 verifier for `password` (RFC 7677). */
function scramVerifier(password, iterations = 4096) {
  const salt = crypto.randomBytes(16);
  const salted = crypto.pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const hmac = (key, text) => crypto.createHmac("sha256", key).update(text).digest();
  const storedKey = crypto.createHash("sha256").update(hmac(salted, "Client Key")).digest();
  const serverKey = hmac(salted, "Server Key");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

async function main() {
  const ownerUrl = process.env.MIGRATE_DATABASE_URL;
  if (!ownerUrl) throw new Error("MIGRATE_DATABASE_URL (owner) is not set in backend/.env or the shell.");
  const owner = new URL(ownerUrl);

  const appUrl = new URL(ownerUrl);
  const ownerUser = decodeURIComponent(owner.username);
  const projectRef = ownerUser.includes(".") ? ownerUser.split(".").slice(1).join(".") : null;
  appUrl.username = projectRef ? `exam_app.${projectRef}` : "exam_app";
  const password = crypto.randomBytes(24).toString("base64url");
  appUrl.password = password;

  const client = new pg.Client(pgClientConfig(ownerUrl));
  await client.connect();
  try {
    const role = (await client.query(`SELECT rolname FROM pg_roles WHERE rolname = 'exam_app'`)).rows[0];
    if (!role) throw new Error("The exam_app role does not exist yet. Apply the migrations first.");
    await client.query(`ALTER ROLE exam_app WITH LOGIN PASSWORD '${scramVerifier(password)}'`);
  } finally {
    await client.end();
  }

  const line = `DATABASE_URL="${appUrl.toString()}"`;
  let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  text = /^DATABASE_URL=.*$/m.test(text) ? text.replace(/^DATABASE_URL=.*$/m, line) : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(envFile, text);
  console.log(`exam_app login enabled. DATABASE_URL in backend/.env now uses user "${appUrl.username}" at ${appUrl.hostname}:${appUrl.port || 5432} (password not shown).`);
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
