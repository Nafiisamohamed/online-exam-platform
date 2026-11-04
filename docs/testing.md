# Automated tests

The test suite checks the database rules (constraints, triggers, indexes, roles and row-level security) against a real PostgreSQL database, using the same migrations as development and production.

- **150 tests** run everywhere.
- **3 more** run only on the Supabase test project, where Supabase's API roles exist.

## What you need

- Node.js 20 or newer
- PostgreSQL 15 or newer, running locally. Use PostgreSQL 17, the version used for development and testing.
- A test owner role that is **not** a superuser, with permission to create roles

## One-time setup

As a PostgreSQL superuser, create the test owner and a dedicated test database it owns:

```sql
CREATE ROLE exam_owner LOGIN PASSWORD '<password>' NOSUPERUSER CREATEROLE NOCREATEDB;
CREATE DATABASE online_exam_test OWNER exam_owner;
```

`exam_owner` can be the same role that owns the development database; only the database must be separate.

Then:

```bash
cd backend
npm install
cp .env.test.example .env.test
```

Set `TEST_DATABASE_URL` in `backend/.env.test` to that database, connecting as `exam_owner`:

```
TEST_DATABASE_URL="postgresql://exam_owner:<password>@localhost:5432/online_exam_test?schema=public"
```

`.env.test` is ignored by git. Never commit it.

## Running the tests

```bash
cd backend
npm test             # run the whole suite once (local PostgreSQL)
npm run test:watch   # re-run tests when files change
```

You can also set `TEST_DATABASE_URL` in the shell instead of using `.env.test`. A value set in the shell takes priority.

## Verification mode (existing databases)

```bash
cd backend
npm run verify:db    # checks the database in MIGRATE_DATABASE_URL, without changing it
npm run db:check     # read-only structure, security and data-integrity report
```

`npm run verify:db` runs the same test files against an **already migrated** database: local, the Supabase main project, or a restored copy. It is non-destructive:

- **No reset and no migrations.** Before any test runs, it only checks, read-only, that every migration is applied and the four roles exist.
- **Every write is rolled back.** All writes happen inside transactions, and the row counts are the same before and after.
- **4 tests are skipped.** These are the locking tests that need two connections and must commit rows.
- **The 3 Supabase-only checks run automatically** when the host is a Supabase host.

It connects as the owner (`MIGRATE_DATABASE_URL`), because some tests switch to `exam_app` or briefly switch off a trigger, always inside a rolled-back transaction.

**Last results:** Supabase main project, 2026-11-04:
- `verify:db`: 149 passed, 4 skipped, row counts unchanged;
- `db:check`: every check passed.

## What a test run does

1. **Safety checks.** The run stops before deleting anything if any rule below fails.
2. **Reset.** It drops the application's own objects in `public`: tables, enum types and `oe_*` trigger functions owned by the test user, including Prisma's migration history. The schema itself and anything owned by other roles are left alone. It stops if tables owned by someone else remain.
3. **Migrate.** It applies every migration with `prisma migrate deploy`, as the test user.
4. **Reference data.** It inserts the four roles (ADMIN, LECTURER, STUDENT, INVIGILATOR).
5. **Tests.** It runs the test files one at a time.

Each run starts from a freshly migrated database, so the suite can be run any number of times with the same result. Development and production data are never touched.

## Safety rules

| Mode | Command | Settings file | The run refuses to start unless |
|---|---|---|---|
| Local | `npm test` | `backend/.env.test` | the database name ends in `_test`; the host is not a Supabase host; `TEST_SUPABASE_PROJECT_REF` is not set |
| Supabase test project | `npm run test:supabase` | `backend/.env.supabase-test` | `TEST_SUPABASE_PROJECT_REF` is set and appears in `TEST_DATABASE_URL`, **and** the database contains `test_guard.marker` holding that same project ref |

In both modes, the test database must also differ from `DATABASE_URL` and `MIGRATE_DATABASE_URL` in `backend/.env`.

The main Supabase project (`tzrhdwrswkfmqoriztrj`) is on a block list in `tests/helpers/env.mjs`. The tests refuse it in both modes, even if a marker table were added there by mistake.

## How tests stay independent

- Most tests run inside a transaction that is rolled back. Each test also runs inside a savepoint that is rolled back after it, so no test can see another test's rows.
- Four locking tests need two real connections, so they commit their own rows. The reset at the start of the next run removes them.
- Some tests need a payment whose expiry has already passed. To create one, `createExpiredPayment()` briefly switches off the `payments_on_insert` trigger. It refuses to run unless the connection is inside a test transaction that is always rolled back, so the switch is always undone.
- The access-security tests switch to the application role with `SET LOCAL ROLE exam_app` inside the rolled-back transaction, so they have the application's exact table privileges and RLS view.
  - One exception: `SET ROLE` is decided by the role that **logged in**, and these tests log in as the owner.
  - So "exam_app can't become the owner" is checked in PostgreSQL's catalog instead: `exam_app` is a member of no role at all.
- A test that expects the database to reject something uses `expectDbError()`. It checks for one specific error (an SQLSTATE code, a trigger message code such as `PAYMENT_EXPIRED`, or a constraint name) and then undoes the failed statement.

## Test files

| File | Area | Tests |
|---|---|---|
| `tests/db/constraints.test.mjs` | Answer ownership, attempts, focus events, question bank, exams, schedules, rooms, enrolment, append-only history, SMS outbox | 30 |
| `tests/db/question-locking.test.mjs` | Locked question versions, including locking inside the selection transaction and a concurrent edit | 11 |
| `tests/db/exam-deadlines.test.mjs` | Saving answers before and after the deadline or submission, time extensions, effective deadline | 15 |
| `tests/db/language.test.mjs` | Somali default, switching to English, unsupported languages | 3 |
| `tests/db/payments.test.mjs` | Simulated-only records, duplicates, new payments, status flow, fixed fields, receipts | 15 |
| `tests/db/pin-attempts.test.mjs` | Demo PIN attempt counter | 15 |
| `tests/db/cancellation-expiry.test.mjs` | 5-minute expiry, actions after expiry, cancellation, final outcomes | 29 |
| `tests/db/access-security.test.mjs` | RLS, policies and exact grants on every table; the `exam_app` role's allowed and forbidden actions (including triggers, constraints, RLS, policies and migration history); roles without a policy | 32 (+3 Supabase only) |
| **Total** | | **150 (+3)** |

Supporting files:

| File | Purpose |
|---|---|
| `vitest.config.mjs` | Test runner settings (Vitest 4.1.12) |
| `tests/global-setup.mjs` | Safety checks, Supabase marker check, reset, migrations, roles |
| `tests/setup-env.mjs` | Loads and checks the test settings in each test worker |
| `tests/run-supabase.mjs` | Runs the suite with `backend/.env.supabase-test` (`npm run test:supabase`) |
| `tests/helpers/env.mjs` | Settings loading and safety rules for both modes |
| `tests/helpers/db.mjs` | Connections, rolled-back transactions, `expectDbError()` |
| `tests/helpers/fixtures.mjs` | Builders for users, courses, questions, exams, schedules and attempts |
| `tests/helpers/payments.mjs` | One helper per step of the simulated payment flow |

## Supabase test project

Not set up yet. When approved:

1. Create a **separate** Supabase project used only for tests. Never use the production project.
2. In that project's SQL editor only, create the marker once:

   ```sql
   CREATE SCHEMA test_guard;
   CREATE TABLE test_guard.marker (project_ref text PRIMARY KEY);
   INSERT INTO test_guard.marker VALUES ('<test project ref>');
   ```

3. Copy `backend/.env.supabase-test.example` to `backend/.env.supabase-test` and fill in:
   - the test project's owner connection: the direct connection, or the session pooler (port 5432) if your network has no IPv6, with `sslmode=require`;
   - its project ref.
4. Run `npm run test:supabase`.

Expect slower runs because of network latency. Free projects pause after a period of inactivity, so wake the project first. Everyday testing and CI stay on local PostgreSQL 17.

## Adding a test

1. Pick the file for the area, or add a new `tests/db/<area>.test.mjs`.
2. Inside a `describe` block, call `const db = useRollbackDb();` once.
3. Build the rows you need with the fixture builders.
4. Check that a rule rejects something with `await expectDbError(db, () => ..., "<code, message code or constraint name>")`.
5. A new table needs, in its own migration: RLS enabled, an `exam_app` policy, the right `exam_app` grants, and the table name added to `APP_TABLES` in `access-security.test.mjs`. The access-security tests check the exact list of tables, so they fail if any of these is missing.
