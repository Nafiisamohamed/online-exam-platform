# Automated tests

The test suite checks the database rules (constraints, triggers and indexes) against a real PostgreSQL database, using the same migrations as development and production. It contains 118 tests.

## What you need

- Node.js 20 or newer
- PostgreSQL 13 or newer, running locally
- A PostgreSQL user that can create databases. Without that permission, create the test database once yourself.

## One-time setup

```bash
cd backend
npm install
cp .env.test.example .env.test
```

Edit `backend/.env.test` and set `TEST_DATABASE_URL` to a **dedicated** test database, for example:

```
TEST_DATABASE_URL="postgresql://exam_user:your_password@localhost:5432/online_exam_test?schema=public"
```

If the database doesn't exist, the first test run creates it. To create it yourself instead:

```sql
CREATE DATABASE online_exam_test OWNER exam_user;
```

`.env.test` is ignored by git. Never commit it.

## Running the tests

```bash
cd backend
npm test             # run the whole suite once
npm run test:watch   # re-run tests when files change
```

You can also set `TEST_DATABASE_URL` in the shell instead of using `.env.test`. A value set in the shell takes priority.

## What a test run does

1. **Safety checks.** The run stops before touching any database if:
   - `TEST_DATABASE_URL` is not set;
   - the database name doesn't end in `_test`;
   - it is the same database as `DATABASE_URL` in `backend/.env`.
2. **Rebuild.** It creates the test database if needed, deletes everything in its `public` schema, and applies every migration with `prisma migrate deploy`.
3. **Reference data.** It inserts the four roles (ADMIN, LECTURER, STUDENT, INVIGILATOR).
4. **Tests.** It runs the test files one at a time.

Each run starts from an empty, freshly migrated database, so the suite can be run any number of times with the same result. The development database is never opened.

## How tests stay independent

- Most tests run inside a transaction that is rolled back. Each test also runs inside a savepoint that is rolled back after it, so no test can see another test's rows.
- Four locking tests need two real connections, so they commit their own rows. Those rows are deleted by the rebuild at the start of the next run.
- Some tests need a payment whose expiry has already passed. To create one, `createExpiredPayment()` briefly switches off the `payments_on_insert` trigger. It refuses to run unless the connection is inside a test transaction that is always rolled back, so the switch is always undone and never reaches a real database.
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
| **Total** | | **118** |

Supporting files:

| File | Purpose |
|---|---|
| `vitest.config.mjs` | Test runner settings (Vitest 4.1.12) |
| `tests/global-setup.mjs` | Safety checks, database rebuild, roles |
| `tests/setup-env.mjs` | Loads and checks `TEST_DATABASE_URL` in each test worker |
| `tests/helpers/env.mjs` | Environment loading and safety rules |
| `tests/helpers/db.mjs` | Connections, rolled-back transactions, `expectDbError()` |
| `tests/helpers/fixtures.mjs` | Builders for users, courses, questions, exams, schedules and attempts |
| `tests/helpers/payments.mjs` | One helper per step of the simulated payment flow |

## Supabase (planned, not yet set up)

The tests currently run against a local PostgreSQL 17 database only. Every Supabase database is named `postgres`, so the `_test` name check refuses any Supabase database, including production. Running the suite against a dedicated Supabase test project will need an approved change to the safety check and to the reset step. Until then, don't point `TEST_DATABASE_URL` at Supabase.

## Adding a test

1. Pick the file for the area, or add a new `tests/db/<area>.test.mjs`.
2. Inside a `describe` block, call `const db = useRollbackDb();` once.
3. Build the rows you need with the fixture builders.
4. Check that a rule rejects something with `await expectDbError(db, () => ..., "<code, message code or constraint name>")`.
