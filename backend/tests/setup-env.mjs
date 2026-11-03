// Runs in every test worker before the test files: loads and validates the test database URL.
import { loadTestEnv } from "./helpers/env.mjs";

loadTestEnv();
