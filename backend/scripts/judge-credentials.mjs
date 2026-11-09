/**
 * Issues fresh demo passwords for the judges and writes them to a private,
 * git-ignored sheet (backend/judges-credentials.local.md). Run it on demo day;
 * run it again after judging to rotate the passwords, which ends every
 * session of these accounts.
 *
 * Accounts (one or more per role, enough for all five demo scenarios):
 *   ADMIN registrar, two LECTURERs (course lecturer and blind second grader),
 *   one INVIGILATOR, two STUDENTs (Demo 2 needs two students).
 *
 * Security:
 * - connects as exam_app (DATABASE_URL), one transaction;
 * - new random 14-character passwords, stored only as bcrypt hashes (cost 12);
 * - token_version + 1, so earlier sessions of these accounts stop working;
 * - an audit entry records that credentials were issued (never the passwords);
 * - passwords are written only to the sheet (file mode 600), never printed.
 * Share the sheet privately (printed, or a direct message), never in the
 * repository, README or a public channel.
 *
 * Usage: npm run demo:judge-credentials            issue / rotate
 *        npm run demo:judge-credentials -- --list  show which accounts, change nothing
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pg from "pg";
import { pgClientConfig } from "./lib/pg-connection.mjs";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendDir, ".env") });
const SHEET = process.env.JUDGE_SHEET_FILE || path.join(backendDir, "judges-credentials.local.md");

const ACCOUNTS = [
  { role: "ADMIN", login: "registrar@uni-demo.test", use: "Courses, CSV student import, schedule approval, SMS outbox, audit log" },
  { role: "LECTURER", login: "axmed.samatar@uni-demo.test", use: "CS201 question bank, CSV question import, exam builder, grading, results, analytics" },
  { role: "LECTURER", login: "mustafe.jibriil@uni-demo.test", use: "Blind second grader for CS201 essays; CS105 analytics" },
  { role: "INVIGILATOR", login: "cabdiraxmaan.faarax@uni-demo.test", use: "Live view, notes, time extensions" },
  { role: "STUDENT", login: "S-2026-001", use: "Student 1 (Demo 2, 3, 4, 5)" },
  { role: "STUDENT", login: "S-2026-002", use: "Student 2 (Demo 2: different question set)" },
];
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const newPassword = () => Array.from({ length: 14 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("") + crypto.randomInt(10);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (the exam_app connection) is not set.");
  const listOnly = process.argv.includes("--list");
  const client = new pg.Client(pgClientConfig(url));
  await client.connect();
  try {
    const found = [];
    for (const a of ACCOUNTS) {
      const col = a.login.includes("@") ? "email" : "username";
      const r = await client.query(`SELECT u.id, u.full_name, r.name AS role, u.is_active FROM users u JOIN roles r ON r.id = u.role_id WHERE u.${col} = $1`, [a.login]);
      if (!r.rows[0]) throw new Error(`Demo account ${a.login} not found. Run npm run db:seed:demo first.`);
      if (r.rows[0].role !== a.role || !r.rows[0].is_active) throw new Error(`Demo account ${a.login} is not an active ${a.role}.`);
      found.push({ ...a, id: r.rows[0].id, name: r.rows[0].full_name });
    }
    if (listOnly) {
      for (const a of found) console.log(`${a.role.padEnd(12)} ${a.login.padEnd(36)} ${a.name}`);
      return;
    }

    const issued = await Promise.all(found.map(async (a) => {
      const password = newPassword();
      return { ...a, password, hash: await bcrypt.hash(password, 12) };
    }));
    await client.query("BEGIN");
    for (const a of issued) {
      await client.query(
        `UPDATE users SET password_hash = $2, must_change_password = false, temp_password_expires_at = NULL, token_version = token_version + 1, updated_at = now() WHERE id = $1`,
        [a.id, a.hash],
      );
    }
    await client.query(
      `INSERT INTO audit_logs (actor_id, action_code, entity_type, details) VALUES (NULL, 'DEMO_CREDENTIALS_ISSUED', 'user', $1)`,
      [JSON.stringify({ accounts: issued.map((a) => a.login) })],
    );
    await client.query("COMMIT");

    const issuedAt = new Date().toISOString();
    const lines = [
      "# Online Exam Platform: judges' demo credentials",
      "",
      "**PRIVATE. Share only directly with the judges. Never commit, post or screenshot this file.**",
      "",
      `Issued: ${issuedAt}. These passwords stop working when the developer rotates them after judging.`,
      "",
      "| Role | Name | Login | Password | Use it for |",
      "|---|---|---|---|---|",
      ...issued.map((a) => `| ${a.role} | ${a.name} | \`${a.login}\` | \`${a.password}\` | ${a.use} |`),
      "",
      "- Staff log in with the email address, students with the student number.",
      "- Simulated payments (EVC Plus, Zaad, eDahab) accept only the DEMO PIN set in the server's DEMO_PAYMENT_PIN. Never enter a real PIN.",
      "- All payments and SMS messages are simulated; no money or messages leave the system.",
      "",
    ];
    fs.writeFileSync(SHEET, lines.join("\n"), { mode: 0o600 });
    console.log(`Issued new passwords for ${issued.length} demo accounts. Private sheet: ${SHEET}`);
    console.log("Earlier sessions of these accounts have ended. Run this again after judging to rotate the passwords.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Could not issue judge credentials; nothing was changed:", error.message);
  process.exit(1);
});
