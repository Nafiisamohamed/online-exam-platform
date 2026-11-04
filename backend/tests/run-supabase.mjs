// `npm run test:supabase`: runs the whole suite against the dedicated Supabase
// TEST project configured in backend/.env.supabase-test. All safety checks in
// helpers/env.mjs and global-setup.mjs still apply.
import { spawnSync } from "node:child_process";
import { backendDir, SUPABASE_ENV_FILE } from "./helpers/env.mjs";

const result = spawnSync("npx vitest run", {
  cwd: backendDir,
  shell: true,
  stdio: "inherit",
  env: { ...process.env, TEST_ENV_FILE: SUPABASE_ENV_FILE },
});
process.exit(result.status ?? 1);
