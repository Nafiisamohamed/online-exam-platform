-- Phase 6: SMS message templates written by the registrar (Somali and English).
--   sms_templates  one named template with a Somali and an English text and a category
--                  (upcoming exam, schedule approval, payment reminder, payment confirmation,
--                  published results, revised results, general). Templates are switched off,
--                  never deleted. The table starts empty: nothing is invented.
-- No existing table or row is changed. Everything runs in ONE transaction.
BEGIN;

CREATE TYPE "SmsTemplateCategory" AS ENUM (
  'UPCOMING_EXAM', 'SCHEDULE_APPROVED', 'PAYMENT_REMINDER', 'PAYMENT_CONFIRMATION',
  'RESULTS_PUBLISHED', 'RESULTS_REVISED', 'GENERAL'
);

CREATE TABLE "sms_templates" (
  "id"          UUID                  NOT NULL DEFAULT gen_random_uuid(),
  "name"        TEXT                  NOT NULL,
  "category"    "SmsTemplateCategory" NOT NULL DEFAULT 'GENERAL',
  "body_so"     TEXT                  NOT NULL,
  "body_en"     TEXT                  NOT NULL,
  "is_active"   BOOLEAN               NOT NULL DEFAULT true,
  "created_by"  UUID                  NOT NULL,
  "updated_by"  UUID                  NOT NULL,
  "created_at"  TIMESTAMPTZ(6)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ(6)        NOT NULL,
  CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sms_templates_name_chk" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  -- At most three SMS segments in each language (3 x 153 characters).
  CONSTRAINT "sms_templates_body_chk" CHECK (
    char_length(btrim("body_so")) BETWEEN 1 AND 459 AND char_length(btrim("body_en")) BETWEEN 1 AND 459),
  -- Like the outbox: a template may never carry a password or PIN placeholder.
  CONSTRAINT "sms_templates_no_secrets_chk" CHECK (
    "body_so" !~* '\{\s*(password|temppassword|pin)\s*\}' AND "body_en" !~* '\{\s*(password|temppassword|pin)\s*\}')
);
CREATE UNIQUE INDEX "sms_templates_name_key" ON "sms_templates" ("name");
ALTER TABLE "sms_templates"
  ADD CONSTRAINT "sms_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "sms_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Access: like every other table (no delete: templates are switched off instead).
GRANT SELECT, INSERT, UPDATE ON "sms_templates" TO exam_app;
ALTER TABLE "sms_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_templates_exam_app_access" ON "sms_templates" AS PERMISSIVE FOR ALL TO exam_app USING (true) WITH CHECK (true);

COMMIT;
