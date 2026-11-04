/**
 * Asks for the Supabase database password in the terminal (typing is hidden)
 * and writes MIGRATE_DATABASE_URL for the main project's owner into backend/.env.
 *
 * - The password is never printed and never leaves this computer except when
 *   the Prisma CLI or our scripts connect to Supabase.
 * - Special characters in the password are URL-encoded automatically.
 * - backend/.env is ignored by git.
 *
 * Usage (in your own terminal):  cd backend  then  npm run db:supabase-login
 * Exit code: 0 on success, 1 on error or empty password.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

// Main project "online exam platform" (not secret). See docs/database-environments.md.
const PROJECT_REF = "tzrhdwrswkfmqoriztrj";
const POOLER_HOST = "aws-1-eu-central-1.pooler.supabase.com";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(backendDir, ".env");

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (text) => { if (!muted) write(text); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
    muted = true;
  });
}

// Strip an invisible byte-order mark or carriage return that some terminals add.
const password = (await askHidden(`Supabase database password for project ${PROJECT_REF} (typing is hidden): `))
  .replace(/^﻿/, "").replace(/\r$/, "");
if (!password) {
  console.error("No password entered. Nothing was changed.");
  process.exit(1);
}

// sslcert/sslaccept: Prisma verifies the server against Supabase's root CA
// (path relative to backend/). connect_timeout: the handshake can take > 5 s.
const url = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@${POOLER_HOST}:5432/postgres?sslmode=require&sslcert=certs/supabase-ca-2021.crt&sslaccept=strict&connect_timeout=30`;
const line = `MIGRATE_DATABASE_URL="${url}"`;
let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
text = /^MIGRATE_DATABASE_URL=.*$/m.test(text) ? text.replace(/^MIGRATE_DATABASE_URL=.*$/m, line) : `${text.trimEnd()}\n${line}\n`;
fs.writeFileSync(envFile, text);
console.log(`Saved MIGRATE_DATABASE_URL in backend/.env (user postgres.${PROJECT_REF} at ${POOLER_HOST}:5432, password hidden).`);
