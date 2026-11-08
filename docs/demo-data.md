# Demo data

`npm run db:seed:demo` (from `backend/`) loads fictional demo data for demonstrations and manual testing. It is loaded in the hosted Supabase project.

- **Fictional:** Somali names, real cities (Muqdisho, Hargeysa), USD amounts and a fictional institution, shown in the platform as "Online Examination System".
- **Connects as `exam_app`**, so the data is created with exactly the application's permissions.
- **Safe:** it never changes or deletes existing data, refuses to run twice, and runs in one transaction. If any step fails, nothing is saved.
- **Script:** [backend/scripts/seed-demo-data.mjs](../backend/scripts/seed-demo-data.mjs).

## Demo accounts

| Role | Name | Login |
|---|---|---|
| ADMIN (registrar) | Sahra Cabdirashiid Mire | `registrar@uni-demo.test` |
| LECTURER | Dr. Axmed Xirsi Samatar (CS201) | `axmed.samatar@uni-demo.test` |
| LECTURER | Dr. Mustafe Cabdi Jibriil (CS105, blind second grader for CS201) | `mustafe.jibriil@uni-demo.test` |
| LECTURER | Dr. Khadra Maxamuud Cilmi (BA110) | `khadra.cilmi@uni-demo.test` |
| INVIGILATOR | Cabdiraxmaan Nuur Faarax | `cabdiraxmaan.faarax@uni-demo.test` |
| INVIGILATOR | Deeqa Xuseen Aadan | `deeqa.aadan@uni-demo.test` |
| STUDENT | Hodan Maxamed Cali … Yaasiin Ibraahim Guuleed (10 students) | `DEMO-2026-0001` … `DEMO-2026-0010` |

**Passwords**
- Each account gets a random 16-character password, stored in the database only as a bcrypt hash (cost 12).
- The plain passwords are written once, to `backend/demo-accounts.local.md` on the machine that ran the seed.
- That file is ignored by git. **Never commit or publish it.**
- Don't put them in the README for a database that is reachable on the internet.

### Giving the judges access

On demo day, run from `backend/`:

```bash
npm run demo:judge-credentials -- --list   # shows the accounts it will use; changes nothing
npm run demo:judge-credentials             # issues fresh passwords for them
```

**What the script does:**
- **Accounts:** it picks one account for every role, plus a second lecturer (the blind second grader) and a second student (Demo 2). That's 6 accounts.
- **Passwords:** new random ones, stored only as bcrypt hashes. Old sessions of these accounts end at once.
- **Output:** a private sheet, `backend/judges-credentials.local.md`. It's ignored by git and nothing is printed on screen.
- **Audit log:** it records that credentials were issued, never the passwords themselves.

**Handing them over:**
- Give the sheet to the judges directly: printed, or in a private message.
- **Run the script again after judging.** That changes the passwords, so the ones the judges saw stop working.

The script was rehearsed on an isolated database: the 6 new passwords work, the old ones stop working, and the audit entry contains no password.

`.test` email addresses are reserved and can never receive mail.

## What is in the data

| Area | Contents |
|---|---|
| Faculties and courses | Faculty of Computing (CS201 Database Systems, CS105 Introduction to Programming) and Faculty of Economics and Management (BA110 Principles of Accounting), semester `2026-Fall` |
| Enrolments | 23. Student `DEMO-2026-0005` dropped CS201 **after** sitting the midterm, and their result is kept. |
| Question banks | 29 questions: MCQ (4 and 5 options), True/False, short answer with accepted answers, and essays with rubrics. One CS201 question was edited after use and has a version 2, while the midterm keeps version 1. 2 import batches show a CSV import with one invalid and one duplicate row. |
| Rooms | Lab A (Mogadishu campus, `10.10.4.0/24`) and Hall 2 (Hargeisa campus, `10.20.1.0/24`) |
| CS201 Midterm | Held **yesterday**, 09:00–11:00 Mogadishu time, 60 minutes, approved. 5 students sat it, each with a **different random set of 9 questions with the same difficulty and marks mix** (24 marks), and 3 enrolled students were absent. Also included: a 10-minute time extension (power cut) for one student, tab-switch events (one student with 3 counted switches and an invigilator note), and one unanswered question. |
| Grading | Auto-graded MCQ/TF/short answers, short answers needing review graded by the lecturer, and essays marked by the first and blind second graders (final mark = average). Results were **published twice**: publication 2 is a regrade after a review request, and every grade revision is kept. |
| CS201 Final | In 7 days, 5.00 USD fee, two rooms, approved after an earlier rejected request (room clash) |
| Simulated payments | EVC Plus, Zaad and eDahab: 4 successful (one after a wrong PIN), 1 failed after 3 wrong PINs and then paid on retry, 1 cancelled, 1 left open (expires after 5 minutes). All receipts are `DEMO-…`. |
| Other exams | CS105 Quiz 1 (schedule requested, waiting for approval) and BA110 Midterm (draft) |
| Messages | 27 simulated SMS messages (`[DEMO]`, Somali or English per user, delivered/sent/queued/failed), 13 in-app notifications, 10 audit log entries |

**Midterm results:**

| Student | Score |
|---|---|
| `DEMO-2026-0001` | 21.5/24 (B) |
| `DEMO-2026-0002` | 20.5/24 (B) |
| `DEMO-2026-0003` | 18.5/24 (C) |
| `DEMO-2026-0004` | 13.5/24 (F) |
| `DEMO-2026-0005` | 17.5/24 (C) |

`DEMO-2026-0004`'s result changed in the regrade, from 12.5 to 13.5.

**Dates are relative to the day the seed ran** (the midterm is the day before, the final 7 days after).

## Larger dataset for analytics (optional)

**Loaded in the Supabase main project on 2026-11-04.**

Checked after the run:
- **Nothing existing changed:** every existing row was fingerprinted before and after the run. The only changes were 6 existing CS105 question versions, which the database locked because the new exam drew them. This is the normal lock-on-use rule.
- **Health checks:** `db:check` passes every check.
- **Second run:** refused.
- **Analytics:** all 21 questions show figures, both highlights appear, and the average is 70.8%.
- **Logins:** all 30 new student logins work.

`npm run db:seed:demo:analytics` adds a completed exam large enough for meaningful question analytics. Each question needs at least 5 answers (4.13), and the base data's midterm has only 5 students with different random question sets. The script needs the base demo data, adds rows only, refuses to run twice and runs in one transaction.

| Adds | Contents |
|---|---|
| Students | 30 more (`DEMO-2026-0011` … `DEMO-2026-0040`), 40 in total, all enrolled in CS105. Passwords are appended to `backend/demo-accounts.local.md`. |
| Questions | 15 more CS105 questions (MCQ, True/False, short answer), 44 in total |
| Exam | **CS105 Practice Test 1**, held 3 days ago, 13:00–15:00. 38 students sat it (2 absent). Results are published and answer review is on. |
| Analytics | Every question has 12–19 answers. One is answered correctly by everyone (over 95%) and one by about 10% (under 20%), so both highlights appear. The score distribution runs from 33% to 100%. |

Rehearsed first on an isolated local database: `npm run db:check` passed every check afterwards.

## Checking the data

`npm run db:check` runs read-only integrity checks on any migrated database, for example:
- one attempt per student per exam;
- no answer saved after its deadline;
- extensions of at most 15 minutes;
- locked question versions;
- complete publications;
- grade totals;
- simulated payments and messages only;
- bcrypt-hashed passwords.
