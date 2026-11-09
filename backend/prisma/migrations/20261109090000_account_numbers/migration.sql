-- Phase 1: automatic account numbers that are also the username.
--   Student S-YYYY-NNN, Lecturer T-YYYY-NNN, Registrar R-YYYY-NNN, Invigilator I-YYYY-NNN
--   (at least 3 digits: ...-999 is followed by ...-1000). YYYY = the year the account was
--   created, Mogadishu time. One counter per role and year.
-- Existing accounts keep their id, password, role and every relationship; only the number
-- changes. The old student number is kept in legacy_number. Historical texts (old SMS bodies,
-- audit details) are not rewritten.

-- Everything runs in ONE transaction: if any step fails, nothing is changed.
BEGIN;

-- 1. Stop before changing anything if any student has a number that is not in the known DEMO format: such a number is
--    never changed silently; it has to be decided first.
DO $$
DECLARE bad INTEGER;
BEGIN
  SELECT count(*) INTO bad FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
   WHERE r."name" = 'STUDENT' AND (u."student_number" IS NULL OR u."student_number" !~ '^DEMO-[0-9]{4}-[0-9]+$');
  IF bad > 0 THEN RAISE EXCEPTION 'account numbering stopped: % student(s) without a DEMO-YYYY-NNNN number', bad; END IF;
END $$;

-- 2. New columns and the counter table.
ALTER TABLE "users" ADD COLUMN "username" TEXT, ADD COLUMN "legacy_number" TEXT;

CREATE TABLE "account_number_sequences" (
  "role"       "RoleName" NOT NULL,
  "year"       INTEGER    NOT NULL CHECK ("year" BETWEEN 2000 AND 2999),
  "last_value" INTEGER    NOT NULL CHECK ("last_value" >= 0),
  CONSTRAINT "account_number_sequences_pkey" PRIMARY KEY ("role", "year")
);

-- 3. Students keep the digits of their current number: DEMO-2026-0007 -> S-2026-007,
--    DEMO-2026-0070 -> S-2026-070 (the year is the creation year, which is 2026 for all).
UPDATE "users" u
   SET "legacy_number"  = u."student_number",
       "student_number" = 'S-' || extract(year FROM u."created_at" AT TIME ZONE 'Africa/Mogadishu')::int || '-' ||
                          lpad((split_part(u."student_number", '-', 3))::int::text, 3, '0'),
       "username"       = 'S-' || extract(year FROM u."created_at" AT TIME ZONE 'Africa/Mogadishu')::int || '-' ||
                          lpad((split_part(u."student_number", '-', 3))::int::text, 3, '0')
  FROM "roles" r
 WHERE r."id" = u."role_id" AND r."name" = 'STUDENT';

-- 4. Staff get numbers in order of creation (then name) within their role and year.
WITH s AS (
  SELECT u."id", r."name" AS role,
         extract(year FROM u."created_at" AT TIME ZONE 'Africa/Mogadishu')::int AS y,
         row_number() OVER (PARTITION BY r."name", extract(year FROM u."created_at" AT TIME ZONE 'Africa/Mogadishu')
                            ORDER BY u."created_at", u."full_name", u."id") AS n
    FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
   WHERE r."name" <> 'STUDENT'
)
UPDATE "users" u
   SET "username" = CASE s.role WHEN 'ADMIN' THEN 'R' WHEN 'LECTURER' THEN 'T' ELSE 'I' END
                    || '-' || s.y || '-' || lpad(s.n::text, 3, '0')
  FROM s WHERE u."id" = s."id";

-- 5. Counters start after the highest number in use for each role and year.
INSERT INTO "account_number_sequences" ("role", "year", "last_value")
SELECT r."name", split_part(u."username", '-', 2)::int, max(split_part(u."username", '-', 3)::int)
  FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
 GROUP BY 1, 2;

-- 6. Rules: every account has a unique username in the right format for its role
--    (prefix checked against the role by the backend and by the tests), and a student's
--    student number is their username.
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users" ("username");
ALTER TABLE "users" ADD CONSTRAINT "users_username_format_chk" CHECK ("username" ~ '^[STRI]-[0-9]{4}-[0-9]{3,}$');
ALTER TABLE "users" ADD CONSTRAINT "users_student_number_is_username_chk" CHECK ("student_number" IS NULL OR "student_number" = "username");

-- 7. Same access rules as every other table: the app role may read and update the counters
--    (never delete), row-level security on with the single exam_app policy.
GRANT SELECT, INSERT, UPDATE ON "account_number_sequences" TO exam_app;
ALTER TABLE "account_number_sequences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_number_sequences_exam_app_access" ON "account_number_sequences"
  AS PERMISSIVE FOR ALL TO exam_app USING (true) WITH CHECK (true);

COMMIT;
