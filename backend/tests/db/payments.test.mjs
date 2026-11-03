/**
 * Simulated payments (Section 7, P7): DEMO-only records, the approved status
 * flow, fixed fields, receipts and duplicate protection (15 tests).
 */
import { beforeAll, describe, it } from "vitest";
import { expectDbError, useRollbackDb } from "../helpers/db.mjs";
import { createUser } from "../helpers/fixtures.mjs";
import {
  createPaidExam, createPayment, createPinStagePayment, insertPaymentWith, markSuccess, pressYes, setPinAttempts,
} from "../helpers/payments.mjs";

describe("payments", () => {
  const db = useRollbackDb();
  let w;

  beforeAll(async () => {
    w = await createPaidExam(db);
  });

  describe("records and duplicates", () => {
    it("rejects a non-simulated payment", async () => {
      const p = await createPayment(db, w.examId);
      await expectDbError(db, () => db.q(`UPDATE payments SET is_simulated = false WHERE id = $1`, [p.id]), "payments_simulated_chk");
    });

    it("rejects a second open payment for the same student and exam", async () => {
      const p = await createPayment(db, w.examId);
      await expectDbError(db, () => createPayment(db, w.examId, p.student_id), "payments_one_open_key");
    });

    it("rejects a second successful payment for the same student and exam", async () => {
      const first = await createPinStagePayment(db, w.examId);
      await markSuccess(db, first.id, "DEMO-EVC-20261103-AAAAAA");
      const second = await createPayment(db, w.examId, first.student_id);
      await pressYes(db, second.id);
      await expectDbError(db, () => markSuccess(db, second.id, "DEMO-EVC-20261103-BBBBBB"), "payments_one_success_key");
    });

    it("rejects a repeated idempotency key", async () => {
      const [s1, s2] = [await createUser(db, "STUDENT"), await createUser(db, "STUDENT")];
      const key = "22222222-2222-2222-2222-222222222222";
      const sql = `INSERT INTO payments (student_id, exam_id, provider, phone, amount, currency, merchant_name, merchant_number, idempotency_key)
                   VALUES ($1, $2, 'ZAAD', '+252634000000', 5, 'USD', 'D', '0', $3)`;
      await db.q(sql, [s1.id, w.examId, key]);
      await expectDbError(db, () => db.q(sql, [s2.id, w.examId, key]), "payments_idempotency_key_key");
    });

    it("rejects deleting a payment", async () => {
      const p = await createPayment(db, w.examId);
      await expectDbError(db, () => db.q(`DELETE FROM payments WHERE id = $1`, [p.id]), "PAYMENT_DELETE_FORBIDDEN");
    });
  });

  describe("new payments start at the beginning of the flow", () => {
    it("rejects inserting a payment already marked SUCCESS", async () => {
      const s = await createUser(db, "STUDENT");
      await expectDbError(
        db,
        () => insertPaymentWith(db, w.examId, s.id, ", status, receipt_number, confirmed_at, completed_at", ", 'SUCCESS', 'DEMO-EVC-20261103-ZZZZZZ', now(), now()"),
        "PAYMENT_INVALID_INSERT",
      );
    });

    it("rejects inserting a payment with PIN attempts already used", async () => {
      const s = await createUser(db, "STUDENT");
      await expectDbError(db, () => insertPaymentWith(db, w.examId, s.id, ", pin_attempts", ", 2"), "PAYMENT_INVALID_INSERT");
    });
  });

  describe("status flow and fixed fields", () => {
    it("rejects skipping the Yes step (PENDING_CONFIRMATION to SUCCESS)", async () => {
      const p = await createPayment(db, w.examId);
      await expectDbError(
        db,
        () => db.q(`UPDATE payments SET status = 'SUCCESS', receipt_number = 'DEMO-EVC-20261103-AAAAAA', confirmed_at = now(), completed_at = now() WHERE id = $1`, [p.id]),
        "PAYMENT_INVALID_TRANSITION",
      );
    });

    it("rejects changing the amount after creation", async () => {
      const p = await createPayment(db, w.examId);
      await expectDbError(db, () => db.q(`UPDATE payments SET amount = 0.01 WHERE id = $1`, [p.id]), "PAYMENT_FIELDS_IMMUTABLE");
    });

    it("moves to PENDING_PIN when the student presses Yes", async () => {
      const p = await createPayment(db, w.examId);
      await pressYes(db, p.id);
    });

    it("rejects jumping the PIN counter from 0 to 4", async () => {
      const p = await createPinStagePayment(db, w.examId);
      await expectDbError(db, () => setPinAttempts(db, p.id, 4), "PAYMENT_PIN_ATTEMPTS_INVALID");
    });
  });

  describe("receipts", () => {
    it("rejects SUCCESS without a receipt number", async () => {
      const p = await createPinStagePayment(db, w.examId);
      await expectDbError(db, () => db.q(`UPDATE payments SET status = 'SUCCESS', completed_at = now() WHERE id = $1`, [p.id]), "payments_receipt_chk");
    });

    it("rejects a receipt whose provider code does not match the provider", async () => {
      const p = await createPinStagePayment(db, w.examId);
      await expectDbError(db, () => markSuccess(db, p.id, "DEMO-ZAAD-20261103-AAAAAA"), "payments_receipt_format_chk");
    });

    it("records SUCCESS with a DEMO receipt after a correct PIN", async () => {
      const p = await createPinStagePayment(db, w.examId);
      await markSuccess(db, p.id, "DEMO-EVC-20261103-7F3K9Q");
    });

    it("rejects any change to a successful payment", async () => {
      const p = await createPinStagePayment(db, w.examId);
      await markSuccess(db, p.id);
      await expectDbError(db, () => db.q(`UPDATE payments SET status = 'FAILED', failure_reason = 'X' WHERE id = $1`, [p.id]), "PAYMENT_ALREADY_FINAL");
    });
  });
});
