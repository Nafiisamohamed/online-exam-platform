/**
 * Runs a Prisma command only when MIGRATE_DATABASE_URL points at a local
 * PostgreSQL server (localhost, 127.0.0.1 or ::1).
 *
 * Used by `npm run db:migrate:dev`, because `prisma migrate dev` creates
 * migrations and may offer to reset (wipe) the database. It must never reach
 * Supabase or any other remote database.
 *
 * Usage: node scripts/require-local-db.mjs <prisma arguments...>
 *   e.g. node scripts/require-local-db.mjs migrate dev --name add_x
 * Exit code: the Prisma command's exit code, or 1 when refused.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendDir, ".env") }); // values set in the shell win

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function refuse(reason) {
  console.error(`Refusing to run "prisma ${process.argv.slice(2).join(" ")}": ${reason}`);
  process.exit(1);
}

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) refuse("MIGRATE_DATABASE_URL is not set (see backend/.env.example).");

let host;
try {
  host = new URL(url).hostname.toLowerCase();
} catch {
  refuse("MIGRATE_DATABASE_URL is not a valid URL.");
}
if (!LOCAL_HOSTS.has(host)) {
  refuse(`MIGRATE_DATABASE_URL points at "${host}". This command only runs against local PostgreSQL (localhost).`);
}

const args = process.argv.slice(2);
if (args.length === 0) refuse("no Prisma command given.");

const result = spawnSync("npx", ["prisma", ...args], { cwd: backendDir, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
