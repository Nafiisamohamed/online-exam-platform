/**
 * Read-only health check of a migrated database: structure, security and the
 * integrity of the data in it (including the demo data).
 *
 * - Connects as the owner (MIGRATE_DATABASE_URL) inside a READ ONLY transaction,
 *   so it cannot change anything.
 * - Prints PASS/FAIL for each check and a summary of row counts. Never prints secrets.
 *
 * Usage: npm run db:check
 * Exit code: 0 when every check passes, 1 otherwise.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { pgClientConfig } from "./lib/pg-connection.mjs";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendDir, ".env") });

const APP_TABLES = [
  "roles", "users", "audit_logs", "faculties", "courses", "enrolments",
  "topics", "questions", "question_versions", "question_options", "accepted_answers", "rubric_criteria", "import_batches",
  "exams", "exam_rules", "exam_rule_topics", "exam_schedules", "rooms", "schedule_rooms", "schedule_invigilators",
  "exam_attempts", "attempt_questions", "answers", "focus_events", "time_extensions", "invigilator_notes",
  "essay_marks", "essay_criterion_marks", "grading_scale", "grades", "result_publications", "grade_revisions",
  "payments", "sms_outbox", "notifications",
];
const TRIGGER_FUNCTIONS = [
  "oe_answers_deadline_guard", "oe_append_only", "oe_lock_version_on_use", "oe_payments_guard",
  "oe_payments_on_insert", "oe_protect_locked_version", "oe_protect_locked_version_children",
];
const TRIGGERS = [
  "accepted_answers_protect_locked", "answers_deadline_guard", "attempt_questions_lock_version", "audit_logs_append_only",
  "grade_revisions_append_only", "payments_guard", "payments_on_insert", "question_options_protect_locked",
  "question_versions_protect_locked", "result_publications_append_only", "rubric_criteria_protect_locked",
];

async function main() {
  const url = process.env.MIGRATE_DATABASE_URL;
  if (!url) throw new Error("MIGRATE_DATABASE_URL (owner) is not set.");
  const u = new URL(url);
  const client = new pg.Client(pgClientConfig(url));
  await client.connect();
  const rows = async (sql, p) => (await client.query(sql, p)).rows;
  const one = async (sql, p) => (await rows(sql, p))[0];
  let failures = 0;
  const check = (ok, name, detail = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
  };

  try {
    await client.query("BEGIN READ ONLY");
    const info = await one(`SELECT current_setting('server_version') AS version, current_user AS "user", current_database() AS db`);
    console.log(`Database ${info.db} at ${u.hostname} | PostgreSQL ${info.version} | connected as ${info.user} | read-only\n`);

    // --- Migrations ---
    const folders = fs.readdirSync(path.join(backendDir, "prisma/migrations"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    const applied = (await rows(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`)).map((r) => r.migration_name);
    check(JSON.stringify(applied) === JSON.stringify(folders), "all migrations applied", `${applied.length}/${folders.length}`);

    // --- Structure ---
    const tables = await rows(`SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'`);
    check(APP_TABLES.every((t) => tables.some((r) => r.relname === t)) && tables.length === APP_TABLES.length + 1, "35 application tables + _prisma_migrations", `${tables.length} tables`);
    check(tables.every((r) => r.relrowsecurity), "RLS enabled on every table");
    const policies = await rows(`SELECT tablename, roles::text[] AS roles FROM pg_policies WHERE schemaname = 'public'`);
    check(policies.length === 35 && APP_TABLES.every((t) => policies.some((p) => p.tablename === t && p.roles.join() === "exam_app")), "one exam_app-only policy per table", `${policies.length} policies`);
    const fns = (await rows(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'oe\\_%' ORDER BY 1`)).map((r) => r.proname);
    check(JSON.stringify(fns) === JSON.stringify(TRIGGER_FUNCTIONS), "7 trigger functions", fns.length);
    const trg = (await rows(`SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled <> 'D' ORDER BY 1`)).map((r) => r.tgname);
    check(JSON.stringify(trg) === JSON.stringify(TRIGGERS), "11 triggers present and enabled", trg.length);
    const cons = await one(`SELECT count(*) FILTER (WHERE contype = 'c')::int AS checks, count(*) FILTER (WHERE contype = 'f')::int AS fks, count(*) FILTER (WHERE contype = 'p')::int AS pks, count(*) FILTER (WHERE contype = 'u')::int AS uniques FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'`);
    // Exact counts from the three migrations. Uniqueness is enforced by unique
    // indexes (Prisma's style), so there are no UNIQUE constraints.
    check(cons.checks === 69 && cons.fks === 59 && cons.pks === 36, "all constraints present (69 CHECK, 59 foreign keys, 36 primary keys)", `CHECK ${cons.checks}, FK ${cons.fks}, PK ${cons.pks}, UNIQUE ${cons.uniques}`);
    const idx = await one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE indexdef LIKE '% WHERE %')::int AS partial FROM pg_indexes WHERE schemaname = 'public'`);
    check(idx.n === 105 && idx.partial === 5, "all 105 indexes present, including 5 partial unique indexes", `${idx.n} indexes, ${idx.partial} partial`);

    // --- Roles and permissions ---
    const app = await one(`SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'exam_app'`);
    check(app && !app.rolsuper && !app.rolbypassrls && !app.rolcreaterole && !app.rolcreatedb, "exam_app is restricted");
    check(app?.rolcanlogin, "exam_app can log in");
    const memberOf = await rows(`SELECT 1 FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = 'exam_app')`);
    check(memberOf.length === 0, "exam_app belongs to no other role");
    const noMigrations = await one(`SELECT NOT has_table_privilege('exam_app', 'public._prisma_migrations', 'SELECT') AS ok`);
    check(noMigrations.ok, "exam_app cannot read migration history");
    const apiRoles = (await rows(`SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')`)).map((r) => r.rolname);
    for (const r of apiRoles) {
      const exposed = await rows(`SELECT t FROM unnest($1::text[]) t WHERE has_table_privilege($2, format('public.%I', t), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`, [APP_TABLES, r]);
      check(exposed.length === 0, `Supabase role ${r} has no table privileges`, exposed.map((e) => e.t).join(", "));
    }

    // --- Data integrity (holds for any data, including the demo data) ---
    const counts = {};
    for (const t of APP_TABLES) counts[t] = (await one(`SELECT count(*)::int AS n FROM "${t}"`)).n;
    const roleUsers = await rows(`SELECT r.name, count(u.id)::int AS n FROM roles r LEFT JOIN users u ON u.role_id = r.id GROUP BY r.name ORDER BY r.name`);
    check(roleUsers.length === 4 && roleUsers.every((r) => r.n > 0), "every role has at least one user", roleUsers.map((r) => `${r.name} ${r.n}`).join(", "));
    check((await rows(`SELECT 1 FROM exam_attempts GROUP BY exam_id, student_id HAVING count(*) > 1`)).length === 0, "one attempt per student per exam");
    check((await rows(`SELECT 1 FROM attempt_questions aq JOIN question_versions v ON v.id = aq.question_version_id WHERE NOT v.is_locked`)).length === 0, "every question version used in an attempt is locked");
    check((await rows(`SELECT 1 FROM answers a JOIN exam_attempts t ON t.id = a.attempt_id WHERE (a.selected_option_id IS NOT NULL OR a.text_answer IS NOT NULL) AND a.saved_at > t.deadline`)).length === 0, "no saved answer is later than its attempt's deadline");
    check((await rows(`SELECT 1 FROM exam_attempts WHERE status = 'SUBMITTED' AND submitted_at > deadline`)).length === 0, "no attempt was submitted after its deadline");
    check((await rows(`SELECT 1 FROM exam_attempts a JOIN exam_schedules s ON s.id = a.schedule_id WHERE a.base_deadline > s.window_end`)).length === 0, "no base deadline is after the exam window's end");
    check((await rows(`SELECT 1 FROM time_extensions GROUP BY attempt_id HAVING sum(minutes) > 15`)).length === 0, "no attempt has more than 15 minutes of extensions");
    check((await rows(`SELECT 1 FROM exam_attempts a WHERE a.total_extension_minutes <> COALESCE((SELECT sum(minutes) FROM time_extensions e WHERE e.attempt_id = a.id), 0)`)).length === 0, "attempt extension totals match the extension records");
    check((await rows(`SELECT 1 FROM exam_attempts a WHERE a.counted_focus_losses <> (SELECT count(*) FROM focus_events f WHERE f.attempt_id = a.id AND f.is_counted)`)).length === 0, "counted focus losses match the focus events");
    check((await rows(`SELECT 1 FROM exams e WHERE e.results_status = 'PUBLISHED' AND NOT EXISTS (SELECT 1 FROM result_publications p WHERE p.exam_id = e.id)`)).length === 0, "every published exam has a publication");
    check((await rows(`
      SELECT 1 FROM exam_attempts a JOIN exams e ON e.id = a.exam_id
       WHERE e.results_status = 'PUBLISHED' AND a.status = 'SUBMITTED'
         AND NOT EXISTS (SELECT 1 FROM grade_revisions r JOIN result_publications p ON p.id = r.publication_id
                          WHERE r.attempt_id = a.id AND p.publication_number = (SELECT max(publication_number) FROM result_publications WHERE exam_id = e.id))`)).length === 0,
      "every submitted attempt of a published exam is in its latest publication");
    check((await rows(`SELECT 1 FROM answers a JOIN exam_attempts t ON t.id = a.attempt_id JOIN exams e ON e.id = t.exam_id WHERE e.results_status = 'PUBLISHED' AND a.grading_status IN ('NEEDS_REVIEW', 'PENDING_ESSAY', 'AWAITING_SECOND_GRADE', 'DISCREPANCY')`)).length === 0, "no published exam has ungraded answers");
    check((await rows(`SELECT 1 FROM answers a JOIN attempt_questions aq ON aq.id = a.attempt_question_id WHERE a.marks_awarded > aq.marks`)).length === 0, "no answer has more marks than its question");
    check((await rows(`SELECT 1 FROM grades g WHERE g.total_score <> (SELECT COALESCE(sum(marks_awarded), 0) FROM answers WHERE attempt_id = g.attempt_id)`)).length === 0, "grade totals equal the sum of the answer marks");
    check((await rows(`
      SELECT 1 FROM answers a JOIN exam_attempts t ON t.id = a.attempt_id JOIN exams e ON e.id = t.exam_id JOIN question_versions v ON v.id = a.question_version_id
       WHERE v.type = 'ESSAY' AND a.grading_status = 'GRADED' AND e.second_grader_id IS NOT NULL
         AND (SELECT count(*) FROM essay_marks m WHERE m.answer_id = a.id) <> 2`)).length === 0, "graded essays have both a first and a blind second mark");
    check((await rows(`SELECT 1 FROM payments WHERE NOT is_simulated OR (status = 'SUCCESS' AND receipt_number NOT LIKE 'DEMO-%')`)).length === 0, "all payments are simulated with DEMO receipts");
    check((await rows(`SELECT 1 FROM payments GROUP BY student_id, exam_id HAVING count(*) FILTER (WHERE status = 'SUCCESS') > 1`)).length === 0, "at most one successful payment per student per exam");
    check((await rows(`SELECT 1 FROM sms_outbox WHERE NOT is_simulated OR body NOT LIKE '[DEMO]%' OR params ?| ARRAY['password', 'tempPassword', 'temporaryPassword', 'pin', 'demoPin']`)).length === 0, "all SMS messages are simulated, start with [DEMO] and carry no secrets");
    check((await rows(`SELECT 1 FROM users WHERE password_hash !~ '^\\$2[aby]\\$1[0-9]\\$'`)).length === 0, "all passwords are bcrypt hashes (cost 10 or more)");

    console.log("\nRow counts:");
    console.log("  " + APP_TABLES.map((t) => `${t} ${counts[t]}`).join(" | "));
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Check failed to run:", error.message);
  process.exit(1);
});
