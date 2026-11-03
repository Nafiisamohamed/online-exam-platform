/**
 * Database helpers for the test suite.
 *
 * Isolation model
 * - useRollbackDb() opens one connection and one transaction for a describe
 *   block, and rolls it back afterwards. Each test runs inside a savepoint that
 *   is rolled back after the test, so tests never see each other's rows and can
 *   run in any order.
 * - Tests that need two connections (lock visibility, concurrent edits) use
 *   connect() directly and commit their own rows. Those rows are removed when
 *   the next run rebuilds the test database.
 */
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";
import { pgConnectionString } from "./env.mjs";

/** A minimal query interface used by the fixture builders. */
export function wrap(client) {
  return {
    client,
    q: (sql, params) => client.query(sql, params),
    one: async (sql, params) => (await client.query(sql, params)).rows[0],
  };
}

/** Opens a new connection to the test database. Caller must end() it. */
export async function connect() {
  const client = new pg.Client({ connectionString: pgConnectionString() });
  await client.connect();
  return client;
}

/**
 * Registers hooks on the current describe block: one rolled-back transaction
 * for the block, one rolled-back savepoint per test.
 * @returns {{ client: pg.Client, q: Function, one: Function }} filled in before the first test.
 */
export function useRollbackDb() {
  // `rollbackOnly` marks connections whose work is always rolled back; helpers
  // that must never commit (e.g. createExpiredPayment) require it.
  const db = { client: null, q: null, one: null, rollbackOnly: true };
  beforeAll(async () => {
    Object.assign(db, wrap(await connect()));
    await db.q("BEGIN");
  });
  afterAll(async () => {
    if (!db.client) return;
    await db.q("ROLLBACK");
    await db.client.end();
  });
  beforeEach(async () => {
    await db.q("SAVEPOINT test_case");
  });
  afterEach(async () => {
    await db.q("ROLLBACK TO SAVEPOINT test_case");
  });
  return db;
}

/**
 * Asserts that fn() is rejected by the database, then undoes the failed
 * statement so the test can continue.
 * @param db       object from useRollbackDb() or wrap()
 * @param fn       async function running the statement(s) expected to fail
 * @param expected SQLSTATE code (e.g. "22P02"), trigger message code
 *                 (e.g. "PAYMENT_EXPIRED") or constraint name (e.g. "payments_receipt_chk")
 */
export async function expectDbError(db, fn, expected) {
  await db.q("SAVEPOINT expect_error");
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await db.q("ROLLBACK TO SAVEPOINT expect_error");
  expect(error, `expected the database to reject this with ${expected}, but it was allowed`).not.toBeNull();
  const matched = error.code === expected || error.message === expected || error.constraint === expected;
  expect(matched, `expected ${expected}, got [${error.code}] ${error.message}`).toBe(true);
}
