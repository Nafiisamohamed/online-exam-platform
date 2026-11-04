# Database environments

The platform uses two separate database environments. Both run the same migrations and the same roles; only the connection settings differ.

| Environment | Database | Purpose |
|---|---|---|
| **Campus (primary)** | PostgreSQL 17 on a campus server | Official deployment. All examinations run here. Works with no internet connection, as the brief requires. |
| **Hosted** | Supabase PostgreSQL, a separate project | Remote access, staging and shared demos. Never used to run live examinations. |
| **Tests** | A dedicated `*_test` database on local PostgreSQL 17, and optionally a separate Supabase test project | Automated tests only (see [testing.md](testing.md)) |

## They are separate databases

**Local PostgreSQL and Supabase are completely separate databases. There is no automatic synchronization between them.**

- A change made in one (a new user, an answer, a grade, a payment) does **not** appear in the other.
- The campus database is the **source of truth** for everything that happens during examinations.
- Data moves between them only through a **manual, one-way copy** made by an administrator (see [Copying data between environments](#copying-data-between-environments)).
- Never run the same examination in both environments, and never let users work in both at the same time and expect the results to merge.

## Why examinations run on the campus database

The brief requires the platform to run on the local campus network. If the examination database were in the cloud:

- a campus internet outage would stop answer saving, the server-side timer and auto-submit;
- deadlines are enforced by the server, so answers waiting in browsers could arrive too late to count;
- every database call would cross the internet, which adds delay when many students save answers at the same time;
- the live demo would depend on the venue's internet connection.

With PostgreSQL 17 on the campus server, examinations keep working with no internet connection.

## Credentials

Each environment has two database roles. See [database.md](database.md#access-security).

| Setting | Role | Where it is set |
|---|---|---|
| `DATABASE_URL` | `exam_app`, the restricted application role | The application server's `backend/.env` |
| `MIGRATE_DATABASE_URL` | The database owner (`exam_owner` locally, `postgres` on Supabase) | Only on the administrator's machine, and only while running migrations. **Never on the application server.** |

- Passwords are kept in a password manager, never in git.
- The Supabase `anon` and `service_role` API keys are not used by this project.

## Local PostgreSQL 17 setup

Run this once, as a PostgreSQL superuser such as `postgres`:

```sql
CREATE ROLE exam_owner LOGIN PASSWORD '<owner password>' NOSUPERUSER CREATEROLE NOCREATEDB;
CREATE DATABASE online_exam OWNER exam_owner;
```

Then, from `backend/`, with `MIGRATE_DATABASE_URL` pointing at `exam_owner`:

```bash
npm run db:migrate
```

The migrations create the `exam_app` role without a password. Enable its login once, as `exam_owner`:

```sql
ALTER ROLE exam_app WITH LOGIN PASSWORD '<application password>';
```

Finally, set `DATABASE_URL` in `backend/.env` to `exam_app` with that password.

## Supabase setup (hosted environment)

Not done yet. When approved:

1. Create the production project in the region closest to Somalia, and confirm PostgreSQL 17 under **Settings → Infrastructure**.
2. Turn off the Data API under **Project Settings → Data API**, before any table exists.
3. Make sure all tests pass locally, and that `prisma migrate diff` shows no drift.
4. Set `MIGRATE_DATABASE_URL` in the shell (not in a file) to the owner connection:
   - the direct connection, port 5432 (requires IPv6);
   - or the session pooler, port 5432, if your network has no IPv6.
5. Run `npx prisma migrate status` and confirm no migrations are applied yet.
6. Run `npx prisma migrate deploy`. Only `deploy`; never `migrate dev` or `migrate reset` on Supabase.
7. Verify:
   - `migrate status` reports the database is up to date;
   - `migrate diff` reports no drift;
   - **Advisors → Security Advisor** shows no "RLS disabled" errors.
8. In the SQL editor, enable login for the app role: `ALTER ROLE exam_app WITH LOGIN PASSWORD '<generated>';`
9. On the server that connects to Supabase, set `DATABASE_URL` to the `exam_app` pooler connection:
   - user `exam_app.<project-ref>`;
   - session pooler, port 5432;
   - add `sslmode=require`.

   Then remove `MIGRATE_DATABASE_URL` from the shell.

Before step 1 is done for production, the same procedure is run on a separate Supabase **test** project (see [testing.md](testing.md#supabase-test-project)).

## Backups and restoration (proposed process)

This process is proposed and not yet implemented. Nothing synchronizes automatically.

### Campus database (the source of truth)

- **When:** a full backup before and after every examination session, plus nightly.
- **Command** (as the owner):

  ```bash
  pg_dump --format=custom --file=online_exam_<date>_<time>.dump "$MIGRATE_DATABASE_URL"
  ```

- **Where:** copy each backup to two places, an external drive and an off-campus location. A Supabase project is not a backup.
- **Retention:** at least the last 14 nightly backups, plus every examination-day backup until results are final.
- **Restore check:** once a month, restore the latest backup into a new, empty scratch database and confirm `prisma migrate status` reports it up to date.

### Restoring

- Restore a **full** backup (structure and data together) into an **empty** database:

  ```bash
  createdb online_exam_restored
  pg_restore --dbname=online_exam_restored online_exam_<date>.dump
  ```

- A full restore loads the data before it recreates the triggers, so historical rows (late answers, final payments, locked questions) are restored as they were.
- **Never** restore data only into a database that already has the schema. The triggers would reject historical rows, for example answers after their deadline.
- After restoring, check the `exam_app` role and its login, then point `DATABASE_URL` at the restored database.

### Supabase (hosted environment)

- Supabase makes its own backups. What is available depends on the plan, so check the project's **Database → Backups** page.
- Supabase backups protect the hosted copy only. They don't replace the campus backups.

### Copying data between environments

Copying data, for example from campus to Supabase for a remote demo, is a **manual, one-way** operation:

1. Both databases must be on the same migration version (`prisma migrate status`).
2. Take a full backup of the source.
3. Restore it into an empty target database, using the full-restore rules above.
4. The copy replaces the target's data. Nothing is merged.

The exact restore options for Supabase must be tested on the Supabase test project first. On Supabase the owner is not a superuser, so object ownership and grants may need the `--no-owner` and `--no-privileges` options and a re-run of the access-security grants.
