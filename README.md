# Online Exam Platform (Project 18)

An online examination platform that Somali universities can run on their own campus network.

Paper exams take long to mark, students can copy from their neighbours, and lecturers get little information about how good their questions are. This platform tackles each problem:
- every student gets their own randomized exam of equal difficulty;
- the server enforces the time limit;
- the system grades automatically where it can;
- invigilators can watch the session live;
- lecturers get question analytics.

> **Status:** the database and the **backend API are complete and tested**. The Next.js frontend is the next stage, so screenshots are not available yet.

![CI](https://github.com/Nafiisamohamed/online-exam-platform/actions/workflows/ci.yml/badge.svg)

---

## Features

| Area | Brief | Status |
|---|---|---|
| Four roles with server-side permission checks on every request | 2, 6.2 | ✅ Done (API) |
| Faculties, courses, enrolment, CSV student import, dropping without losing results | 4.1 | ✅ Done (API) |
| Question bank (MCQ, True/False, short answer, essay), images, versions for used questions | 4.2 | ✅ Done (API) |
| CSV question import with preview, error reasons and duplicate skipping | 4.3 | ✅ Done (API) |
| Exam builder with difficulty rules, enough-questions check and a sample preview | 4.4 | ✅ Done (API) |
| Scheduling: request and approval; conflicts blocked for students, rooms and invigilators | 4.5 | ✅ Done (API) |
| **Fair randomized exams**: different sets, equal difficulty and marks | 3 | ✅ Done, tested |
| **Server-side deadline**: late answers rejected, automatic submission | 3, 4.7 | ✅ Done, tested |
| **Recovery**: same questions, saved answers and remaining time after a reload | 3, 4.7 | ✅ Done, tested |
| Tab-switch logging (only losses of 1 second or more count; warning after 3) | 4.8 | ✅ Done (API). The browser detection is part of the frontend. |
| Invigilator live view, disconnected after 30 s, notes, extensions of up to 15 min | 4.9 | ✅ Done (API) |
| Automatic grading; unmatched short answers marked "Needs review" | 4.10 | ✅ Done |
| Essay grading with a rubric; optional blind second grader | 4.11 | ✅ Done (API) |
| Results with full publication history, change notifications, answer review | 4.12 | ✅ Done (API) |
| Difficulty index, discrimination, statistics, CSV grade export | 4.13 | ✅ Done (API) |
| Dashboard charts from real queries | 6.7 | 🟡 Partial: data endpoints done; the charts are drawn by the frontend |
| Somali and English | 6.8 | 🟡 Partial: SMS, notifications, PDFs and CSV headers are translated by the server; the screens are frontend work |
| Simulated EVC Plus, Zaad and eDahab payments, with a receipt | 7 | ✅ Done (API) |
| Simulated SMS outbox | 7 | ✅ Done |
| Audit log of sensitive actions | 6.2 | ✅ Done |
| Automated tests (one command) and CI | 6.4 | ✅ Done: 257 tests, GitHub Actions |
| Screens (Next.js, mobile layout, language switch) | 6.1, 6.8 | ⏳ Next stage |

## Architecture

```
 Browser (Next.js, next stage)
        │  HTTPS / JSON, HTTP-only session cookie
        ▼
 Express API  backend/src
   routes        modules/*/*.routes.ts     validation (zod), role checks, HTTP shape
   services      modules/*/*.service.ts,   business rules, ownership checks, transactions
                 services/*.ts
   repositories  repositories/*.ts         the only code that queries the database (Prisma)
   adapters      adapters/mobile-money.ts, simulated payment and SMS providers
                 adapters/sms-gateway.ts
   db            db/prisma.ts, db/clock.ts Prisma Client, transactions, clock sync, health check
   jobs        jobs/scheduler.ts         auto-submit at the deadline, payment expiry, SMS status
        │  restricted role exam_app (no owner rights), TLS for Supabase
        ▼
 PostgreSQL 17: campus server (primary) or Supabase (hosted copy)
   35 tables, CHECK constraints, triggers and row-level security as a second line of defence
```

**Layers**
- Screens never touch the database. Routes call services, and services call repositories. Only `src/repositories` and `src/db` use Prisma.
- A service decides where a transaction starts and passes the transaction handle on to the repositories. That way, multi-step changes succeed or fail together.
- `tests/unit/architecture.test.ts` fails if any other file uses Prisma.
- Important rules are enforced twice: by the service and by the database. For example:
  - the answer deadline is also checked by a trigger;
  - used question versions are locked by a trigger;
  - payment status changes are checked by a trigger;
  - result history is append-only.

**Main modules**

| Module | Path |
|---|---|
| auth | `src/modules/auth` |
| users | `src/modules/users` |
| courses | `src/modules/courses` |
| imports | `src/modules/imports` |
| questions | `src/modules/questions` |
| exams and schedules | `src/modules/exams`, `src/modules/schedules` |
| attempts | `src/modules/attempts` |
| invigilation | `src/modules/invigilation` |
| grading | `src/modules/grading` |
| results | `src/modules/results` |
| payments | `src/modules/payments` |
| messages | `src/modules/messages` |
| analytics | `src/modules/analytics` |
| rooms | `src/modules/rooms` |
| grading scale | `src/modules/grading-scale` |

**Core technical challenge**

| Condition | How it is met | Code |
|---|---|---|
| Different sets, equal difficulty | Each rule fixes the type, difficulty and marks. The least-used questions are drawn first, and the order and options are shuffled per student. | `src/services/exam-generator.ts` |
| Late answers rejected | The deadline is set once on the server: min(start + duration, window end) + extensions. Saves are checked by the service and by a database trigger that uses the database clock. | `src/modules/attempts`, `src/services/submission.ts` |
| Resume after a reload | One attempt per student and exam. Reloading returns the frozen question set, the saved answers and the remaining time from the server deadline. | `src/modules/attempts` |

## Technology

| Part | Technology |
|---|---|
| Runtime | Node.js 24 (20 or newer works) |
| API | Express 5.3.0, TypeScript 5.9.3, Zod 4.6.7 |
| Database | PostgreSQL 17 (15+), Prisma ORM 7.10.1 with `@prisma/adapter-pg` |
| Security | bcryptjs 3.0.3 (cost 12), jsonwebtoken 9.0.3 (HTTP-only cookie), helmet 8.3.0, express-rate-limit 8.7.3 |
| Files | csv-parse 7.0.3 (imports), PDFKit 0.20.2 (receipts, result slips), multer 2.5.0 (uploads) |
| Tests | Vitest 4.1.12, supertest 7.3.1, embedded-postgres 17 (throwaway test database) |
| Frontend (next stage) | Next.js, TypeScript, Tailwind CSS |

## Install on a fresh computer

You need **Node.js 20 or newer** and **Git**. Docker and a PostgreSQL installation are not needed to run the tests.

```bash
git clone https://github.com/Nafiisamohamed/online-exam-platform.git
cd online-exam-platform/backend
npm install            # also generates the Prisma Client
npm test               # 257 tests on a throwaway PostgreSQL 17, started automatically
```

## Database setup

1. Copy `backend/.env.example` to `backend/.env`. Never commit `.env`.
2. Point `MIGRATE_DATABASE_URL` at the database owner. Use one of:
   - a campus or local PostgreSQL 17;
   - the Supabase Session Pooler. `npm run db:supabase-login` asks for the password and encodes it for you.
3. Run, from `backend/`:

```bash
npm run db:migrate        # prisma migrate deploy: applies the 3 migrations
npm run db:app-password   # enables the restricted exam_app login and writes DATABASE_URL
npm run db:seed:demo      # optional demo data: Somali names, real cities, USD fees
npm run db:seed:demo:analytics  # optional: 30 more students and a 38-student exam for analytics (loaded on Supabase)
npm run db:check          # read-only health check: every line must say PASS
```

Then set the API settings in `.env`:
- `JWT_SECRET` (at least 32 random characters);
- `DEMO_PAYMENT_PIN`;
- `CORS_ORIGIN`.

`.env.example` lists every setting with placeholders only.

More on the database:
- [docs/database.md](docs/database.md): the tables, rules, triggers and access security.
- [docs/database-environments.md](docs/database-environments.md): campus PostgreSQL vs Supabase, credentials, backups.

### Database diagram (main relationships)

```mermaid
erDiagram
  roles ||--o{ users : has
  faculties ||--o{ courses : offers
  users ||--o{ courses : teaches
  courses ||--o{ enrolments : has
  users ||--o{ enrolments : "is enrolled"
  courses ||--o{ questions : "question bank"
  questions ||--|{ question_versions : "versions"
  question_versions ||--o{ question_options : has
  question_versions ||--o{ accepted_answers : has
  question_versions ||--o{ rubric_criteria : has
  courses ||--o{ exams : has
  exams ||--|{ exam_rules : "selection rules"
  exams ||--o{ exam_schedules : "requested / approved"
  exam_schedules ||--o{ schedule_rooms : in
  exam_schedules ||--o{ schedule_invigilators : watched-by
  exams ||--o{ exam_attempts : "one per student"
  users ||--o{ exam_attempts : sits
  exam_attempts ||--|{ attempt_questions : "frozen question set"
  question_versions ||--o{ attempt_questions : "used as"
  attempt_questions ||--o| answers : "answered by"
  exam_attempts ||--o{ focus_events : "tab switches"
  exam_attempts ||--o{ time_extensions : extended
  answers ||--o{ essay_marks : "graded (first / second)"
  exam_attempts ||--o| grades : "working grade"
  exams ||--o{ result_publications : published
  result_publications ||--|{ grade_revisions : "permanent snapshots"
  users ||--o{ payments : pays
  exams ||--o{ payments : "fee for"
  users ||--o{ sms_outbox : receives
  users ||--o{ notifications : receives
  users ||--o{ audit_logs : "performed"
```

The full list of 35 tables is in [docs/database.md](docs/database.md#tables-35).

## Run the API

```bash
cd backend
npm run dev                  # development: reloads on change, http://localhost:4000/api
npm run build && npm start   # production build
```

**Check it's running:** `GET http://localhost:4000/api/health` answers `{ "status": "ok", "database": "ok", "serverTime": "…" }`.

**Background jobs:** the server runs them every 5 seconds:
- automatic submission at the deadline;
- payment expiry;
- SMS status updates.

## Tests

```bash
cd backend
npm test            # everything: 150 database + 80 API + 27 unit tests
npm run test:api    # API only
npm run test:unit   # pure logic only
npm run verify:db   # non-destructive checks against an existing database, e.g. Supabase
```

- **Where the tests run:** against a fresh, throwaway PostgreSQL 17 (or your own test database), never against Supabase or development data.
- **Coverage:** the three completion conditions, permissions, payments, grading, publication history and more.
- **CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the type check, the tests and the build on every push.
- **Details:** [docs/testing.md](docs/testing.md).

## API reference

Every endpoint, with method, path, roles, request, response and error codes: **[docs/api.md](docs/api.md)**.

## Demo accounts

`npm run db:seed:demo` creates fictional accounts for every role (Somali names, `.test` email addresses that can never receive mail):

| Role | Login |
|---|---|
| Admin / Registrar | `registrar@uni-demo.test` |
| Lecturer | `axmed.samatar@uni-demo.test`, `mustafe.jibriil@uni-demo.test`, `khadra.cilmi@uni-demo.test` |
| Invigilator | `cabdiraxmaan.faarax@uni-demo.test`, `deeqa.aadan@uni-demo.test` |
| Student | `DEMO-2026-0001` … `DEMO-2026-0010` |

**Passwords**
- Each account gets a random password, stored only as a bcrypt hash.
- The plain passwords are written once, to `backend/demo-accounts.local.md` on the machine that ran the seed. Git ignores that file.
- They are not published here, because the hosted demo database is reachable from the internet.
- Judges receive them privately. On demo day, `npm run demo:judge-credentials` issues fresh passwords for one account per role (plus a second lecturer and a second student) and writes them to a private, git-ignored sheet. Running it again after judging changes them, so the judges' passwords stop working. See [docs/demo-data.md](docs/demo-data.md#giving-the-judges-access).

**Simulated payments:** the demo PIN is the `DEMO_PAYMENT_PIN` setting (`1234` in `.env.example`). It is not a real PIN.

See [docs/demo-data.md](docs/demo-data.md) for the full dataset.

## Security

| Area | How it is handled |
|---|---|
| Passwords | bcrypt (cost 12). Temporary passwords must be changed at first login and expire after 7 days. |
| Sessions | JWT in an HTTP-only, SameSite=Strict cookie. A password change or deactivation ends all sessions. |
| Permissions | The role and record ownership are checked on the server for every request. Other people's records return 404. |
| Input | Validated with zod. Uploads are size-limited and type-checked. CSV exports are protected against spreadsheet formulas. |
| Rate limits | On the API, the login and the demo PIN |
| Audit log | Sensitive actions are logged (append-only). Secrets are removed from log details. |
| Database role | The API connects as `exam_app`: not the owner, no RLS bypass, can't disable triggers or alter tables |
| Simulated services | Payments and SMS can only run simulated: the server refuses to start otherwise |
| Secrets | `.env` is ignored by git. `.env.example` contains placeholders only. |

## Known limitations

| Limitation | Notes |
|---|---|
| No frontend yet | The screens, the language switch on screen, the mobile layout, the charts and the screenshots come in the next stage. |
| Campus network rule | It relies on the client IP address. Behind a reverse proxy, set `TRUST_PROXY=true`. |
| Clock offset | The browser shows the time remaining from the server's timer. Network delay of a few hundred milliseconds isn't compensated, so the last-chance warnings appear slightly early. |
| Short-answer matching | It ignores only case and extra spaces, as the brief says. Punctuation differences go to "Needs review". |
| Backup and restore | The exact procedure is in [docs/backup-restore.md](docs/backup-restore.md). It has not been rehearsed yet: the development machine has no PostgreSQL client tools, and Docker and a local installation are excluded. Rehearse it on the campus server. |
| Not built | Real payment and SMS gateways, webcam proctoring and plagiarism checking are out of scope, as the brief says. |
