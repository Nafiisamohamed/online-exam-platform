# API reference

The backend is an Express API under `/api`, served by `backend/src/server.ts` (default `http://localhost:4000/api`). All requests and responses use JSON, apart from file uploads (multipart), CSV downloads and PDFs.

## Conventions

### Login and sessions
- `POST /api/auth/login` sets an **HTTP-only** session cookie, `oe_session`: a signed JWT, `SameSite=Strict`, and `Secure` when `COOKIE_SECURE=true`. Browsers send it automatically; JavaScript can't read it.
- Every other endpoint needs this cookie, apart from `/api/health` and `/api/auth/logout`.
- **Sessions end at once** when:
  - the password changes or is reset;
  - the account is deactivated.
- **Temporary passwords:** a user with one can only call `/api/auth/*` until they change it. Anything else returns `403 PASSWORD_CHANGE_REQUIRED`.
- **CORS** allows only the origins in `CORS_ORIGIN`, with credentials.

### Roles
`ADMIN` (registrar), `LECTURER`, `STUDENT`, `INVIGILATOR`. Every endpoint checks the role on the server.

### Record-level checks
These run on every request:
- lecturers: only their own courses;
- students: only their own attempts, payments and results;
- invigilators: only the sessions they are assigned to.

A failed check returns **404**, so other people's records are not revealed.

### Errors
Every error has the same shape:

```json
{ "error": { "code": "ATTEMPT_DEADLINE_PASSED", "message": "The time for this exam is over; ...", "details": {} } }
```

| Field | Meaning |
|---|---|
| `code` | Stable error code. The frontend translates it into Somali or English. |
| `message` | Short English text, for developers. |
| `details` | Values for the translated message, when there are any (for example `{ "required": 10, "available": 6 }`). |

| Status | Used for |
|---|---|
| 400 | `VALIDATION_ERROR` (`details.problems` lists `{ path, message }`) and other invalid input |
| 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS`, `TEMP_PASSWORD_EXPIRED` |
| 402 | `PAYMENT_REQUIRED` (exam fee not paid) |
| 403 | `FORBIDDEN` (wrong role), `NOT_ENROLLED`, `PASSWORD_CHANGE_REQUIRED` |
| 404 | Missing, or belonging to someone else |
| 409 | State conflicts and database rules, for example `ATTEMPT_DEADLINE_PASSED`, `SCHEDULE_CONFLICT`, `DUPLICATE_QUESTION`, `PAYMENT_EXPIRED` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR`. Details are logged on the server only. |

### Rate limits

| Applies to | Limit |
|---|---|
| All of `/api` | 300 requests per minute per login session, and 3000 per IP address (an exam room behind one router shares one address) |
| Login | 10 attempts per 15 minutes per IP address and login name |
| Demo PIN | 10 tries per 15 minutes per user |

### Values
- **Times:** ISO 8601 in UTC (`2026-11-04T09:00:00.000Z`).
- **Marks and money:** numbers with at most 2 decimals. They are stored as `DECIMAL`.
- **IDs:** UUIDs.
- **Paged lists:** `{ items, total, page, pageSize }`, with query parameters `page` (default 1) and `pageSize` (default 50, maximum 200).

---

## Health

| Method | Path | Role | Response |
|---|---|---|---|
| GET | `/api/health` | none | `200 { status: "ok", database: "ok", serverTime }`, or `503` when the database is down |

## Authentication

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| POST | `/api/auth/login` | none | `{ identifier, password }`: a student number for students, an email for staff | `200 { user }` and the cookie. Errors: `401 INVALID_CREDENTIALS`, `401 TEMP_PASSWORD_EXPIRED`, `429` |
| POST | `/api/auth/logout` | none | — | `204` (cookie cleared) |
| GET | `/api/auth/me` | any | — | `200 { user }` |
| POST | `/api/auth/change-password` | any | `{ currentPassword, newPassword }`: at least 8 characters, with a letter and a digit | `200 { user }` and a new cookie. Errors: `400 WRONG_CURRENT_PASSWORD`, `400 PASSWORD_UNCHANGED` |
| PATCH | `/api/auth/language` | any | `{ language: "so" \| "en" }` | `200 { user }` |

`user` contains `{ id, role, fullName, email, studentNumber, phone, preferredLanguage, mustChangePassword }`. It never includes the password hash.

## Users

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| GET | `/api/users` | ADMIN | query: `role`, `search`, `active`, `page`, `pageSize` | paged users |
| POST | `/api/users` | ADMIN | `{ role, fullName, phone, email? (staff), studentNumber? (students), preferredLanguage? }` | `201 { user, temporaryPassword }`. Errors: `409 STUDENT_NUMBER_TAKEN`, `409 EMAIL_TAKEN` |
| GET | `/api/users/:id` | ADMIN | — | `{ user }` |
| PATCH | `/api/users/:id` | ADMIN | `{ fullName?, phone?, preferredLanguage?, isActive? }` | `{ user }`. Deactivating ends the user's sessions. |
| POST | `/api/users/:id/reset-password` | ADMIN | — | `{ temporaryPassword }` |
| GET | `/api/staff?role=LECTURER\|INVIGILATOR` | ADMIN, LECTURER | — | `{ items: [{ id, fullName, email }] }` |

**Phone numbers** must be Somali mobile numbers. They are stored as `+2526XXXXXXXX` or `+2527XXXXXXXX`; `0615123401` and `615123401` are accepted too.

**Temporary passwords (Q1)**
- They are returned only once and stored only as a bcrypt hash.
- They expire after `TEMP_PASSWORD_DAYS` days.
- New students also get the `ACCOUNT_CREATED` SMS, which never contains the password.

## Courses and enrolment

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| GET | `/api/faculties` | ADMIN, LECTURER | — | `{ items }` |
| POST | `/api/faculties` | ADMIN | `{ code, name }` | `201 { faculty }`. Error: `409 FACULTY_CODE_TAKEN` |
| PATCH | `/api/faculties/:id` | ADMIN | `{ name }` | `{ faculty }` |
| GET | `/api/courses` | any | query: `semester`, `facultyId` | `{ items }`. The list depends on the role: the admin sees all, a lecturer their own courses, a student their active enrolments, an invigilator none. |
| POST | `/api/courses` | ADMIN | `{ facultyId, code, name, semester: "2026-Fall", lecturerId }` | `201 { course }`. Error: `409 COURSE_EXISTS` (same code and semester) |
| GET | `/api/courses/:id` | ADMIN, course lecturer, enrolled student | — | `{ course }` |
| PATCH | `/api/courses/:id` | ADMIN | `{ name?, lecturerId?, facultyId? }` | `{ course }` |
| GET | `/api/courses/:id/enrolments` | ADMIN, course lecturer | query: `status` | `{ items: [{ id, status, enrolledAt, droppedAt, student }] }` |
| POST | `/api/courses/:id/enrolments` | ADMIN | `{ studentId }` or `{ studentNumber }` | `201 { enrolment }`. Also reactivates a dropped student. Errors: `409 ALREADY_ENROLLED`, `409 ENROLMENT_SCHEDULE_CONFLICT { conflicts: [{ course, exam, otherCourse, otherExam }] }` |
| POST | `/api/courses/:id/enrolments/:studentId/drop` | ADMIN | — | `{ enrolment }`. Status becomes `DROPPED`; past attempts and results are kept. |

## CSV imports

Both imports work the same way: **upload → preview → confirm**. Only valid rows are saved. Row errors are codes plus parameters, so the preview can be shown in either language.

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| GET | `/api/imports/templates/enrolments.csv` | ADMIN | — | CSV template |
| POST | `/api/imports/enrolments` | ADMIN | multipart: `file`, `semester` | `201 { batch, rows }` |
| GET | `/api/imports/templates/questions.csv` | LECTURER | — | CSV template |
| POST | `/api/courses/:courseId/question-imports` | course lecturer | multipart: `file` | `201 { batch, rows }` |
| GET | `/api/imports/:id` | uploader, ADMIN | — | `{ batch, rows }` |
| POST | `/api/imports/:id/confirm` | uploader | — | Enrolments: `{ savedRows, newStudents, enrolled, reactivated, rows, temporaryPasswords }` (shown once). Questions: `{ savedRows, totalRows, validRows, invalidRows, duplicateRows, rows }`. Error: `409 IMPORT_ALREADY_CONFIRMED` |

- **Each row:** `{ row, status, errors: [{ code, params? }] }`.
  - `status` is `VALID`, `INVALID` or `DUPLICATE`.
  - `row` counts the header as row 1.
- **Enrolment CSV columns:** `student_id, student_name, phone, course_codes`.
  - `course_codes` holds one or more codes, separated by `;`, `|` or spaces.
  - Error codes: `STUDENT_ID_REQUIRED`, `STUDENT_ID_INVALID`, `STUDENT_NAME_REQUIRED`, `PHONE_INVALID`, `COURSE_CODES_REQUIRED`, `COURSE_NOT_FOUND`, `DUPLICATE_STUDENT_IN_FILE`, `STUDENT_NAME_MISMATCH`, `SCHEDULE_CONFLICT { course, exam, otherCourse, otherExam }`.
  - `SCHEDULE_CONFLICT`: the new courses would give the student two overlapping upcoming exams. If a schedule changes between the preview and the confirm, the confirm is refused with `409 ENROLMENT_SCHEDULE_CONFLICT`.
- **Question CSV columns:** `type, text, difficulty, marks, topic, option_1..option_5, correct_option, accepted_answers, rubric`.
  - `correct_option`: the option's number for MCQ; `True` or `False` for TRUE_FALSE.
  - `accepted_answers`: separated by `|`.
  - `rubric`: `description:marks|description:marks`.
  - The rules are the same as in the question editor. Duplicates, of an earlier row or of an active bank question, are reported as `DUPLICATE_QUESTION` and skipped.

## Question bank

All of these are for the course's own lecturer only.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/courses/:courseId/questions` | query: `type`, `difficulty`, `topicId`, `search`, `archived`, `page`, `pageSize` | paged `{ id, isArchived, current }` |
| POST | `/api/courses/:courseId/questions` | the question body (below) | `201 { question }`. Errors: `400 QUESTION_INVALID { errors }`, `409 DUPLICATE_QUESTION` |
| GET | `/api/courses/:courseId/question-summary` | — | `{ items: [{ type, difficulty, marks, count }] }` |
| GET / POST | `/api/courses/:courseId/topics` | POST: `{ name }` | `{ items }` / `201 { topic }` |
| GET | `/api/questions/:id` | — | `{ question: { id, isArchived, current, versions } }` |
| PUT | `/api/questions/:id` | the question body | `{ question, newVersionCreated }` |
| GET | `/api/questions/:id/versions/:versionId` | — | `{ version }` |
| POST | `/api/questions/:id/archive`, `/restore` | — | `{ question }` |
| POST | `/api/question-images` | multipart: `image` (PNG, JPEG, GIF or WebP, at most 2 MB) | `201 { imagePath, imageUrl }` |
| GET | `/api/question-images/:name` | any logged-in user | the image |

**Question body**

```json
{ "type": "MCQ", "text": "…", "marks": 2, "difficulty": "EASY", "topic": "SQL",
  "imagePath": null,
  "options": [{ "text": "…", "isCorrect": true }],
  "acceptedAnswers": ["…"],
  "rubric": [{ "description": "…", "maxMarks": 5 }] }
```

**Rules for each type**

| Type | Rule | Error codes |
|---|---|---|
| MCQ | 4–5 options, exactly one correct | `MCQ_OPTION_COUNT`, `MCQ_NEEDS_ONE_CORRECT` |
| TRUE_FALSE | 2 options, exactly one correct | — |
| SHORT_ANSWER | At least one accepted answer | `SHORT_ANSWER_NEEDS_ACCEPTED` |
| ESSAY | Rubric marks add up to the question's marks | `RUBRIC_TOTAL_MISMATCH` |

**Versions:** editing a question that an exam attempt has already used creates a new version, and old results keep the original.

## Exams

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| GET | `/api/exams` | ADMIN, LECTURER | query: `courseId`, `status` | `{ items }` |
| POST | `/api/exams` | LECTURER (own course) | `{ courseId, title, instructions?, shuffleQuestions?, shuffleOptions?, allowAnswerReview?, feeAmount?, feeCurrency?, secondGraderId?, rules? }` | `201 { exam }` |
| GET | `/api/exams/:id` | ADMIN, course lecturer, second grader | — | `{ exam }`, with each rule's `available` count and the schedules |
| PATCH | `/api/exams/:id` | course lecturer | settings | `{ exam }`. After publishing, shuffling and the fee are fixed: `409 EXAM_PUBLISHED_LOCKED` |
| PUT | `/api/exams/:id/rules` | course lecturer (DRAFT only) | `{ rules: [{ questionType, difficulty, marksPerQuestion, questionCount, topicIds? }] }` | `{ exam }`. Errors: `400 EXAM_NOT_ENOUGH_QUESTIONS { rules: [{ position, required, available }] }`, `400 RULE_DUPLICATE` |
| GET | `/api/exams/:id/preview` | course lecturer | — | `{ sample: true, totalMarks, questions }`: one generated sample with the correct answers. Nothing is saved or locked. |
| POST | `/api/exams/:id/publish` | course lecturer | — | `{ exam }`. Errors: `400 EXAM_HAS_NO_RULES`, `400 EXAM_NOT_ENOUGH_QUESTIONS` |

**Fees and currencies:** `feeCurrency` must be one of `SUPPORTED_CURRENCIES`. A fee of 0 means the exam is free.

**Rules:** an exam has at most one rule per type + difficulty + mark value. This gives every student the same difficulty mix and the same total marks.

## Schedules

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| POST | `/api/exams/:id/schedules` | course lecturer | `{ windowStart, windowEnd, durationMinutes, roomIds?, invigilatorIds? }` | `201 { schedule }`. Errors: `400 WINDOW_INVALID`, `400 DURATION_LONGER_THAN_WINDOW`, `400 WINDOW_IN_PAST`, `409 SCHEDULE_ALREADY_REQUESTED` |
| GET | `/api/schedules` | ADMIN, LECTURER, INVIGILATOR | query: `status`, `from`, `to` | `{ items }`. An invigilator sees only the approved sessions assigned to them. |
| GET | `/api/schedules/:id` | ADMIN, owner, assigned invigilator | — | `{ schedule }` |
| POST | `/api/schedules/:id/approve` | ADMIN | — | `{ schedule }`. Errors: `409 SCHEDULE_CONFLICT { conflicts: [{ type: STUDENT\|ROOM\|INVIGILATOR, scheduleId, examTitle, count }] }`, `409 EXAM_NOT_PUBLISHED` |
| POST | `/api/schedules/:id/reject` | ADMIN | `{ reason }` | `{ schedule }` |
| POST | `/api/schedules/:id/cancel` | ADMIN, owner lecturer | — | `{ schedule }`. Error: `409 SCHEDULE_HAS_ATTEMPTS` |

Approving a schedule sends the `SCHEDULE_APPROVED` SMS and notification to the enrolled students.

**Overlapping exams (4.5)** are blocked at both ends:
- **Approval** is refused when the schedule overlaps another approved exam of any shared student, room or invigilator.
- **Enrolment** is refused afterwards when a course's upcoming exam would overlap another upcoming exam of the student. This covers single enrolment, reactivation and CSV import.
- **No race:** both take the same database lock, so they can't happen at the same moment.

## Taking an exam (students)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/my/exams` | — | `{ items: [{ id, title, course, schedule, fee: { amount, currency, required, paid }, attempt, state, canStart }] }`. `state` is `UPCOMING`, `OPEN`, `CLOSED`, `IN_PROGRESS` or `SUBMITTED`. |
| POST | `/api/exams/:examId/attempts` | — | `201 { resumed: false, attempt }` for a new attempt, or `200 { resumed: true, attempt }` when one exists. Errors: `403 NOT_ENROLLED`, `409 EXAM_NOT_OPEN_YET`, `409 EXAM_WINDOW_CLOSED`, `402 PAYMENT_REQUIRED` |
| GET | `/api/attempts/:id` | — | `{ attempt }` (after a reload or reconnection) |
| PUT | `/api/attempts/:id/questions/:questionId/answer` | `{ selectedOptionId }` or `{ textAnswer }` (an empty value clears the answer) | `{ saved: true, savedAt, remainingSeconds }`. Errors: `409 ATTEMPT_DEADLINE_PASSED`, `409 ATTEMPT_ALREADY_SUBMITTED`, `400 OPTION_NOT_IN_QUESTION` |
| PUT | `/api/attempts/:id/questions/:questionId/flag` | `{ flagged }` | `{ flagged }` |
| POST | `/api/attempts/:id/heartbeat` | — | `{ status, remainingSeconds, deadline, serverTime, warnings, countedFocusLosses, focusWarning }` |
| POST | `/api/attempts/:id/focus-events` | `{ clientEventId: uuid, type: "LOST" \| "RETURNED" }` | `{ countedFocusLosses, focusWarning }` |
| POST | `/api/attempts/:id/submit` | — | `{ attempt }`. Safe to repeat. |

**The `attempt` object**
- `{ id, status, exam, totalQuestions, totalMarks, answeredCount, flaggedCount, countedFocusLosses, focusWarning, serverTime, startedAt, deadline, remainingSeconds, extensionMinutes, warnings: { tenMinutes, oneMinute }, questions }`.
- Each question: `{ id, position, type, text, imageUrl, marks, options: [{ id, text }], answer, isAnswered, isFlagged }`.
- Options come in the student's own order.
- It **never** contains correct answers, accepted answers, rubrics or marks awarded.
- After submission, `questions` is empty.

**How the core rules work**
- **Starting** draws the student's own question set and locks those question versions, in the same transaction.
- **Deadline:** `min(start + duration, window end) + extensions`, set by the server clock.
- **Resuming:** starting again, or reloading, returns the same attempt with the saved answers. A new exam is never generated.
- **Late answers** are rejected. The attempt is then submitted with the saved answers, recording the deadline itself as the submission time. A background job does the same for disconnected students.
- **Tab switches:** the server records the times. A focus loss is counted only if it lasts 1 second or more. After 3 counted switches, `focusWarning` becomes `true`; nothing is penalised automatically.
- **Grading on submit:**
  - MCQ, True/False and matching short answers are graded automatically. Matching ignores case and extra spaces but keeps punctuation.
  - Other short answers become `NEEDS_REVIEW`.
  - Essays become `PENDING_ESSAY`.

## Invigilation

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| GET | `/api/invigilation/sessions` | INVIGILATOR (assigned), ADMIN | — | `{ items: [{ id, exam, windowStart, windowEnd, rooms, attempts, state }] }` |
| GET | `/api/invigilation/sessions/:id/live` | assigned INVIGILATOR, ADMIN | — | see below |
| GET / POST | `/api/invigilation/sessions/:id/notes` | GET: also ADMIN; POST: INVIGILATOR | POST: `{ text, studentId? }` | `{ items }` / `201 { note }` |
| GET | `/api/invigilation/attempts/:id/focus-events` | assigned INVIGILATOR, ADMIN | — | `{ items: [{ lostAt, returnedAt, durationMs, isCounted }] }` |
| POST | `/api/invigilation/attempts/:id/extensions` | assigned INVIGILATOR | `{ minutes: 1-15, reason }` | `201 { extension, totalExtensionMinutes, deadline }`. Errors: `409 EXTENSION_LIMIT_EXCEEDED { remainingMinutes }`, `409 ATTEMPT_NOT_IN_PROGRESS` |

**Live view response**
- `{ schedule, serverTime, refreshSeconds: 5, disconnectedAfterSeconds: 30, summary, students }`.
- For each student:
  - `status`: `NOT_STARTED`, `IN_PROGRESS`, `SUBMITTED` or `DISCONNECTED` (no contact for 30 seconds);
  - `answeredCount`, `totalQuestions`, `countedFocusLosses`, `focusWarning`;
  - `awayFromTabSeconds`, `connection`, `secondsSinceContact`;
  - `remainingSeconds`, `extensionMinutes`.
- It never includes questions or answers.

**Extensions:** at most 15 minutes in total per attempt, and every extension needs a reason.

## Grading

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| GET | `/api/exams/:id/grading` | course lecturer (FIRST) or second grader (SECOND) | query: `status` | `{ exam, role, counts, remaining, items }`. The second grader sees only essays, anonymised. |
| GET | `/api/grading/answers/:id` | as above | — | `{ answer: { question (rubric, answer key for the course lecturer), response, marks, student } }` |
| PUT | `/api/grading/answers/:id/marks` | course lecturer | `{ marks, comment? }` | For non-essay answers: Needs review, or a regrade. Error: `400 MARKS_OUT_OF_RANGE` |
| PUT | `/api/grading/answers/:id/essay` | course lecturer or second grader | `{ criteria: [{ criterionId, marks }], comment? }` | Every criterion is required. Errors: `400 RUBRIC_MARKS_REQUIRED`, `400 CRITERION_MARKS_OUT_OF_RANGE` |
| POST | `/api/grading/answers/:id/resolve` | course lecturer | `{ marks }` | Sets the final mark of a `DISCREPANCY` essay |

**Blind second grading (D7)**
- The two graders don't see each other's marks.
- Marks within 20% of the question's marks are averaged.
- A bigger gap marks the essay `DISCREPANCY`, and the course lecturer decides the final mark.

**Locked marks:** while results are published, marks can't change (`409 RESULTS_PUBLISHED`). Reopen grading first.

## Results

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| GET | `/api/exams/:id/results` | ADMIN, course lecturer | — | `{ exam, canPublish, blockers, publications, students }`. Absent students are included. |
| POST | `/api/exams/:id/results/publish` | course lecturer | `{ reason? }` (required from the 2nd publication) | `{ publicationNumber, attempts, notifiedStudents }`. Errors: `409 GRADING_INCOMPLETE { ungraded }`, `409 ATTEMPTS_IN_PROGRESS`, `400 PUBLICATION_REASON_REQUIRED`, `409 RESULTS_ALREADY_PUBLISHED` |
| POST | `/api/exams/:id/results/reopen` | course lecturer | `{ reason }` | `{ resultsStatus: "REOPENED" }` |
| GET | `/api/exams/:id/grades.csv?lang=so\|en` | ADMIN, course lecturer | — | CSV with the header in the chosen language |
| GET | `/api/my/results` | STUDENT | — | `{ items }`: published results only |
| GET | `/api/my/results/:examId` | STUDENT | — | `{ result: { totalScore, maxScore, percentage, letterGrade, countedFocusLosses, publicationNumber, questions } }`. `404 RESULT_NOT_FOUND` until results are published. |
| GET | `/api/my/results/:examId/slip.pdf?lang=so\|en` | STUDENT | — | result slip PDF |

**Publishing**
- Each publication stores a permanent snapshot of every result. Earlier snapshots are never changed.
- The first publication notifies every student.
- A later publication notifies only the students whose result changed.

**What students see**
- Only the latest published snapshot.
- Correct answers only when the lecturer allows question review.

## Payments (simulated)

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| POST | `/api/payments` | STUDENT | `{ examId, provider: EVC_PLUS\|ZAAD\|EDAHAB, phone, idempotencyKey: uuid }` (extra fields such as `amount` are rejected) | `201 { payment, reused: false }`, or `200 { payment, reused: true }` for a repeated request or an open payment. Errors: `400 EXAM_HAS_NO_FEE`, `409 PAYMENT_ALREADY_PAID` |
| GET | `/api/payments` | STUDENT (own), ADMIN (all) | query: `examId`, `status`, `provider` | `{ items }` |
| GET | `/api/payments/:id` | owner, ADMIN | — | `{ payment }` |
| POST | `/api/payments/:id/confirm` | owner | `{ accept: true \| false }` | `{ payment }`: status `PENDING_PIN` or `CANCELLED` |
| POST | `/api/payments/:id/pin` | owner | `{ pin }` (rate limited) | `{ result: SUCCESS\|WRONG_PIN\|FAILED, payment }`. Errors: `409 PAYMENT_NOT_CONFIRMED`, `409 PAYMENT_EXPIRED` |
| POST | `/api/payments/:id/cancel` | owner | — | `{ payment }` |
| GET | `/api/payments/:id/receipt.pdf?lang=so\|en` | owner, ADMIN | — | DEMO receipt PDF (SUCCESS only) |

**The `payment` object:** `{ id, exam, provider, providerName, phone, amount, currency, status, merchantName, merchantNumber, pinAttemptsLeft, failureReason, receiptNumber, expiresAt, secondsUntilExpiry, isSimulated: true, … }`.

**How it works**
- **Amount:** always copied from the exam. The browser never sends it.
- **PIN:** checked on the server against `DEMO_PAYMENT_PIN`. It is never stored or logged.
- **Outcomes:**
  - 3 wrong PINs: `FAILED`;
  - pressing No, or cancelling: `CANCELLED`;
  - 5 minutes without finishing: `EXPIRED`.
- **On success:** a `DEMO-EVC-YYYYMMDD-XXXXXX` receipt, the `PAYMENT_SUCCESS` SMS and a notification.

## Notifications, SMS outbox and audit log

| Method | Path | Role | Response |
|---|---|---|---|
| GET | `/api/notifications?unread=true` | any (own) | `{ items: [{ id, templateKey, params, title, body, readAt, createdAt }] }`, translated into the user's current language |
| GET | `/api/notifications/unread-count` | any | `{ unread }` |
| POST | `/api/notifications/:id/read`, `/api/notifications/read-all` | any (own) | `{ read: true }` / `{ marked }` |
| GET | `/api/sms-outbox` | ADMIN | paged messages plus `counts` per status, `simulated: true`. Query: `status`, `templateKey`, `recipientId`, `from`, `to` |
| GET | `/api/sms-outbox/:id` | ADMIN | `{ message }` |
| GET | `/api/audit-logs` | ADMIN | paged entries `{ actionCode, entityType, entityId, details, ipAddress, createdAt, actor }`. Query: `actorId`, `action`, `entityType`, `entityId`, `from`, `to` |

**SMS outbox**
- Every message starts with `[DEMO]` and is written in the recipient's language.
- A background job moves each message from `QUEUED` to `SENT` to `DELIVERED`. Invalid numbers end as `FAILED`.
- Nothing ever leaves the server.

## Analytics

| Method | Path | Role | Response |
|---|---|---|---|
| GET | `/api/exams/:id/analytics` | ADMIN, course lecturer | `{ exam, rules, statistics: { students, average, highest, lowest, averageScore, distribution[10] }, questions: [{ questionVersionId, text, type, difficulty, topic, answered, correct, difficultyIndex, discrimination, averageMarkPercent, flags }] }` |
| GET | `/api/analytics/dashboard` | ADMIN, LECTURER | `{ scope, averageScoreByCourse, scoreDistribution, examsByStatus, attemptsBySubmission, tabSwitches }`. The admin also gets `paymentsByProvider`, `usersByRole` and `smsByStatus`. |

**Difficulty index:** the percentage of students who answered correctly.
- Essays and hand-graded short answers count as correct at 50% of the marks or more (D10).

**Discrimination:** the upper–lower 27% method (D9).

**Flags**

| Flag | When |
|---|---|
| `NOT_ENOUGH_DATA` | fewer than 5 answers |
| `LOW_CORRECT_RATE` | below 20% correct |
| `HIGH_CORRECT_RATE` | above 95% correct |

All numbers come from live database queries.

## Rooms and grading scale

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| GET | `/api/rooms` | ADMIN, LECTURER | — | `{ items }` |
| POST | `/api/rooms` | ADMIN | `{ name, building, networkRanges: ["10.10.4.0/24"] }` | `201 { room }`. Error: `409 ROOM_NAME_TAKEN` |
| PATCH | `/api/rooms/:id` | ADMIN | any of the fields | `{ room }` |
| GET | `/api/grading-scale` | any | — | `{ bands: [{ letter, minPercentage }] }` |
| PUT | `/api/grading-scale` | ADMIN | `{ bands }`: unique letters and minimums, one band at 0 | `{ bands }` |

**Rooms** are allocated to schedules for planning and are checked for clashes. They never restrict access: students can take examinations from any device and any connection (university or home Wi-Fi, mobile data). A room may list network ranges (`networkRanges`, optional) for information only. The client address is recorded on the attempt (`startIp`) and in the audit log, but never checked.

**Grading scale:** changes apply to grades calculated afterwards. Published results keep their letters.
