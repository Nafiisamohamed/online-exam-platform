/**
 * Settings for verification mode (npm run verify:db).
 *
 * Verification mode checks an already-migrated database (local or Supabase,
 * including the main project) WITHOUT changing it:
 *   - no reset and no migrations (see verify-global-setup.mjs);
 *   - every test writes only inside a transaction that is rolled back;
 *   - tests that must commit rows are skipped (TEST_VERIFY_MODE).
 *
 * It connects with MIGRATE_DATABASE_URL (the owner), because some tests switch to
 * the exam_app role or briefly switch off a trigger inside a rolled-back transaction.
 */
import path from "node:path";
import dotenv from "dotenv";
import { backendDir } from "./env.mjs";

export function loadVerifyEnv() {
  dotenv.config({ path: path.join(backendDir, ".env") });
  const url = process.env.MIGRATE_DATABASE_URL;
  if (!url) throw new Error("Verification mode needs MIGRATE_DATABASE_URL (the owner) in backend/.env or the shell.");
  process.env.TEST_DATABASE_URL = url;
  process.env.TEST_VERIFY_MODE = "1";
  if (new URL(url).hostname.toLowerCase().includes("supabase")) process.env.TEST_EXPECT_SUPABASE_ROLES = "1";
  return { url };
}
