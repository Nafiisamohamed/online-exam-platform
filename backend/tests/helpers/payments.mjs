/**
 * Helpers for the simulated payment flow. Each one runs the SQL that the
 * payment service will run for that step, so the tests exercise the same
 * database rules.
 */
import { createExamWorld, createUser } from "./fixtures.mjs";

/** An exam with a 5.00 USD fee. */
export async function createPaidExam(db) {
  return createExamWorld(db, { fee: 5 });
}

/** Columns every new payment needs. Extra columns and values can be appended. */
function insertSql(extraColumns = "", extraValues = "") {
  return `INSERT INTO payments (student_id, exam_id, provider, phone, amount, currency, merchant_name, merchant_number, idempotency_key${extraColumns})
          VALUES ($1, $2, 'EVC_PLUS', '+252615000000', 5, 'USD', 'Online Examination System', '000000', gen_random_uuid()${extraValues})
          RETURNING *`;
}

/** Step 2: the student picks a provider and sees the summary (PENDING_CONFIRMATION). */
export async function createPayment(db, examId, studentId) {
  const student = studentId ?? (await createUser(db, "STUDENT")).id;
  return db.one(insertSql(), [student, examId]);
}

/** Inserts with extra columns, for tests that try to bypass the flow. */
export function insertPaymentWith(db, examId, studentId, extraColumns, extraValues, params = []) {
  return db.one(insertSql(extraColumns, extraValues), [studentId, examId, ...params]);
}

/** Step 3b: the student presses Yes. */
export const pressYes = (db, id) => db.q(`UPDATE payments SET status = 'PENDING_PIN', confirmed_at = now() WHERE id = $1`, [id]);

/** A new payment that has reached PIN entry. */
export async function createPinStagePayment(db, examId) {
  const payment = await createPayment(db, examId);
  await pressYes(db, payment.id);
  return payment;
}

/** Sets the wrong-PIN counter directly (one wrong PIN = +1). */
export const setPinAttempts = (db, id, attempts) => db.q(`UPDATE payments SET pin_attempts = $2 WHERE id = $1`, [id, attempts]);

/** The third wrong PIN: counter 2 -> 3 and FAILED in one update. */
export const failAfterThirdPin = (db, id) =>
  db.q(`UPDATE payments SET pin_attempts = 3, status = 'FAILED', failure_reason = 'PIN_ATTEMPTS_EXCEEDED', completed_at = now() WHERE id = $1`, [id]);

/** Correct PIN: SUCCESS with a DEMO receipt. */
export const markSuccess = (db, id, receipt = "DEMO-EVC-20261103-7F3K9Q") =>
  db.q(`UPDATE payments SET status = 'SUCCESS', receipt_number = $2, completed_at = now() WHERE id = $1`, [id, receipt]);

/** Student presses No or cancels during PIN entry. */
export const cancelPayment = (db, id, extraSet = "") =>
  db.q(`UPDATE payments SET status = 'CANCELLED', completed_at = now()${extraSet} WHERE id = $1`, [id]);

export const markExpired = (db, id) => db.q(`UPDATE payments SET status = 'EXPIRED', completed_at = now() WHERE id = $1`, [id]);

/**
 * A payment whose 5-minute expiry has already passed (created 10 minutes ago).
 * The insert trigger always sets expiry = now() + 5 minutes, so it is switched
 * off for this one insert. This only works inside a transaction that is rolled
 * back afterwards (useRollbackDb), where the switch is undone too.
 */
export async function createExpiredPayment(db, examId, status = "PENDING_CONFIRMATION") {
  // Hard guard: the trigger may only be switched off inside a transaction that
  // is always rolled back. Refuse anything else.
  const inTransaction = (await db.one(`SELECT now() <> statement_timestamp() AS in_tx`)).in_tx;
  if (!db.rollbackOnly || !inTransaction) {
    throw new Error("createExpiredPayment may only run inside a rolled-back test transaction (useRollbackDb).");
  }
  const student = (await createUser(db, "STUDENT")).id;
  await db.q(`ALTER TABLE payments DISABLE TRIGGER payments_on_insert`);
  const payment = await insertPaymentWith(
    db, examId, student,
    ", created_at, expires_at, status, confirmed_at",
    `, now() - interval '10 minutes', now() - interval '5 minutes', $3::"PaymentStatus",
       CASE WHEN $3::text = 'PENDING_PIN' THEN now() - interval '9 minutes' END`,
    [status],
  );
  await db.q(`ALTER TABLE payments ENABLE TRIGGER payments_on_insert`);
  return payment;
}
