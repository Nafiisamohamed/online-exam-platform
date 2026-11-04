// Runs in every test worker before the test files:
// 1. loads and validates the test database URL (helpers/env.mjs);
// 2. sets the API's own settings for the API tests. The API connects to the
//    TEST database, switched to the restricted exam_app role on every
//    connection ("options=-c role=exam_app"), so API tests run with exactly
//    the application's database permissions. These values are set before the
//    API code loads, so backend/.env (the real database) is never used.
import { loadTestEnv } from "./helpers/env.mjs";

const { url } = loadTestEnv();

const appUrl = new URL(url);
appUrl.searchParams.set("options", "-c role=exam_app");

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: appUrl.toString(),
  JWT_SECRET: "test-only-jwt-secret-0123456789-abcdefghij",
  DEMO_PAYMENT_PIN: "1234",
  BCRYPT_ROUNDS: "10",
  JOBS_ENABLED: "false",
  COOKIE_SECURE: "false",
  CORS_ORIGIN: "http://localhost:3000",
  UPLOAD_DIR: ".test-uploads",
});
