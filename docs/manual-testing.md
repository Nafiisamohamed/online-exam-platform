# Manual testing guide

How to try the whole Online Examination System by hand: where to open it, which accounts to use, five demo scenarios that follow one semester from set-up to published results, what you should see at each step, and the known limitations.

> **Everything you do here is saved in the real database.** Exams, payments, messages and Activity History entries you create stay there permanently: nothing is ever deleted, only switched off or cancelled. Give anything you create for testing a clear name, for example "Test – Quiz A".
>
> Payments and SMS are **simulated**: no money moves and no text message leaves the system.

## 1. Open the application

| What | Where |
|---|---|
| Application (sign-in page) | **http://localhost:3000/sign-in** |
| API health check | http://localhost:3000/api/health should show `"status":"ok","database":"ok"` |

The language switch (**SO / EN**) and the light/dark switch are at the top right of every page.

## 2. Demo accounts

Sign in with the **username** (the account number). Passwords are not in this repository: they are in the private file `backend/demo-accounts.local.md` on the computer that created the accounts.

| Role | Username(s) | What they do |
|---|---|---|
| Registrar (admin) | `R-2026-001` | Academic years, faculties, courses, registrations, fees, rooms, schedule approval, results search, SMS, Activity History |
| Lecturer | `T-2026-001` (CS201, CIL12), `T-2026-002` (BA110), `T-2026-003` (CS105) | Question bank, exams, schedule requests, grading, results, analytics |
| Invigilator | `I-2026-001`, `I-2026-002` | Exam sessions, live monitoring, extensions, notes |
| Student | `S-2026-001` … `S-2026-013` and more | Courses, exams, payments, results |

Students enrolled in CS201: `S-2026-001` … `S-2026-004`, `S-2026-006` … `S-2026-008` and `S-2026-070`. CS105 has all 41 students.

**Demo payment PIN:** `1234` (the `DEMO_PAYMENT_PIN` setting; it is not a real PIN).

**Sign-in limit:** 10 failed sign-ins in 15 minutes for one username blocks that username for a while.

## 3. What is in the database now

- Faculties **FC** (Computing) and **FEM** (Economics and Management), 4 courses, 41 students, 3 lecturers, 2 invigilators.
- **No academic year, semester registration or semester fee exists yet.** The four courses were created before academic years existed. Scenario 1 sets these up with values *you* choose; the system never invents them.
- **No question is marked reviewed yet.** Exams published from now on use reviewed questions only, so a lecturer reviews questions first (Scenario 2).
- 9 earlier exams with their types (Quiz, Midterm, Final), 11 earlier exam-fee payments with receipts, published results for 2 exams.
- Upcoming: **CS201 Final Examination** is approved for **11 Nov 2026, 09:00–12:00** (Mogadishu time). Students of CS201 can't be given another exam that overlaps this window.
- Rooms **Lab A** and **Hall 2** exist without a known capacity.

## 4. Five demo scenarios

Do them in order; each one uses what the one before set up. Times are Mogadishu time.

### Scenario 1 – The registrar prepares a semester (`R-2026-001`)

| Step | Where | Expected result |
|---|---|---|
| 1. Add the academic year you want (for example `2026/2027`, start and end dates), then **Make current** | Academic years | The year shows the **Current** badge. A second year can't be current at the same time. |
| 2. Open a course (for example **CS105**) and give it the academic year and a semester (1–8) | Courses → course | The course shows "2026/2027 · Semester N". |
| 3. Register students for that faculty, year and semester (one by one, or several) | Student registration | Each student is listed once per year and semester; registering the same student again is refused. |
| 4. **Enrol group in its courses** | Student registration | The registered students are enrolled in every course of that faculty, year and semester; already-enrolled students are skipped. |
| 5. Give **Lab A** a capacity (for example 30) | Rooms | The capacity shows; rooms can be switched off but not deleted. |
| 6. **Add fee** for the faculty and semester, with the amount the university decided | Fees | The fee appears under "Fees for this academic year". The status list shows the registered students as **Not paid**. |

### Scenario 2 – The lecturer builds and schedules an exam (the course's lecturer, e.g. `T-2026-003` for CS105)

| Step | Where | Expected result |
|---|---|---|
| 1. Filter on **Draft** (not reviewed), open questions and **Mark reviewed** | Question bank | The progress badge counts up (reviewed / target 40). Editing a reviewed question clears its review. |
| 2. **New exam**: choose the course, **exam type** (Quiz, Midterm or Final), title and question rules | Exams → New exam | Without an exam type the form can't be saved. A rule that asks for more reviewed questions than exist shows an error. |
| 3. Open the exam, **untick** one or two questions in the question selection | Exams → exam | Unticking is refused when too few questions would be left for a rule. |
| 4. **Publish** | Exams → exam | Status becomes Published; the exam type is now fixed. |
| 5. **Request schedule**: a window that starts in the future (e.g. today, 20 minutes from now, 1 hour long) and the room | Exams → exam | The duration is worked out from the window (here 60 minutes). Switched-off rooms can't be chosen. |
| 6. As the registrar: **Approve** the request | Schedule requests | Approved. With a room of known capacity that is too small, approval is refused; with a room of unknown capacity, the registrar must confirm first. Students get a simulated SMS and a notification. |

### Scenario 3 – The student pays and sits the exam (a student registered in Scenario 1)

| Step | Where | Expected result |
|---|---|---|
| 1. Open the exam | My exams | The card shows what part of the semester fee this exam type needs: **Quiz 30 %, Midterm 50 %, Final 100 %**, and how much is still to pay. |
| 2. **Pay semester fee** with *less* than needed (choose EVC Plus, Zaad or eDahab, any Somali number, accept on the "phone", PIN `1234`) | Payments | Payment succeeds; a receipt can be downloaded saying "Simulated payment – no money was transferred." The exam still asks for the rest. |
| 3. Pay the rest | Payments | Paid amount, outstanding balance and the progress bar update; the exam can now be started (when its window is open). Paying more than the balance is refused. |
| 4. When the window opens, **Start** | My exams → exam | The exam opens full-screen with a server timer. Each answer shows "Saved". |
| 5. Reload the page | Exam screen | The same questions, the saved answers and the remaining time come back. |
| 6. Switch to another tab or window for 2+ seconds, twice | Exam screen | A warning after the 1st and 2nd switch. (The 3rd ends the exam: "Examination Terminated". Saved answers are kept.) |
| 7. **Submit** | Exam screen | Confirmation, then the exam shows as submitted. Answers can't be changed after the deadline. |

### Scenario 4 – Invigilation, grading and results

| Step | Who / where | Expected result |
|---|---|---|
| 1. Assigned invigilator: open the session during the window | `I-2026-001` → Exam sessions / Live monitoring | Students listed as Not started / In progress / Disconnected (after 30 s without contact) / Submitted, with tab-switch counts. |
| 2. Give one student an extension (1–15 minutes in total) and write a note | Live monitoring | The student's timer grows at once; the note shows its author and time. |
| 3. Lecturer: mark the answers that need marking | Grading | Multiple choice and matching short answers are graded automatically; unmatched short answers show "Needs review"; essays use the rubric. |
| 4. Lecturer: **Publish results** | Results → exam | Students get a simulated SMS and a notification. The publication history shows publication 1. |
| 5. Lecturer: **Reopen**, change a mark, publish again with a reason | Grading / Results | The reason is required; history shows publication 2; students are told their result changed. |
| 6. Student: open the result and download the **result slip** (Somali or English) | My results | Marks, letter grade, and the PDF slip. |
| 7. Registrar: search the results by faculty, year, semester, course, exam type or publication status | All results | Read only: the registrar can't publish, change marks or reopen. |

### Scenario 5 – Payment follow-up, messages and Activity History (`R-2026-001`)

| Step | Where | Expected result |
|---|---|---|
| 1. Filter **Partly paid** / **Not paid** and **Send payment reminders** | Fees | Each student who still owes gets a simulated SMS and a notification. |
| 2. **Templates** → **Add template** (e.g. "Upcoming examination"), check both texts | SMS Management | The Somali and English starter texts fill in; `{name}` is replaced per person when sending. |
| 3. **Send a message**: tick Students, choose the course, **Check recipients**, pick the template, **Send message** | SMS Management | The number of people is shown before sending; after sending: "Sent to N people: … simulated SMS and … notifications." |
| 4. **Outbox** | SMS Management | The new messages go Queued → Simulated: sent → Simulated: delivered within seconds. A failed message (bad number) can be retried. |
| 5. Sign in as one of those students | Bell icon | The message is there, in the student's language. |
| 6. Filter by user, role, action or dates; **Export** in Somali or English | Activity history | Every step above is listed with who, role, what, record and time; the CSV header follows the chosen language. |

## 5. Quick checks per role

| Role | Check | Expected |
|---|---|---|
| Everyone | Open any page while signed out | You are sent to the sign-in page and back to the page afterwards. |
| Everyone | Sign out, then press Back | The page asks you to sign in again (the session is ended on the server). |
| Everyone | Switch SO / EN | All labels change; SMS and notifications follow the language saved in **My profile**. |
| Student | Open another student's result or receipt by changing the address | "Not found". |
| Lecturer | Open a course of another lecturer | "Not found". |
| Invigilator | Look for questions, answers or marks | Not shown: invigilators see status only. |
| Registrar | Try to grade, publish or change results | Not offered, and the server refuses it. |

## 6. Known limitations

- **Simulated payments and SMS.** No connection to EVC Plus, Zaad, eDahab, Hormuud or Somtel. Statuses come from a simulator.
- **No fees until the registrar sets them.** Without a fee for the group, students are not blocked and the registrars get a notification (at most once a day).
- **Older courses** (created before academic years) have no year or semester, so the fee rule doesn't apply to their exams until the registrar gives them one.
- **Earlier exams keep their question pools**; only exams published from now on require reviewed questions.
- **Tab switches:** the 3rd counted switch ends the exam (project policy, stricter than the brief).
- **No network restriction:** students can take exams from any device and connection; rooms are for planning and capacity.
- **Live views refresh every few seconds** (no push channel).
- **Somali texts** should be reviewed by a native speaker.
- **Real gateways, webcam proctoring and plagiarism checks** are out of scope.

## 7. If something goes wrong

| Symptom | What to check |
|---|---|
| The sign-in page doesn't open | Is the frontend running on port 3000 (`cd frontend && npm run dev`)? |
| "Can't reach the server" or the health check fails | Is the API running (port 4300 for this presentation set-up) and is the internet connection to Supabase up? |
| An exam can't be started | Is the window open? Is enough of the semester fee paid (see the exam card)? Has the student already submitted? |
| Publishing an exam fails with "not enough questions" | Mark more questions reviewed, or lower the rule's question count. |
| Approving a schedule is refused | Read the message: overlapping exam, room too small, or a room without a known capacity (confirm it). |
