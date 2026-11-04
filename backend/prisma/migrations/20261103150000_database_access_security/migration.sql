-- =============================================================================
-- Database access security
-- -----------------------------------------------------------------------------
-- 1. Creates the application role "exam_app" (no password here; each
--    environment enables login separately, outside git).
-- 2. Gives exam_app only the table privileges the backend needs.
-- 3. Enables row-level security (RLS) on all 35 tables. Each table gets one
--    policy, which applies ONLY to exam_app. No policy exists for PUBLIC,
--    anon, authenticated or service_role, so those roles see no rows.
--    The policy does not separate one student's rows from another's: that
--    authorization is enforced by the Express service layer on every request.
-- 4. On Supabase only: removes all privileges of anon, authenticated and
--    service_role on our tables, sequences and functions (skipped where these
--    roles don't exist, e.g. local PostgreSQL).
-- 5. Fails the migration if any table in "public" is left without RLS.
-- Runs unchanged on local PostgreSQL 17 and on Supabase. Documented in
-- docs/database.md ("Access security").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Application role
-- -----------------------------------------------------------------------------
-- Enable login per environment (never in a committed file):
--   ALTER ROLE exam_app WITH LOGIN PASSWORD '<secret from the password manager>';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exam_app') THEN
    CREATE ROLE exam_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

-- Lets the migration owner switch to exam_app (SET ROLE) so the automated
-- tests can check the application's permissions. It gives the owner nothing new.
GRANT exam_app TO CURRENT_USER;

-- -----------------------------------------------------------------------------
-- 2. Privileges
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO exam_app;

-- Read, add and change rows in every table ...
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO exam_app;

-- ... except Prisma's migration history, which only the owner may touch.
REVOKE ALL ON "_prisma_migrations" FROM exam_app;

-- History tables: add and read only (the append-only triggers block changes too).
REVOKE UPDATE ON "audit_logs", "grade_revisions", "result_publications" FROM exam_app;

-- Deleting is allowed only where the approved design edits drafts.
-- Locked question versions and used rules stay protected by triggers and
-- foreign keys.
GRANT DELETE ON
  "question_options", "accepted_answers", "rubric_criteria",   -- unlocked question drafts
  "exam_rules", "exam_rule_topics",                              -- draft exam rules
  "schedule_rooms", "schedule_invigilators",                     -- schedule requests
  "grading_scale"                                                -- editable grading scale (D6)
TO exam_app;

-- exam_app gets no TRUNCATE, REFERENCES or TRIGGER privilege and owns nothing,
-- so it can never ALTER TABLE, switch off triggers or drop constraints.

-- -----------------------------------------------------------------------------
-- 3. Row-level security
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles', 'users', 'audit_logs',
    'faculties', 'courses', 'enrolments',
    'topics', 'questions', 'question_versions', 'question_options', 'accepted_answers', 'rubric_criteria', 'import_batches',
    'exams', 'exam_rules', 'exam_rule_topics', 'exam_schedules', 'rooms', 'schedule_rooms', 'schedule_invigilators',
    'exam_attempts', 'attempt_questions', 'answers', 'focus_events', 'time_extensions', 'invigilator_notes',
    'essay_marks', 'essay_criterion_marks', 'grading_scale', 'grades', 'result_publications', 'grade_revisions',
    'payments', 'sms_outbox', 'notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- The only policy: exam_app may work with all rows. Per-user rules (a
    -- student's own attempt, a lecturer's own courses) are enforced in Express.
    EXECUTE format(
      'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO exam_app USING (true) WITH CHECK (true)',
      t || '_exam_app_access', t);
  END LOOP;
END $$;

-- Prisma's history table: RLS on, no policy at all (only the owner uses it).
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. Supabase API roles (only where they exist)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      -- Stop objects created later by the migration owner from being granted
      -- to this role automatically.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Safety net: no table in "public" may be left without RLS
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS_NOT_ENABLED' USING DETAIL = 'tables without row-level security: ' || missing;
  END IF;
END $$;
