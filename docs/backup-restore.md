# Backup and restore

How to back up the exam database and restore it, for the campus server (the source of truth during exams) and for the hosted Supabase copy. The two are separate databases with no synchronisation; see [database-environments.md](database-environments.md).

> **Status:** written for this project's exact setup, but **not yet rehearsed**. The development machine has no PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`), and the project rules exclude Docker and a local PostgreSQL installation. Rehearse it once on the campus server, which has these tools, before the first real exam, and record the result at the end of this page.

## What you need

- **PostgreSQL 17 client tools** (`pg_dump`, `pg_restore`, `psql`). They come with every PostgreSQL 17 server installation, so the campus server has them. The tool version must be the **same or newer** than the server's (Supabase runs 17.11).
- **The owner credentials** (`MIGRATE_DATABASE_URL`). Backups need the owner, not `exam_app`.
- **Private storage for the backup files.** They contain password hashes and personal data, so treat them like the database itself. `*.dump` files are ignored by git; never commit or e-mail them.

## 1. Campus database (source of truth)

### When

| When | Why |
|---|---|
| Before and after every examination session | A clean point to go back to on either side of an exam |
| Nightly | Everyday protection |
| Before every migration (`npm run db:migrate`) | A way back if a migration goes wrong |

### Back up

Run as the owner, from any machine that can reach the server:

```bash
pg_dump --format=custom --compress=9 --no-password \
        --file="online_exam_$(date +%Y%m%d_%H%M).dump" \
        "postgresql://exam_owner@localhost:5432/online_exam"
```

- Give the password through `PGPASSWORD` or a `~/.pgpass` file, never on the command line.
- `--format=custom` dumps everything: the schema, the data, the triggers and functions, the row-level security policies, the grants, and Prisma's migration history. `pg_restore` can read it selectively.
- `pg_dump` reads from one consistent snapshot. It doesn't block students who are saving answers, and it changes nothing.

### Keep

- **Copies:** two of each file. One on an external drive, one off campus. A Supabase project is **not** a backup.
- **How long:** at least the last 14 nightly backups, plus every examination-day backup until the results are final.
- **Check after every backup:** `pg_restore --list online_exam_<date>.dump | head`. It must list the tables.

### Restore (into a new, empty database)

```bash
# 1. The application role is cluster-wide; create it once if this server has never had it.
psql "postgresql://postgres@localhost:5432/postgres" -c "CREATE ROLE exam_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS"

# 2. A new, empty database owned by the owner role.
psql "postgresql://postgres@localhost:5432/postgres" -c "CREATE DATABASE online_exam_restored OWNER exam_owner"

# 3. Full restore (schema and data together), as the owner.
pg_restore --dbname="postgresql://exam_owner@localhost:5432/online_exam_restored" \
           --no-owner --role=exam_owner --exit-on-error online_exam_<date>.dump

# 4. Enable the application login again (choose a new password and keep it in the password manager).
psql "postgresql://exam_owner@localhost:5432/online_exam_restored" -c "ALTER ROLE exam_app WITH LOGIN PASSWORD '<new password>'"
```

**Rules**
- **Always do a full restore into an empty database.** `pg_restore` loads the data before it creates the triggers and constraints, so historical rows are restored exactly as they were. That includes answers saved before a deadline that is now in the past, locked question versions and final payments.
- **Never restore data only into a database that already has the schema.** The triggers would reject historical rows, for example `ATTEMPT_DEADLINE_PASSED`.
- **Restore into a new database, check it, then switch.** Never overwrite the live database in place.

### Check the restored copy

Point `MIGRATE_DATABASE_URL` and `DATABASE_URL` at the restored database, for example in a separate shell. Then, from `backend/`:

```bash
npx prisma migrate status   # "Database schema is up to date!"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script   # "This is an empty migration."
npm run db:check            # every line PASS: tables, constraints, triggers, RLS, grants, data integrity
npm run verify:db           # the test suite in non-destructive mode against the restored copy
```

Also compare the row counts printed by `db:check` with the source database. Then point `DATABASE_URL` on the application server at the restored database and restart the API.

## 2. Supabase (hosted copy)

### Supabase's own backups

- Supabase makes its own backups. What is available depends on the plan, so check the project's **Database → Backups** page.
- These backups only protect the hosted copy. They don't replace the campus backups.

### Your own backup of the Supabase project

Use the **Session Pooler** owner connection from `backend/.env` (`MIGRATE_DATABASE_URL`), with full certificate checking against the bundled Supabase CA:

```bash
cd backend
pg_dump --format=custom --compress=9 --schema=public --no-owner \
        --file="supabase_$(date +%Y%m%d_%H%M).dump" \
        "postgresql://postgres.tzrhdwrswkfmqoriztrj@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=certs/supabase-ca-2021.crt"
```

- `--schema=public` takes only this application's tables, functions and policies. It leaves out Supabase's own `auth`, `storage` and similar schemas, which the project doesn't use.
- Prisma's migration history (`public._prisma_migrations`) is included, so `prisma migrate status` works on the restored copy.

### Restore a Supabase dump

| Into | How |
|---|---|
| **Local or campus PostgreSQL 17** | Use the campus restore steps above, with the Supabase dump file. `--no-owner --role=exam_owner` makes `exam_owner` the owner of everything. |
| **A new, empty Supabase project** | Never the main project. Create `exam_app` first (step 1 above, run in that project's SQL editor), then `pg_restore --no-owner --dbname="<new project's Session Pooler owner URL>" supabase_<date>.dump`. Then run `npm run db:app-password` and `npm run db:check`. |

**Grants and policies:** `exam_app`'s grants and the row-level security policies are part of the dump, so they come back with the restore. `db:check` confirms them.

## 3. Copying data between the two environments

Copying is a **manual, one-way replacement**. Nothing is ever merged.

1. Both databases must be on the same migration version (`prisma migrate status`).
2. Back up the source (sections 1 and 2).
3. Restore into a new, empty target database, then check it.
4. Switch the target's `DATABASE_URL` to the restored copy.

## Rehearsal log

| Date | Where | Backup | Restore | Checks | By |
|---|---|---|---|---|---|
| — | Not rehearsed yet | | | | |
