-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "expires_at" SET DEFAULT (now() + '00:05:00'::interval);

-- =============================================================================
-- RAW SQL SECTION: payment guard hardening
-- -----------------------------------------------------------------------------
-- Closes the gaps found in review of 20261103000000_init:
--   G1  The PIN attempt counter could be lowered or reset.
--   G2  The expiry could be changed, and nothing blocked actions after it.
--   G3  (same trigger area) A payment could be inserted already SUCCESS,
--       skipping the approved flow.
--   G4  A student could cancel only at the Yes/No step, not during PIN entry.
--
-- Approved outcomes after this migration:
--   SUCCESS    correct demo PIN (checked by the backend) while PENDING_PIN
--   FAILED     third wrong demo PIN, in the same update as the 3rd attempt
--   CANCELLED  student presses No, or cancels during PIN entry
--   EXPIRED    5 minutes after creation; nothing else is possible after that
-- All four are final.
-- Error messages are stable codes, as in the init migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CHECK constraints
-- -----------------------------------------------------------------------------
ALTER TABLE "payments"
  -- G1: the counter only moves while PIN entry is open.
  ADD CONSTRAINT "payments_pin_unconfirmed_chk" CHECK (
    "status" <> 'PENDING_CONFIRMATION' OR "pin_attempts" = 0),
  -- G1: a payment still waiting for a PIN has fewer than 3 wrong attempts.
  --     The third wrong PIN must fail the payment in the same update.
  ADD CONSTRAINT "payments_pin_limit_chk" CHECK (
    "status" <> 'PENDING_PIN' OR "pin_attempts" < 3),
  -- G1: a payment only fails after exactly 3 wrong PINs.
  ADD CONSTRAINT "payments_failed_attempts_chk" CHECK (
    "status" <> 'FAILED' OR "pin_attempts" = 3),
  -- G2: the expiry is always 5 minutes after creation.
  ADD CONSTRAINT "payments_expiry_window_chk" CHECK (
    "expires_at" = "created_at" + interval '5 minutes');

-- -----------------------------------------------------------------------------
-- T7 (G2, G3). New payments always start at the beginning of the flow, and the
-- database sets the creation time and the 5-minute expiry. Values sent by the
-- application for these two columns are ignored.
-- -----------------------------------------------------------------------------
CREATE FUNCTION "oe_payments_on_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'PENDING_CONFIRMATION'
  OR NEW."pin_attempts" <> 0
  OR NEW."receipt_number" IS NOT NULL
  OR NEW."confirmed_at"   IS NOT NULL
  OR NEW."completed_at"   IS NOT NULL
  OR NEW."failure_reason" IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_INVALID_INSERT'
      USING ERRCODE = 'P0001',
            DETAIL = 'a new payment must start as PENDING_CONFIRMATION with no PIN attempts, receipt or completion';
  END IF;

  NEW."created_at" := now();
  NEW."expires_at" := now() + interval '5 minutes';
  RETURN NEW;
END;
$$;

CREATE TRIGGER "payments_on_insert"
  BEFORE INSERT ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "oe_payments_on_insert"();

-- -----------------------------------------------------------------------------
-- T6 (replaced). Payment updates and deletes.
--   Unchanged from init: no deletes; fixed fields; final states never change.
--   Status flow (G4 adds PENDING_PIN -> CANCELLED):
--     PENDING_CONFIRMATION -> PENDING_PIN | CANCELLED | EXPIRED
--     PENDING_PIN          -> SUCCESS | FAILED | CANCELLED | EXPIRED
--   New (G1): pin_attempts never decreases, rises by exactly 1 per update,
--   only while PENDING_PIN, and stays the same on SUCCESS.
--   New (G2): expires_at is fixed. Once clock_timestamp() reaches expires_at,
--   the only allowed change is to EXPIRED (no Yes, No, PIN or success), and
--   EXPIRED is only allowed once that time has come.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "oe_payments_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_expired boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PAYMENT_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF NEW."student_id"      IS DISTINCT FROM OLD."student_id"
  OR NEW."exam_id"         IS DISTINCT FROM OLD."exam_id"
  OR NEW."provider"        IS DISTINCT FROM OLD."provider"
  OR NEW."phone"           IS DISTINCT FROM OLD."phone"
  OR NEW."amount"          IS DISTINCT FROM OLD."amount"
  OR NEW."currency"        IS DISTINCT FROM OLD."currency"
  OR NEW."merchant_name"   IS DISTINCT FROM OLD."merchant_name"
  OR NEW."merchant_number" IS DISTINCT FROM OLD."merchant_number"
  OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
  OR NEW."created_at"      IS DISTINCT FROM OLD."created_at"
  OR NEW."expires_at"      IS DISTINCT FROM OLD."expires_at" THEN
    RAISE EXCEPTION 'PAYMENT_FIELDS_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF OLD."status" IN ('SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED') THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_FINAL' USING ERRCODE = 'P0001';
  END IF;

  -- G2: expiry
  v_expired := clock_timestamp() >= OLD."expires_at";
  IF v_expired AND NEW."status" <> 'EXPIRED' THEN
    RAISE EXCEPTION 'PAYMENT_EXPIRED'
      USING ERRCODE = 'P0001', DETAIL = format('payment expired at %s', OLD."expires_at");
  END IF;
  IF NOT v_expired AND NEW."status" = 'EXPIRED' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_EXPIRED'
      USING ERRCODE = 'P0001', DETAIL = format('payment expires at %s', OLD."expires_at");
  END IF;

  -- Approved status flow
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'PENDING_CONFIRMATION' AND NEW."status" IN ('PENDING_PIN', 'CANCELLED', 'EXPIRED'))
    OR (OLD."status" = 'PENDING_PIN'          AND NEW."status" IN ('SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED'))
  ) THEN
    RAISE EXCEPTION 'PAYMENT_INVALID_TRANSITION'
      USING ERRCODE = 'P0001', DETAIL = format('%s -> %s', OLD."status", NEW."status");
  END IF;

  -- G1: PIN attempt counter
  IF NEW."pin_attempts" < OLD."pin_attempts" THEN
    RAISE EXCEPTION 'PAYMENT_PIN_ATTEMPTS_DECREASED'
      USING ERRCODE = 'P0001', DETAIL = format('%s -> %s', OLD."pin_attempts", NEW."pin_attempts");
  END IF;
  IF NEW."pin_attempts" > OLD."pin_attempts" AND (
       NEW."pin_attempts" <> OLD."pin_attempts" + 1
    OR OLD."status" <> 'PENDING_PIN'
    OR NEW."status" NOT IN ('PENDING_PIN', 'FAILED')
  ) THEN
    RAISE EXCEPTION 'PAYMENT_PIN_ATTEMPTS_INVALID'
      USING ERRCODE = 'P0001',
            DETAIL = 'a wrong PIN adds exactly 1 attempt while the payment is PENDING_PIN';
  END IF;

  RETURN NEW;
END;
$$;
-- The existing trigger "payments_guard" (BEFORE UPDATE OR DELETE) now runs this
-- new version of the function; it does not need to be recreated.
