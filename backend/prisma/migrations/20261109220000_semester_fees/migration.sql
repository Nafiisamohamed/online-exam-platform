-- Phase 4: semester fees.
--   semester_fees  the fee of one faculty, academic year and semester (1-8); set by the registrar.
--                  Nothing is invented: the table starts empty.
--   payments       a payment is now for EITHER an exam fee (exam_id, the historical payments,
--                  kept exactly as they are) OR a semester fee (semester_fee_id). Several
--                  successful payments per semester fee are allowed (partial payments); at most
--                  one is open at a time. semester_fee_id can never change after creation.
-- The existing payment protection triggers are not changed. Everything runs in ONE transaction.
BEGIN;

-- 1. Fees.
CREATE TABLE "semester_fees" (
  "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
  "academic_year_id" UUID          NOT NULL,
  "faculty_id"       UUID          NOT NULL,
  "semester_number"  SMALLINT      NOT NULL,
  "amount"           DECIMAL(12,2) NOT NULL,
  "currency"         CHAR(3)       NOT NULL,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "semester_fees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "semester_fees_semester_number_chk" CHECK ("semester_number" BETWEEN 1 AND 8),
  CONSTRAINT "semester_fees_amount_chk" CHECK ("amount" > 0),
  CONSTRAINT "semester_fees_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "semester_fees_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "semester_fees_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "semester_fees_group_key" ON "semester_fees" ("academic_year_id", "faculty_id", "semester_number");

-- 2. Payments: exam fee (history) or semester fee.
ALTER TABLE "payments"
  ALTER COLUMN "exam_id" DROP NOT NULL,
  ADD COLUMN "semester_fee_id" UUID,
  ADD CONSTRAINT "payments_semester_fee_id_fkey" FOREIGN KEY ("semester_fee_id") REFERENCES "semester_fees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payments_purpose_chk" CHECK (("exam_id" IS NULL) <> ("semester_fee_id" IS NULL));
CREATE INDEX "payments_student_fee_idx" ON "payments" ("student_id", "semester_fee_id");
-- At most one open payment per student and semester fee (successful ones may be several: partial payments).
CREATE UNIQUE INDEX "payments_one_open_fee_key" ON "payments" ("student_id", "semester_fee_id")
  WHERE "semester_fee_id" IS NOT NULL AND "status" IN ('PENDING_CONFIRMATION', 'PENDING_PIN');

-- 3. semester_fee_id is fixed once the payment exists (the existing guard covers every other field).
CREATE FUNCTION "oe_payments_fee_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."semester_fee_id" IS DISTINCT FROM OLD."semester_fee_id" THEN
    RAISE EXCEPTION 'PAYMENT_FIELDS_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "payments_fee_immutable" BEFORE UPDATE ON "payments" FOR EACH ROW EXECUTE FUNCTION "oe_payments_fee_immutable"();

-- 4. Access: like every other table (no delete).
GRANT SELECT, INSERT, UPDATE ON "semester_fees" TO exam_app;
ALTER TABLE "semester_fees" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "semester_fees_exam_app_access" ON "semester_fees" AS PERMISSIVE FOR ALL TO exam_app USING (true) WITH CHECK (true);

COMMIT;
