// Verification mode (npm run verify:db): point the tests at the migrated database
// in MIGRATE_DATABASE_URL (the owner), without any reset. Every test writes only
// inside transactions that are rolled back.
import { loadVerifyEnv } from "./helpers/verify-env.mjs";

loadVerifyEnv();
