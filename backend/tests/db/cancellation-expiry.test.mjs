/**
 * Cancellation, expiry and final payment outcomes: the 5-minute expiry is set
 * by the database and never changes; after it, only EXPIRED is possible;
 * students can cancel at Yes/No or during PIN entry; SUCCESS, FAILED,
 * CANCELLED and EXPIRED are final (29 tests).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useRollbackDb } from "../helpers/db.mjs";
import { createUser } from "../helpers/fixtures.mjs";
import {
  cancelPayment, createExpiredPayment, createPaidExam, createPayment, createPinStagePayment, failAfterThirdPin,
  insertPaymentWith, markExpired, markSuccess, pressYes, setPinAttempts,
} from "../helpers/payments.mjs";

describe("cancellation and expiry", () => {
  const db = useRollbackDb();
  let w;

  beforeAll(async () => {
    w = await createPaidExam(db);
  });

  describe("the expiry is set by the database", () => {
    it("sets expiry to creation time + 5 minutes, ignoring values sent by the app", async () => {
      const s = await createUser(db, "STUDENT");
      const p = await insertPaymentWith(db, w.examId, s.id, ", created_at, expires_at", ", now() - interval '1 day', now() + interval '3 hours'");
      const row = await db.one(
        `SELECT created_at = now() AS created_now, expires_at - created_at = interval '5 minutes' AS five_minutes FROM payments WHERE id = $1`,
        [p.id],
      );
      expect(row).toEqual({ created_now: true, five_minutes: true });
    });

    it("rejects extending the expiry", async () => {
      const p = await createPayment(db, w.examId);
      await expectDbError(db, () => db.q(`UPDATE payments SET expires_at = expires_at + interval '10 minutes' WHERE id = $1`, [p.id]), "PAYMENT_FIELDS_IMMUTABLE");
    });

    it("rejects shortening the expiry", async () => {
      const p = await createPayment(db, w.examId);
      await expectDbError(db, () => db.q(`UPDATE payments SET expires_at = expires_at - interval '1 minute' WHERE id = $1`, [p.id]), "PAYMENT_FIELDS_IMMUTABLE");
    });

    it("rejects marking a payment EXPIRED before its expiry time", async () => {
      const p = await createPayment(db, w.examId);
      await expectDbError(db, () => markExpired(db, p.id), "PAYMENT_NOT_EXPIRED");
    });
  });

  describe("after the expiry time only EXPIRED is allowed", () => {
    it("rejects Yes after expiry", async () => {
      const p = await createExpiredPayment(db, w.examId);
      await expectDbError(db, () => pressYes(db, p.id), "PAYMENT_EXPIRED");
    });

    it("rejects No (cancel) after expiry", async () => {
      const p = await createExpiredPayment(db, w.examId);
      await expectDbError(db, () => cancelPayment(db, p.id), "PAYMENT_EXPIRED");
    });

    it("marks an expired payment EXPIRED", async () => {
      const p = await createExpiredPayment(db, w.examId);
      await markExpired(db, p.id);
    });

    it("rejects a correct PIN (SUCCESS) after expiry", async () => {
      const p = await createExpiredPayment(db, w.examId, "PENDING_PIN");
      await expectDbError(db, () => markSuccess(db, p.id, "DEMO-EVC-20261103-AAAAAA"), "PAYMENT_EXPIRED");
    });

    it("rejects counting a wrong PIN after expiry", async () => {
      const p = await createExpiredPayment(db, w.examId, "PENDING_PIN");
      await expectDbError(db, () => setPinAttempts(db, p.id, 1), "PAYMENT_EXPIRED");
    });

    it("rejects any other update after expiry", async () => {
      const p = await createExpiredPayment(db, w.examId, "PENDING_PIN");
      await expectDbError(db, () => db.q(`UPDATE payments SET mock_reference = 'x' WHERE id = $1`, [p.id]), "PAYMENT_EXPIRED");
    });

    it("marks an expired PIN-stage payment EXPIRED", async () => {
      const p = await createExpiredPayment(db, w.examId, "PENDING_PIN");
      await markExpired(db, p.id);
    });
  });

  describe("cancellation", () => {
    it("allows cancelling at the Yes/No step (No)", async () => {
      const p = await createPayment(db, w.examId);
      await cancelPayment(db, p.id);
    });

    it("allows cancelling during PIN entry", async () => {
      const p = await createPinStagePayment(db, w.examId);
      await setPinAttempts(db, p.id, 1);
      await cancelPayment(db, p.id);
    });

    it("keeps the PIN counter when cancelling", async () => {
      const p = await createPinStagePayment(db, w.examId);
      await setPinAttempts(db, p.id, 1);
      await cancelPayment(db, p.id);
      expect((await db.one(`SELECT pin_attempts FROM payments WHERE id = $1`, [p.id])).pin_attempts).toBe(1);
    });

    it("rejects counting a PIN attempt in the same update as cancelling", async () => {
      const p = await createPinStagePayment(db, w.examId);
      await expectDbError(db, () => cancelPayment(db, p.id, ", pin_attempts = 1"), "PAYMENT_PIN_ATTEMPTS_INVALID");
    });

    it("rejects cancelling during PIN entry after expiry", async () => {
      const p = await createExpiredPayment(db, w.examId, "PENDING_PIN");
      await expectDbError(db, () => cancelPayment(db, p.id), "PAYMENT_EXPIRED");
    });
  });

  describe("SUCCESS requires the PIN step", () => {
    it("rejects SUCCESS straight from the Yes/No step", async () => {
      const p = await createPayment(db, w.examId);
      await expectDbError(
        db,
        () => db.q(`UPDATE payments SET status = 'SUCCESS', receipt_number = 'DEMO-EVC-20261103-DDDDDD', confirmed_at = now(), completed_at = now() WHERE id = $1`, [p.id]),
        "PAYMENT_INVALID_TRANSITION",
      );
    });

    it("rejects SUCCESS without a DEMO receipt", async () => {
      const p = await createPinStagePayment(db, w.examId);
      await expectDbError(db, () => db.q(`UPDATE payments SET status = 'SUCCESS', completed_at = now() WHERE id = $1`, [p.id]), "payments_receipt_chk");
    });
  });

  describe("final outcomes never change", () => {
    const makeFinal = {
      SUCCESS: async () => {
        const p = await createPinStagePayment(db, w.examId);
        await markSuccess(db, p.id, "DEMO-EVC-20261103-EEEEEE");
        return p;
      },
      FAILED: async () => {
        const p = await createPinStagePayment(db, w.examId);
        await setPinAttempts(db, p.id, 1);
        await setPinAttempts(db, p.id, 2);
        await failAfterThirdPin(db, p.id);
        return p;
      },
      CANCELLED: async () => {
        const p = await createPinStagePayment(db, w.examId);
        await cancelPayment(db, p.id);
        return p;
      },
      EXPIRED: async () => {
        const p = await createExpiredPayment(db, w.examId, "PENDING_PIN");
        await markExpired(db, p.id);
        return p;
      },
    };

    for (const state of Object.keys(makeFinal)) {
      it(`${state}: rejects confirming again`, async () => {
        const p = await makeFinal[state]();
        await expectDbError(db, () => db.q(`UPDATE payments SET status = 'PENDING_PIN' WHERE id = $1`, [p.id]), "PAYMENT_ALREADY_FINAL");
      });

      if (state !== "SUCCESS") {
        it(`${state}: rejects marking SUCCESS afterwards`, async () => {
          const p = await makeFinal[state]();
          await expectDbError(db, () => markSuccess(db, p.id, "DEMO-EVC-20261103-FFFFFF"), "PAYMENT_ALREADY_FINAL");
        });
      }

      it(`${state}: rejects any other edit`, async () => {
        const p = await makeFinal[state]();
        await expectDbError(db, () => db.q(`UPDATE payments SET mock_reference = 'late' WHERE id = $1`, [p.id]), "PAYMENT_ALREADY_FINAL");
      });
    }
  });
});
