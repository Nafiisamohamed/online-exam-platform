# Database environments

The platform uses two separate database environments. Both run the same migrations and the same roles; only the connection settings differ.

| Environment | Database | Purpose |
|---|---|---|
| **Campus (primary)** | PostgreSQL 17 on a campus server | Official deployment. All examinations run here. Works with no internet connection, as the brief requires. |
| **Hosted** | Supabase PostgreSQL, a separate project | Remote access, staging and shared demos. Never used to run live examinations. |
| **Tests** | A dedicated `*_test` database on local PostgreSQL 17, and optionally a separate Supabase test project | Automated tests only (see [testing.md](testing.md)) |

## Supabase projects

These details are not secret. Passwords and full connection strings are never written here.

| | Main project (hosted environment) | Test project |
|---|---|---|
| Name | `online exam platform` | Not created yet (e.g. `online-exam-test`) |
| Project ref | `tzrhdwrswkfmqoriztrj` | — |
| Region | Frankfurt (`eu-central-1`) | Should be the same region |
| PostgreSQL | 17.11 | — |
| Connection | Session Pooler | Session Pooler |
| Pooler host | `aws-1-eu-central-1.pooler.supabase.com`, port `5432` | — |
| Database | `postgres` | `postgres` |
| Owner user (pooler) | `postgres.tzrhdwrswkfmqoriztrj` | `postgres.<test-project-ref>` |
| App user (pooler) | `exam_app.tzrhdwrswkfmqoriztrj` (verified: logs in through the pooler) | `exam_app.<test-project-ref>` |
| Status | **Migrated and populated (2026-11-04).** All 3 migrations applied, `exam_app` login enabled, demo data loaded (see [demo-data.md](demo-data.md)). Every health check and verification test passed. | Not created (optional) |

The main project is on the test runner's block list (`BLOCKED_SUPABASE_PROJECT_REFS` in `backend/tests/helpers/env.mjs`), so the tests refuse it even if a marker table were ever added there by mistake.

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
| `MIGRATE_DATABASE_URL` | The database owner (`exam_owner` locally, `postgres` on Supabase) | Only on the administrator's machine, in `backend/.env` or the shell. **Never on the application server.** |

- `backend/.env` is ignored by git. `backend/.env.example` shows every variable, with placeholders only.
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

### Creating new migrations

Run `npm run db:migrate:dev -- --name <change>` against **local** PostgreSQL only.

- The command goes through `backend/scripts/require-local-db.mjs`, which refuses to run unless `MIGRATE_DATABASE_URL` points at `localhost`, `127.0.0.1` or `::1`.
- `prisma migrate dev` may offer to reset the database. Never run it against Supabase.
- It also needs a temporary "shadow" database. The owner role therefore needs `CREATEDB` while creating migrations, or a separate shadow database must be configured.

There is no `db:reset` script. Wiping a database is never a one-word command in this project.

## Supabase setup (hosted environment)

Done for the main project on 2026-11-04. To set up another Supabase project, or to repeat it, run these from `backend/`:

1. Turn off the Data API under **Project Settings → Data API**, before any table exists.
2. Set the owner connection, either:
   - by running `npm run db:supabase-login`, which asks for the password with hidden typing and encodes it; or
   - by writing this line in `backend/.env` yourself, with the password URL-encoded:

   ```
   MIGRATE_DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require&sslcert=certs/supabase-ca-2021.crt&sslaccept=strict&connect_timeout=30"
   ```

3. `npx prisma migrate status`: read-only; lists the migrations not yet applied.
4. `npm run db:migrate` (`prisma migrate deploy`). Only `deploy`; never `migrate dev`, `db push` or `migrate reset` on Supabase.
5. `npm run db:app-password`: enables the `exam_app` login with a random password. The password is sent only as a SCRAM-SHA-256 hash, and the script writes `DATABASE_URL` (user `exam_app.<project-ref>`) into `backend/.env`.
6. `npm run db:seed:demo`: optional demo data (see [demo-data.md](demo-data.md)).
7. `npm run db:check`: read-only health check. Every line must say PASS.
8. `npm run verify:db`: the test suite in non-destructive verification mode (see [testing.md](testing.md#verification-mode-existing-databases)).
9. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` must print "This is an empty migration" (no drift).
10. Check **Advisors → Security Advisor**: no "RLS disabled" errors. An informational note that `_prisma_migrations` has RLS but no policy is expected.

### Verified on Supabase (main project, PostgreSQL 17.11)

| Question | Result |
|---|---|
| Can Supabase's `postgres` owner create `exam_app`, grant itself membership and set grants? | ✅ Yes. The security migration applied without errors. |
| Do the revokes for `anon`, `authenticated` and `service_role` (including default privileges) work? | ✅ Yes. None of the three has any privilege on any application table. |
| Do the migrations apply with `prisma migrate deploy` through the Session Pooler? | ✅ Yes, all 3. Status is up to date, with no drift. |
| Does the pooler accept `exam_app.<project-ref>`? | ✅ Yes |
| Prisma Client 7.10.1 with `@prisma/adapter-pg` | ✅ Connects as `exam_app`, reads, and writes inside a transaction |
| Node `pg` and `sslmode=require` | ⚠️ `pg` treats `require` as "verify the certificate", and Supabase's certificates are signed by **Supabase Root 2021 CA**, which Node doesn't trust by default. **The CA certificate is required.** `backend/certs/supabase-ca-2021.crt` is Supabase's published root CA (SHA-256 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`, valid until 2031-04-26). The pooler's chain verifies against it. All our Node code verifies Supabase hosts against it (`scripts/lib/pg-connection.mjs`); verification is never disabled. |
| Prisma CLI TLS | Needs `sslcert=certs/supabase-ca-2021.crt&sslaccept=strict` (path relative to `backend/`) and `connect_timeout=30`. The TLS handshake to Frankfurt took about 9 seconds, longer than Prisma's 5-second default. |

The Express application will use the same `pgClientConfig()` settings when it creates its `PrismaPg` adapter.

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
