/**
 * Database access security (migration 20261103150000_database_access_security):
 * row-level security on every table, the restricted application role
 * exam_app, and no access for roles without a policy. 32 tests run
 * everywhere; 3 more run only where Supabase's API roles exist.
 *
 * Tests switch to exam_app with SET LOCAL ROLE inside the rolled-back test
 * transaction, so they see exactly what the Express application will see.
 */
import { describe, expect, it } from "vitest";
import { expectDbError, useRollbackDb } from "../helpers/db.mjs";
import { addAttemptQuestion, createAttempt, createExamWorld, createUser, uid } from "../helpers/fixtures.mjs";
import { createPaidExam, createPinStagePayment, markSuccess } from "../helpers/payments.mjs";

const APP_TABLES = [
  "roles", "users", "audit_logs",
  "faculties", "courses", "enrolments",
  "topics", "questions", "question_versions", "question_options", "accepted_answers", "rubric_criteria", "import_batches",
  "exams", "exam_rules", "exam_rule_topics", "exam_schedules", "rooms", "schedule_rooms", "schedule_invigilators",
  "exam_attempts", "attempt_questions", "answers", "focus_events", "time_extensions", "invigilator_notes",
  "essay_marks", "essay_criterion_marks", "grading_scale", "grades", "result_publications", "grade_revisions",
  "payments", "sms_outbox", "notifications",
  "account_number_sequences",
  "academic_years", "faculty_lecturers", "student_registrations",
  "exam_excluded_questions",
];
// Add and read only (no UPDATE).
const HISTORY_TABLES = ["audit_logs", "grade_revisions", "result_publications"];
// The only tables where exam_app may DELETE (draft editing).
const DELETABLE_TABLES = [
  "question_options", "accepted_answers", "rubric_criteria", "exam_rules", "exam_rule_topics",
  "schedule_rooms", "schedule_invigilators", "grading_scale",
  "faculty_lecturers", // a lecturer can be removed from a faculty
  "exam_excluded_questions", // a lecturer can tick a question again
];

describe("access security", () => {
  const db = useRollbackDb();
  const actAsApp = () => db.q(`SET LOCAL ROLE exam_app`);

  describe("row-level security and the exam_app role", () => {
    it("enables RLS on all 40 tables and on Prisma's migration history", async () => {
      const { rows } = await db.q(
        `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'`,
      );
      expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
      expect(rows.map((r) => r.relname).sort()).toEqual([...APP_TABLES, "_prisma_migrations"].sort());
    });

    it("has exactly one policy per table, and every policy applies only to exam_app", async () => {
      const { rows } = await db.q(`SELECT tablename, roles::text[] AS roles FROM pg_policies WHERE schemaname = 'public'`);
      expect(rows.map((r) => r.tablename).sort()).toEqual([...APP_TABLES].sort());
      expect(rows.every((r) => r.roles.length === 1 && r.roles[0] === "exam_app")).toBe(true);
    });

    it("grants exam_app exactly the approved privileges on every table, and none on migration history", async () => {
      const ALL = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
      const expected = (table) => {
        if (table === "_prisma_migrations") return [];
        const p = ["SELECT", "INSERT"];
        if (!HISTORY_TABLES.includes(table)) p.push("UPDATE");
        if (DELETABLE_TABLES.includes(table)) p.push("DELETE");
        return p;
      };
      // One query for all tables and privileges (fast over a remote connection too).
      const { rows } = await db.q(
        `SELECT t AS table_name,
                array_remove(ARRAY(SELECT p FROM unnest($2::text[]) WITH ORDINALITY AS x(p, i)
                                    WHERE has_table_privilege('exam_app', format('public.%I', t), p) ORDER BY i), NULL) AS actual
           FROM unnest($1::text[]) AS t`,
        [[...APP_TABLES, "_prisma_migrations"], ALL],
      );
      const mismatches = rows
        .filter((r) => r.actual.join() !== expected(r.table_name).join())
        .map((r) => `${r.table_name}: expected [${expected(r.table_name)}] got [${r.actual}]`);
      expect(mismatches).toEqual([]);
      const schema = await db.one(`SELECT has_schema_privilege('exam_app', 'public', 'USAGE') AS usage, has_schema_privilege('exam_app', 'public', 'CREATE') AS create`);
      expect(schema).toEqual({ usage: true, create: false });
    });

    it("keeps exam_app restricted: not superuser, cannot skip RLS, create roles or create databases", async () => {
      const role = await db.one(`SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'exam_app'`);
      expect(role).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false });
    });
  });

  describe("exam_app can do the application's normal work", () => {
    it("creates users, a course, a question, an exam, a rule and a schedule", async () => {
      await actAsApp();
      const w = await createExamWorld(db);
      expect(w.versionId).toBeTruthy();
    });

    it("draws a question into an attempt, which still locks the version", async () => {
      await actAsApp();
      const w = await createExamWorld(db);
      const attemptId = await createAttempt(db, { examId: w.examId, scheduleId: w.scheduleId, studentId: w.studentId });
      await addAttemptQuestion(db, { attemptId, versionId: w.versionId, ruleId: w.ruleId, optionOrder: w.optionIds });
      expect((await db.one(`SELECT is_locked FROM question_versions WHERE id = $1`, [w.versionId])).is_locked).toBe(true);
    });

    it("saves an answer before the deadline (the deadline trigger still runs)", async () => {
      await actAsApp();
      const w = await createExamWorld(db);
      const attemptId = await createAttempt(db, { examId: w.examId, scheduleId: w.scheduleId, studentId: w.studentId });
      const aq = await addAttemptQuestion(db, { attemptId, versionId: w.versionId, ruleId: w.ruleId, optionOrder: w.optionIds });
      await db.q(
        `INSERT INTO answers (attempt_id, attempt_question_id, question_version_id, selected_option_id) VALUES ($1, $2, $3, $4)`,
        [attemptId, aq, w.versionId, w.optionIds[0]],
      );
    });

    it("completes the simulated payment flow", async () => {
      await actAsApp();
      const w = await createPaidExam(db);
      const p = await createPinStagePayment(db, w.examId);
      await markSuccess(db, p.id);
    });

    it("writes an audit log entry", async () => {
      await actAsApp();
      const admin = await createUser(db, "ADMIN");
      await db.q(`INSERT INTO audit_logs (actor_id, action_code, entity_type) VALUES ($1, 'TEST', 'exam')`, [admin.id]);
    });

    it("deletes draft rule topics", async () => {
      await actAsApp();
      const w = await createExamWorld(db);
      await db.q(`INSERT INTO exam_rule_topics (rule_id, topic_id) VALUES ($1, $2)`, [w.ruleId, w.topicId]);
      await db.q(`DELETE FROM exam_rule_topics WHERE rule_id = $1`, [w.ruleId]);
    });
  });

  describe("exam_app cannot weaken or bypass the database rules", () => {
    const forbidden = [
      ["delete payments", `DELETE FROM payments`],
      ["update audit log entries", `UPDATE audit_logs SET action_code = 'X'`],
      ["delete users", `DELETE FROM users`],
      ["switch off a trigger", `ALTER TABLE payments DISABLE TRIGGER payments_guard`],
      ["drop a constraint", `ALTER TABLE payments DROP CONSTRAINT payments_simulated_chk`],
      ["truncate a table", `TRUNCATE answers`],
      ["create tables", `CREATE TABLE public.not_allowed (id int)`],
      ["read Prisma's migration history", `SELECT * FROM _prisma_migrations`],
      ["add rows to Prisma's migration history", `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at) VALUES ('x', 'x', 'x', now())`],
      ["delete Prisma's migration history", `DELETE FROM _prisma_migrations`],
      ["add a constraint", `ALTER TABLE payments ADD CONSTRAINT not_allowed_chk CHECK (true)`],
      ["remove a NOT NULL rule", `ALTER TABLE payments ALTER COLUMN amount DROP NOT NULL`],
      ["turn off row-level security", `ALTER TABLE users DISABLE ROW LEVEL SECURITY`],
      ["drop a policy", `DROP POLICY users_exam_app_access ON users`],
      ["drop a trigger", `DROP TRIGGER payments_guard ON payments`],
      ["replace a trigger function", `CREATE OR REPLACE FUNCTION oe_payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`],
      ["switch off all triggers for its session (session_replication_role)", `SET LOCAL session_replication_role = replica`],
      ["give itself more powers (BYPASSRLS)", `ALTER ROLE exam_app BYPASSRLS`],
    ];
    for (const [action, sql] of forbidden) {
      it(`cannot ${action}`, async () => {
        await actAsApp();
        await expectDbError(db, () => db.q(sql), "42501");
      });
    }

    // SET ROLE is decided by the role that logged in, and these tests log in as
    // the owner, so switching back can't be tested here. Instead: exam_app is a
    // member of no role at all, so a real exam_app login can't become the owner
    // or inherit anyone else's rights.
    it("is a member of no other role, so it cannot become the owner or inherit rights", async () => {
      const { rows } = await db.q(
        `SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
          WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'exam_app')`,
      );
      expect(rows.map((r) => r.rolname)).toEqual([]);
    });

    it("cannot grant itself a privilege it does not have", async () => {
      await actAsApp();
      await db.q(`GRANT DELETE ON payments TO exam_app`); // PostgreSQL only warns, so check the result
      expect((await db.one(`SELECT has_table_privilege('exam_app', 'public.payments', 'DELETE') AS has`)).has).toBe(false);
    });
  });

  describe("roles without a policy see nothing", () => {
    /** Creates a throwaway role (rolled back with the test) that this connection can switch to. */
    async function throwawayRole(prefix) {
      const name = `${prefix}_${uid()}`;
      await db.q(`CREATE ROLE ${name} NOLOGIN`);
      await db.q(`GRANT ${name} TO CURRENT_USER`);
      await db.q(`GRANT USAGE ON SCHEMA public TO ${name}`);
      return name;
    }

    it("denies a role without table grants (like anon after the revoke)", async () => {
      const outsider = await throwawayRole("outsider");
      await createUser(db, "STUDENT");
      await db.q(`SET LOCAL ROLE ${outsider}`);
      await expectDbError(db, () => db.q(`SELECT * FROM users`), "42501");
    });

    it("shows 0 rows to a role that has a SELECT grant but no policy (like anon before the revoke)", async () => {
      const granted = await throwawayRole("granted_no_policy");
      await db.q(`GRANT SELECT ON users TO ${granted}`);
      await createUser(db, "STUDENT");
      expect(Number((await db.one(`SELECT count(*) AS n FROM users`)).n)).toBeGreaterThan(0);
      await db.q(`SET LOCAL ROLE ${granted}`);
      expect(Number((await db.one(`SELECT count(*) AS n FROM users`)).n)).toBe(0);
    });
  });

  // Only meaningful on Supabase, where these API roles exist. Skipped on local PostgreSQL.
  describe("Supabase API roles have no access", () => {
    for (const apiRole of ["anon", "authenticated", "service_role"]) {
      it.skipIf(!process.env.TEST_SUPABASE_PROJECT_REF && !process.env.TEST_EXPECT_SUPABASE_ROLES)(`${apiRole} has no privileges on any application table`, async () => {
        const { rows } = await db.q(
          `SELECT t AS table_name FROM unnest($1::text[]) AS t
            WHERE has_table_privilege($2, format('public.%I', t), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`,
          [APP_TABLES, apiRole],
        );
        expect(rows.map((r) => r.table_name)).toEqual([]);
      });
    }
  });
});
