/**
 * Demo PIN attempt counter: never decreases, +1 per wrong PIN, only during PIN
 * entry, and the third wrong PIN fails the payment (15 tests).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useRollbackDb } from "../helpers/db.mjs";
import {
  createPaidExam, createPayment, createPinStagePayment, failAfterThirdPin, markSuccess, setPinAttempts,
} from "../helpers/payments.mjs";

describe("PIN attempts", () => {
  const db = useRollbackDb();
  let w;

  beforeAll(async () => {
    w = await createPaidExam(db);
  });

  /** A PIN-stage payment that already has `wrong` wrong attempts. */
  async function paymentWithWrongPins(wrong) {
    const p = await createPinStagePayment(db, w.examId);
    for (let i = 1; i <= wrong; i++) await setPinAttempts(db, p.id, i);
    return p;
  }
  const attemptsOf = async (id) => (await db.one(`SELECT pin_attempts FROM payments WHERE id = $1`, [id])).pin_attempts;

  describe("counting wrong PINs", () => {
    it("rejects counting a wrong PIN before the student presses Yes", async () => {
      const p = await createPayment(db, w.examId);
      await expectDbError(db, () => setPinAttempts(db, p.id, 1), "PAYMENT_PIN_ATTEMPTS_INVALID");
    });

    it("counts the 1st wrong PIN (0 to 1)", async () => {
      const p = await paymentWithWrongPins(0);
      await setPinAttempts(db, p.id, 1);
      expect(await attemptsOf(p.id)).toBe(1);
    });

    it("counts the 2nd wrong PIN (1 to 2)", async () => {
      const p = await paymentWithWrongPins(1);
      await setPinAttempts(db, p.id, 2);
      expect(await attemptsOf(p.id)).toBe(2);
    });

    it("rejects adding 2 attempts at once", async () => {
      const p = await paymentWithWrongPins(0);
      await expectDbError(db, () => setPinAttempts(db, p.id, 2), "PAYMENT_PIN_ATTEMPTS_INVALID");
    });
  });

  describe("the counter never goes down", () => {
    it("rejects lowering the counter (2 to 1)", async () => {
      const p = await paymentWithWrongPins(2);
      await expectDbError(db, () => setPinAttempts(db, p.id, 1), "PAYMENT_PIN_ATTEMPTS_DECREASED");
    });

    it("rejects resetting the counter (2 to 0)", async () => {
      const p = await paymentWithWrongPins(2);
      await expectDbError(db, () => setPinAttempts(db, p.id, 0), "PAYMENT_PIN_ATTEMPTS_DECREASED");
    });

    it("rejects an ordinary update that also resets the counter", async () => {
      const p = await paymentWithWrongPins(2);
      await expectDbError(db, () => db.q(`UPDATE payments SET mock_reference = 'm', pin_attempts = 0 WHERE id = $1`, [p.id]), "PAYMENT_PIN_ATTEMPTS_DECREASED");
    });

    it("keeps the counter during an ordinary update", async () => {
      const p = await paymentWithWrongPins(2);
      await db.q(`UPDATE payments SET mock_reference = 'm' WHERE id = $1`, [p.id]);
      expect(await attemptsOf(p.id)).toBe(2);
    });
  });

  describe("the third wrong PIN", () => {
    it("rejects a 3rd wrong PIN that leaves the payment open", async () => {
      const p = await paymentWithWrongPins(2);
      await expectDbError(db, () => setPinAttempts(db, p.id, 3), "payments_pin_limit_chk");
    });

    it("rejects failing the payment before 3 wrong PINs", async () => {
      const p = await paymentWithWrongPins(2);
      await expectDbError(
        db,
        () => db.q(`UPDATE payments SET status = 'FAILED', failure_reason = 'PIN_ATTEMPTS_EXCEEDED', completed_at = now() WHERE id = $1`, [p.id]),
        "payments_failed_attempts_chk",
      );
    });

    it("records the 3rd wrong PIN and FAILED together", async () => {
      const p = await paymentWithWrongPins(2);
      await failAfterThirdPin(db, p.id);
      expect(await attemptsOf(p.id)).toBe(3);
    });

    it("blocks a 4th attempt after the payment failed", async () => {
      const p = await paymentWithWrongPins(2);
      await failAfterThirdPin(db, p.id);
      await expectDbError(db, () => setPinAttempts(db, p.id, 4), "PAYMENT_ALREADY_FINAL");
    });

    it("blocks resetting the counter after the payment failed", async () => {
      const p = await paymentWithWrongPins(2);
      await failAfterThirdPin(db, p.id);
      await expectDbError(db, () => setPinAttempts(db, p.id, 0), "PAYMENT_ALREADY_FINAL");
    });
  });

  describe("a correct PIN", () => {
    it("rejects counting a wrong PIN in the same update as SUCCESS", async () => {
      const p = await paymentWithWrongPins(1);
      await expectDbError(
        db,
        () => db.q(`UPDATE payments SET pin_attempts = 2, status = 'SUCCESS', receipt_number = 'DEMO-EVC-20261103-BBBBBB', completed_at = now() WHERE id = $1`, [p.id]),
        "PAYMENT_PIN_ATTEMPTS_INVALID",
      );
    });

    it("keeps the counter at 1 when SUCCESS follows 1 wrong PIN", async () => {
      const p = await paymentWithWrongPins(1);
      await markSuccess(db, p.id, "DEMO-EVC-20261103-CCCCCC");
      expect(await attemptsOf(p.id)).toBe(1);
    });
  });
});
