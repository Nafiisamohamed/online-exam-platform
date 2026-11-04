/**
 * Seeds realistic MOCK data for demonstrations and manual testing.
 *
 * What it creates (all fictional; Somali names, real cities, USD amounts):
 *   - demo accounts for every role (1 admin, 3 lecturers, 2 invigilators, 10 students)
 *     with random strong passwords, stored only as bcrypt hashes (cost 12);
 *   - 2 faculties, 3 courses, enrolments (one dropped after the midterm);
 *   - question banks (MCQ, True/False, short answer, essay with rubric), one edited
 *     question with a second version;
 *   - exams: a completed and graded CS201 midterm with results published twice
 *     (a regrade), an upcoming CS201 final with simulated payments, a requested CS105
 *     quiz and a draft BA110 exam;
 *   - attempts with randomized questions, answers, focus events, an extension,
 *     invigilator notes, essay marks from two graders, grades, publications and
 *     grade revisions, SMS outbox messages, notifications and audit log entries.
 *
 * Connection: DATABASE_URL, the restricted exam_app role, so the data is created
 * with exactly the application's permissions.
 *
 * Safety: never deletes or changes existing data. It refuses to run if the demo
 * data is already there, and everything is in ONE transaction: if any step fails,
 * nothing is saved.
 *
 * Passwords: written only to SEED_ACCOUNTS_FILE (default
 * backend/demo-accounts.local.md, ignored by git), after the transaction commits.
 *
 * Usage: npm run db:seed:demo
 * Exit code: 0 on success or when already seeded, 1 on error.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pg from "pg";
import { pgClientConfig } from "./lib/pg-connection.mjs";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendDir, ".env") }); // values set in the shell win

const ACCOUNTS_FILE = process.env.SEED_ACCOUNTS_FILE || path.join(backendDir, "demo-accounts.local.md");
const DEMO_ADMIN_EMAIL = "registrar@uni-demo.test";
const MERCHANT = { name: "Jaamacadda Demo", number: "000000" };
const BCRYPT_COST = 12;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Deterministic random numbers, so every run builds the same demo data. */
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261104);
const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const pick = (list) => list[Math.floor(rand() * list.length)];

/** A Date at hh:mm Mogadishu time (UTC+3), `days` days from today. */
function eat(days, hh, mm = 0) {
  const local = new Date(Date.now() + 3 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, hh - 3, mm));
}
const addMin = (d, m) => new Date(d.getTime() + m * 60_000);
const todayStamp = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
const receiptCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(rand() * 32)]).join("");
const normalize = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
const strongPassword = () => crypto.randomBytes(12).toString("base64url"); // 16 characters

// ---------------------------------------------------------------------------
// Demo content
// ---------------------------------------------------------------------------

const STAFF = [
  { key: "admin", role: "ADMIN", name: "Sahra Cabdirashiid Mire", email: DEMO_ADMIN_EMAIL, phone: "+252615100201", lang: "so" },
  { key: "axmed", role: "LECTURER", name: "Dr. Axmed Xirsi Samatar", email: "axmed.samatar@uni-demo.test", phone: "+252615100302", lang: "so" },
  { key: "mustafe", role: "LECTURER", name: "Dr. Mustafe Cabdi Jibriil", email: "mustafe.jibriil@uni-demo.test", phone: "+252617100303", lang: "en" },
  { key: "khadra", role: "LECTURER", name: "Dr. Khadra Maxamuud Cilmi", email: "khadra.cilmi@uni-demo.test", phone: "+252634100304", lang: "so" },
  { key: "cabdiraxmaan", role: "INVIGILATOR", name: "Cabdiraxmaan Nuur Faarax", email: "cabdiraxmaan.faarax@uni-demo.test", phone: "+252615100405", lang: "so" },
  { key: "deeqa", role: "INVIGILATOR", name: "Deeqa Xuseen Aadan", email: "deeqa.aadan@uni-demo.test", phone: "+252619100406", lang: "en" },
];

// ability = probability of answering an objective question correctly
const STUDENTS = [
  { n: 1, name: "Hodan Maxamed Cali", phone: "+252615123401", lang: "so", ability: 0.9 },
  { n: 2, name: "Cabdiqaadir Axmed Nuur", phone: "+252617234502", lang: "so", ability: 0.75 },
  { n: 3, name: "Faadumo Xasan Warsame", phone: "+252634345603", lang: "en", ability: 0.65 },
  { n: 4, name: "Maxamed Cabdullaahi Faarax", phone: "+252615456704", lang: "so", ability: 0.45 },
  { n: 5, name: "Ayaan Yuusuf Jaamac", phone: "+252619567805", lang: "so", ability: 0.7 },
  { n: 6, name: "Cumar Siciid Ducaale", phone: "+252652678906", lang: "so", ability: 0.6 },
  { n: 7, name: "Ifraax Cali Xuseen", phone: "+252616789007", lang: "en", ability: 0.8 },
  { n: 8, name: "Bashiir Aadan Muuse", phone: "+252618890108", lang: "so", ability: 0.5 },
  { n: 9, name: "Nimco Cabdi Raage", phone: "+252613901209", lang: "so", ability: 0.85 },
  { n: 10, name: "Yaasiin Ibraahim Guuleed", phone: "+252614012310", lang: "so", ability: 0.55 },
].map((s) => ({ ...s, number: `DEMO-2026-${String(s.n).padStart(4, "0")}` }));

const mcq = (difficulty, text, options, correct = 0) => ({ type: "MCQ", difficulty, marks: 2, text, options, correct });
const tf = (text, isTrue) => ({ type: "TRUE_FALSE", difficulty: "EASY", marks: 1, text, options: ["TRUE", "FALSE"], correct: isTrue ? 0 : 1 });
const short = (text, accepted, wrong) => ({ type: "SHORT_ANSWER", difficulty: "MEDIUM", marks: 2, text, accepted, wrong });
const essay = (text, rubric, sample) => ({ type: "ESSAY", difficulty: "HARD", marks: 10, text, rubric, sample });

const CS201_BANK = {
  SQL: [
    mcq("EASY", "Which SQL statement is used to read data from a table?", ["SELECT", "INSERT", "UPDATE", "DELETE"]),
    mcq("EASY", "Which keyword removes duplicate rows from a query result?", ["DISTINCT", "UNIQUE", "ONLY", "SINGLE"]),
    mcq("EASY", "Which clause filters rows before they are grouped?", ["WHERE", "HAVING", "ORDER BY", "LIMIT"]),
    mcq("MEDIUM", "Which join returns all rows from the left table, even without a match?", ["LEFT JOIN", "INNER JOIN", "CROSS JOIN", "SELF JOIN", "NATURAL JOIN"]),
    mcq("MEDIUM", "Which aggregate counts only the non-NULL values of a column?", ["COUNT(column)", "COUNT(*)", "SUM(column)", "MAX(column)"]),
    tf("A foreign key can reference the primary key of another table.", true),
    tf("The HAVING clause can only be used without GROUP BY.", false),
    short("Write the SQL keyword pair used to sort query results.", ["ORDER BY"], "SORT BY"),
    short("Name the SQL command that adds new rows to a table.", ["INSERT", "INSERT INTO"], "ADD ROW"),
  ],
  Normalisation: [
    mcq("EASY", "A primary key column must be:", ["Unique and not NULL", "Allowed to be NULL", "Always a text column", "Repeated in every row"]),
    mcq("EASY", "Which normal form removes repeating groups?", ["1NF", "2NF", "3NF", "BCNF"]),
    mcq("MEDIUM", "A table is in 3NF when it is in 2NF and:", ["It has no transitive dependencies", "It has no NULL values", "It has exactly one key", "It has no foreign keys", "Every column is indexed"]),
    tf("Every table must have exactly one index.", false),
    essay(
      "Explain database normalisation and why it is used. Give an example of a table that is in 1NF but not in 3NF.",
      [["Correct definition of normalisation", 4], ["Valid example of a 1NF table that is not in 3NF", 3], ["Clear explanation of the benefits", 3]],
      "Normalisation organises tables to reduce redundancy. Example: Student(id, name, facultyId, facultyName) is in 1NF but facultyName depends on facultyId, a transitive dependency.",
    ),
  ],
  Transactions: [
    mcq("EASY", "Which command permanently saves the changes of a transaction?", ["COMMIT", "SAVE", "ROLLBACK", "END"]),
    mcq("MEDIUM", "Which problem occurs when a transaction reads changes that are not yet committed?", ["Dirty read", "Phantom read", "Lost update", "Deadlock"]),
    tf("ROLLBACK undoes the changes made in the current transaction.", true),
    short("What does the A in ACID stand for?", ["Atomicity"], "Accuracy"),
    essay(
      "Describe the four ACID properties of a transaction, using a bank transfer between two EVC Plus accounts as an example.",
      [["All four properties named and explained", 4], ["Correct use of the bank transfer example", 3], ["Clarity and structure", 3]],
      "Atomicity: the debit and credit both happen or neither does. Consistency, isolation and durability keep balances correct even if the system fails.",
    ),
  ],
};

const CS105_BANK = {
  Variables: [
    mcq("EASY", "Which of these is a valid variable name in most programming languages?", ["total_marks", "2total", "total-marks", "total marks"]),
    mcq("EASY", "Which data type stores whole numbers?", ["Integer", "String", "Boolean", "Float"]),
    tf("A constant's value can change while the program runs.", false),
  ],
  Loops: [
    mcq("EASY", "Which loop always runs its body at least once?", ["do-while", "for", "while", "for-each"]),
    mcq("EASY", "What does the 'break' statement do inside a loop?", ["Exits the loop", "Skips to the next iteration", "Restarts the loop", "Pauses the program"]),
    tf("A while loop checks its condition before each iteration.", true),
  ],
};

const BA110_BANK = {
  "Accounting basics": [
    mcq("EASY", "The accounting equation is:", ["Assets = Liabilities + Equity", "Assets = Revenue - Expenses", "Equity = Assets + Liabilities", "Profit = Assets - Equity"]),
    mcq("EASY", "Which statement shows a business's revenue and expenses?", ["Income statement", "Balance sheet", "Cash book", "Trial balance"]),
    mcq("EASY", "Money owed by customers is recorded as:", ["Accounts receivable", "Accounts payable", "Capital", "Drawings"]),
    tf("Double-entry bookkeeping records every transaction twice.", true),
  ],
};

const RULES_MIDTERM = [
  { type: "MCQ", difficulty: "EASY", marks: 2, count: 3 },
  { type: "MCQ", difficulty: "MEDIUM", marks: 2, count: 2 },
  { type: "TRUE_FALSE", difficulty: "EASY", marks: 1, count: 2 },
  { type: "SHORT_ANSWER", difficulty: "MEDIUM", marks: 2, count: 1 },
  { type: "ESSAY", difficulty: "HARD", marks: 10, count: 1 },
];
const RULES_FINAL = [
  { type: "MCQ", difficulty: "EASY", marks: 2, count: 4 },
  { type: "MCQ", difficulty: "MEDIUM", marks: 2, count: 3 },
  { type: "TRUE_FALSE", difficulty: "EASY", marks: 1, count: 3 },
  { type: "SHORT_ANSWER", difficulty: "MEDIUM", marks: 2, count: 2 },
  { type: "ESSAY", difficulty: "HARD", marks: 10, count: 1 },
];

const GRADING_SCALE = [["A", 90], ["B", 80], ["C", 70], ["D", 60], ["F", 0]];
const letterFor = (pct) => GRADING_SCALE.find(([, min]) => pct >= min)[0];

const SMS_TEXT = {
  ACCOUNT_CREATED: {
    so: (p) => `[DEMO] Akoonkaaga waa diyaar. Lambarka ardayga: ${p.studentNumber}. Kala soo qaado erayga sirta ah ee ku meel gaarka ah xafiiska diiwaangelinta.`,
    en: (p) => `[DEMO] Your account is ready. Student number: ${p.studentNumber}. Collect your temporary password from the registrar's office.`,
  },
  SCHEDULE_APPROVED: {
    so: (p) => `[DEMO] Imtixaanka ${p.course} wuxuu dhacayaa ${p.date}, ${p.window}.`,
    en: (p) => `[DEMO] The ${p.course} exam takes place on ${p.date}, ${p.window}.`,
  },
  PAYMENT_SUCCESS: {
    so: (p) => `[DEMO] Waxaad ${p.amount} u dirtay ${MERCHANT.name} (${MERCHANT.number}). Tixraac: ${p.receipt}. Lacag dhab ah lama dirin.`,
    en: (p) => `[DEMO] You sent ${p.amount} to ${MERCHANT.name} (${MERCHANT.number}). Reference: ${p.receipt}. No real money was transferred.`,
  },
  RESULTS_PUBLISHED: {
    so: (p) => `[DEMO] Natiijada ${p.course} waa la daabacay. Gal nidaamka si aad u aragto.`,
    en: (p) => `[DEMO] Your ${p.course} results have been published. Log in to view them.`,
  },
  RESULTS_CHANGED: {
    so: (p) => `[DEMO] Natiijadaada ${p.course} waa la cusbooneysiiyay. Gal nidaamka.`,
    en: (p) => `[DEMO] Your ${p.course} result has been updated. Log in to view it.`,
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (the exam_app connection) is not set. See backend/.env.example.");

  const client = new pg.Client(pgClientConfig(url));
  await client.connect();
  const q = (sql, params) => client.query(sql, params);
  const one = async (sql, params) => (await client.query(sql, params)).rows[0];

  try {
    const who = await one(`SELECT current_user AS name, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser`);
    if (who.name !== "exam_app") {
      throw new Error(`Refusing to seed: connected as "${who.name}". DATABASE_URL must use the exam_app role.`);
    }
    const tables = await one(`SELECT to_regclass('public.payments') IS NOT NULL AND to_regclass('public.grade_revisions') IS NOT NULL AS ok`);
    if (!tables.ok) throw new Error("Refusing to seed: the migrations have not been applied to this database.");
    if (await one(`SELECT 1 AS found FROM users WHERE email = $1`, [DEMO_ADMIN_EMAIL])) {
      console.log("Demo data is already present. Nothing was changed.");
      return;
    }

    console.log("Hashing demo passwords (bcrypt cost 12)...");
    const accounts = [];
    for (const s of STAFF) accounts.push({ ...s, login: s.email, password: strongPassword() });
    for (const s of STUDENTS) accounts.push({ ...s, key: `s${s.n}`, role: "STUDENT", login: s.number, password: strongPassword() });
    for (const a of accounts) a.hash = await bcrypt.hash(a.password, BCRYPT_COST);

    await q("BEGIN");

    // --- Roles, users, grading scale -------------------------------------------------
    for (const r of ["ADMIN", "LECTURER", "STUDENT", "INVIGILATOR"]) {
      await q(`INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [r]);
    }
    const roleIds = Object.fromEntries((await q(`SELECT name, id FROM roles`)).rows.map((r) => [r.name, r.id]));
    const U = {};
    for (const a of accounts) {
      U[a.key] = (await one(
        `INSERT INTO users (role_id, student_number, email, full_name, phone, password_hash, preferred_language, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
        [roleIds[a.role], a.role === "STUDENT" ? a.number : null, a.role === "STUDENT" ? null : a.email, a.name, a.phone, a.hash, a.lang],
      )).id;
    }
    for (const [i, [letter, min]] of GRADING_SCALE.entries()) {
      await q(`INSERT INTO grading_scale (letter, min_percentage, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [letter, min, i + 1]);
    }
    const audit = (actor, action, entityType, entityId, details, at = new Date()) =>
      q(`INSERT INTO audit_logs (actor_id, action_code, entity_type, entity_id, details, ip_address, created_at) VALUES ($1, $2, $3, $4, $5, '10.10.4.20', $6)`,
        [actor, action, entityType, entityId, details ? JSON.stringify(details) : null, at]);

    // --- Faculties, courses, enrolments ------------------------------------------------
    const fc = (await one(`INSERT INTO faculties (code, name, updated_at) VALUES ('FC', 'Kulliyadda Kombiyuutarka (Faculty of Computing)', now()) RETURNING id`)).id;
    const fem = (await one(`INSERT INTO faculties (code, name, updated_at) VALUES ('FEM', 'Kulliyadda Dhaqaalaha iyo Maamulka (Faculty of Economics and Management)', now()) RETURNING id`)).id;
    const course = async (faculty, code, name, lecturer) =>
      (await one(`INSERT INTO courses (faculty_id, code, name, semester, lecturer_id, updated_at) VALUES ($1, $2, $3, '2026-Fall', $4, now()) RETURNING id`, [faculty, code, name, lecturer])).id;
    const C = {
      CS201: await course(fc, "CS201", "Database Systems", U.axmed),
      CS105: await course(fc, "CS105", "Introduction to Programming", U.mustafe),
      BA110: await course(fem, "BA110", "Principles of Accounting", U.khadra),
    };
    const enrol = (student, courseId) => q(`INSERT INTO enrolments (student_id, course_id, enrolled_at) VALUES ($1, $2, $3)`, [U[`s${student}`], courseId, eat(-40, 9)]);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) await enrol(n, C.CS201);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) await enrol(n, C.CS105);
    for (const n of [6, 7, 8, 9, 10]) await enrol(n, C.BA110);
    await audit(U.admin, "ENROLMENTS_IMPORTED", "course", C.CS201, { semester: "2026-Fall", rows: 23 }, eat(-40, 9));
    await q(
      `INSERT INTO import_batches (type, semester, uploaded_by, filename, status, total_rows, valid_rows, invalid_rows, duplicate_rows, row_results, created_at)
       VALUES ('ENROLMENTS', '2026-Fall', $1, 'enrolments-2026-fall.csv', 'CONFIRMED', 23, 23, 0, 0, '[]', $2)`,
      [U.admin, eat(-40, 9)],
    );

    // --- Question banks ----------------------------------------------------------------
    /** Inserts a bank; returns [{ versionId, type, difficulty, marks, optionIds, correctOptionId, def }]. */
    async function insertBank(courseId, lecturer, bank) {
      const out = [];
      for (const [topicName, questions] of Object.entries(bank)) {
        const topic = (await one(`INSERT INTO topics (course_id, name) VALUES ($1, $2) RETURNING id`, [courseId, topicName])).id;
        for (const def of questions) {
          const qid = (await one(`INSERT INTO questions (course_id, created_by, normalized_text, updated_at) VALUES ($1, $2, $3, now()) RETURNING id`, [courseId, lecturer, normalize(def.text)])).id;
          const vid = (await one(
            `INSERT INTO question_versions (question_id, version_number, type, text, marks, difficulty, topic_id) VALUES ($1, 1, $2, $3, $4, $5, $6) RETURNING id`,
            [qid, def.type, def.text, def.marks, def.difficulty, topic],
          )).id;
          await q(`UPDATE questions SET current_version_id = $1 WHERE id = $2`, [vid, qid]);
          const optionIds = [];
          for (const [i, text] of (def.options ?? []).entries()) {
            optionIds.push((await one(`INSERT INTO question_options (question_version_id, text, is_correct, position) VALUES ($1, $2, $3, $4) RETURNING id`, [vid, text, i === def.correct, i + 1])).id);
          }
          for (const a of def.accepted ?? []) await q(`INSERT INTO accepted_answers (question_version_id, answer_text, normalized_text) VALUES ($1, $2, $3)`, [vid, a, normalize(a)]);
          const criteria = [];
          for (const [i, [description, max]] of (def.rubric ?? []).entries()) {
            criteria.push({ id: (await one(`INSERT INTO rubric_criteria (question_version_id, description, max_marks, position) VALUES ($1, $2, $3, $4) RETURNING id`, [vid, description, max, i + 1])).id, max });
          }
          out.push({ questionId: qid, versionId: vid, topicId: topic, type: def.type, difficulty: def.difficulty, marks: def.marks, optionIds, correctOptionId: optionIds[def.correct], criteria, def });
        }
      }
      return out;
    }
    const bankCS201 = await insertBank(C.CS201, U.axmed, CS201_BANK);
    await insertBank(C.CS105, U.mustafe, CS105_BANK);
    await insertBank(C.BA110, U.khadra, BA110_BANK);
    await q(
      `INSERT INTO import_batches (type, course_id, uploaded_by, filename, status, total_rows, valid_rows, invalid_rows, duplicate_rows, row_results, created_at)
       VALUES ('QUESTIONS', $1, $2, 'cs201-question-bank.csv', 'CONFIRMED', 21, 19, 1, 1, $3, $4)`,
      [C.CS201, U.axmed, JSON.stringify([
        { row: 7, status: "INVALID", errors: [{ code: "MCQ_NEEDS_ONE_CORRECT" }] },
        { row: 15, status: "DUPLICATE", errors: [{ code: "DUPLICATE_QUESTION", params: { existingRow: 3 } }] },
      ]), eat(-30, 10)],
    );
    await audit(U.axmed, "QUESTIONS_IMPORTED", "course", C.CS201, { valid: 19, invalid: 1, duplicates: 1 }, eat(-30, 10));

    // --- Rooms -------------------------------------------------------------------------
    const labA = (await one(`INSERT INTO rooms (name, building, network_ranges) VALUES ('Shaybaarka A (Lab A)', 'Xarunta Muqdisho (Mogadishu campus)', ARRAY['10.10.4.0/24']) RETURNING id`)).id;
    const hall2 = (await one(`INSERT INTO rooms (name, building, network_ranges) VALUES ('Hoolka 2 (Hall 2)', 'Xarunta Hargeysa (Hargeisa campus)', ARRAY['10.20.1.0/24']) RETURNING id`)).id;

    // --- Exams and schedules -------------------------------------------------------------
    const exam = async (courseId, creator, title, instructions, fee, status, secondGrader = null) =>
      (await one(
        `INSERT INTO exams (course_id, created_by, title, instructions, shuffle_questions, shuffle_options, allow_answer_review, fee_amount, fee_currency, status, second_grader_id, updated_at)
         VALUES ($1, $2, $3, $4, true, true, true, $5, 'USD', $6, $7, now()) RETURNING id`,
        [courseId, creator, title, instructions, fee, status, secondGrader],
      )).id;
    const addRules = async (examId, rules) => {
      const ids = [];
      for (const [i, r] of rules.entries()) {
        ids.push({ ...r, id: (await one(`INSERT INTO exam_rules (exam_id, question_type, difficulty, marks_per_question, question_count, position) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [examId, r.type, r.difficulty, r.marks, r.count, i + 1])).id });
      }
      return ids;
    };
    const instructions = "Ka jawaab dhammaan su'aalaha. Jawaabahaaga si toos ah ayaa loo kaydinayaa. (Answer all questions. Your answers are saved automatically.)";
    const midterm = await exam(C.CS201, U.axmed, "CS201 Midterm Examination", instructions, 0, "PUBLISHED", U.mustafe);
    const finalExam = await exam(C.CS201, U.axmed, "CS201 Final Examination", instructions, 5, "PUBLISHED");
    const quiz = await exam(C.CS105, U.mustafe, "CS105 Quiz 1", "Quiz gaaban oo 30 daqiiqo ah. (A short 30-minute quiz.)", 0, "PUBLISHED");
    await exam(C.BA110, U.khadra, "BA110 Midterm Examination (draft)", instructions, 0, "DRAFT");
    const midRules = await addRules(midterm, RULES_MIDTERM);
    await addRules(finalExam, RULES_FINAL);
    await addRules(quiz, [{ type: "MCQ", difficulty: "EASY", marks: 2, count: 3 }, { type: "TRUE_FALSE", difficulty: "EASY", marks: 1, count: 1 }]);

    const schedule = async (examId, requester, status, start, end, minutes, decider = null, reason = null) =>
      (await one(
        `INSERT INTO exam_schedules (exam_id, requested_by, decided_by, status, window_start, window_end, duration_minutes, rejection_reason, decided_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()) RETURNING id`,
        [examId, requester, decider, status, start, end, minutes, reason, decider ? addMin(start, -5 * 24 * 60) : null, addMin(start, -7 * 24 * 60)],
      )).id;
    const midStart = eat(-1, 9), midEnd = eat(-1, 11);
    const midSchedule = await schedule(midterm, U.axmed, "APPROVED", midStart, midEnd, 60, U.admin);
    await schedule(finalExam, U.axmed, "REJECTED", eat(6, 9), eat(6, 12), 90, U.admin, "Qolka waxaa isku dhacay munaasabad jaamacadeed. (Room clash with a university event.)");
    const finalStart = eat(7, 9), finalEnd = eat(7, 12);
    const finalSchedule = await schedule(finalExam, U.axmed, "APPROVED", finalStart, finalEnd, 90, U.admin);
    await schedule(quiz, U.mustafe, "REQUESTED", eat(9, 14), eat(9, 15), 30);
    for (const [s, room] of [[midSchedule, labA], [finalSchedule, labA], [finalSchedule, hall2]]) await q(`INSERT INTO schedule_rooms (schedule_id, room_id) VALUES ($1, $2)`, [s, room]);
    for (const [s, inv] of [[midSchedule, U.cabdiraxmaan], [midSchedule, U.deeqa], [finalSchedule, U.cabdiraxmaan]]) await q(`INSERT INTO schedule_invigilators (schedule_id, invigilator_id) VALUES ($1, $2)`, [s, inv]);
    await audit(U.admin, "SCHEDULE_APPROVED", "exam_schedule", midSchedule, { exam: "CS201 Midterm" }, addMin(midStart, -5 * 24 * 60));
    await audit(U.admin, "SCHEDULE_REJECTED", "exam", finalExam, { reason: "ROOM_CLASH" }, addMin(eat(6, 9), -5 * 24 * 60));
    await audit(U.admin, "SCHEDULE_APPROVED", "exam_schedule", finalSchedule, { exam: "CS201 Final" }, addMin(finalStart, -5 * 24 * 60));

    // --- Midterm attempts (randomized per student, same difficulty mix) -----------------------
    const takers = [
      { n: 1, offset: 4, used: 52, type: "MANUAL", extension: 0 },
      { n: 2, offset: 7, used: 58, type: "MANUAL", extension: 0 },
      { n: 3, offset: 10, used: null, type: "AUTO_DEADLINE", extension: 10 },
      { n: 4, offset: 12, used: 40, type: "MANUAL", extension: 0, skip: true },
      { n: 5, offset: 15, used: 55, type: "MANUAL", extension: 0 },
    ];
    const results = [];
    for (const t of takers) {
      const student = STUDENTS[t.n - 1];
      const studentId = U[`s${t.n}`];
      // Created live (deadline ahead) so the deadline trigger accepts the answers ...
      const attemptId = (await one(
        `INSERT INTO exam_attempts (exam_id, schedule_id, student_id, started_at, base_deadline, deadline, start_ip)
         VALUES ($1, $2, $3, now() - interval '1 minute', now() + interval '30 minutes', now() + interval '30 minutes', '10.10.4.' || $4::text) RETURNING id`,
        [midterm, midSchedule, studentId, 30 + t.n],
      )).id;

      const drawn = [];
      for (const rule of midRules) {
        const pool = bankCS201.filter((v) => v.type === rule.type && v.difficulty === rule.difficulty && v.marks === rule.marks);
        for (const v of shuffle(pool).slice(0, rule.count)) drawn.push({ v, ruleId: rule.id });
      }
      const ordered = shuffle(drawn);
      const items = [];
      for (const [i, { v, ruleId }] of ordered.entries()) {
        const optionOrder = shuffle(v.optionIds);
        const aq = (await one(
          `INSERT INTO attempt_questions (attempt_id, question_version_id, exam_rule_id, position, option_order, marks, is_flagged)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [attemptId, v.versionId, ruleId, i + 1, optionOrder, v.marks, v.type === "ESSAY" && t.n === 2],
        )).id;
        items.push({ aq, v, position: i + 1 });
      }

      // Answers
      const graded = [];
      for (const item of items) {
        const { v } = item;
        const correct = rand() < student.ability;
        let row;
        if (t.skip && v.type === "TRUE_FALSE" && !graded.some((g) => g.status === "NOT_ANSWERED")) {
          row = { option: null, text: null, status: "NOT_ANSWERED", marks: 0 };
        } else if (v.type === "MCQ" || v.type === "TRUE_FALSE") {
          const option = correct ? v.correctOptionId : pick(v.optionIds.filter((o) => o !== v.correctOptionId));
          row = { option, text: null, status: correct ? "AUTO_CORRECT" : "AUTO_INCORRECT", marks: correct ? v.marks : 0 };
        } else if (v.type === "SHORT_ANSWER") {
          const matched = t.n !== 4 && correct;
          const text = matched ? `  ${v.def.accepted[0].toLowerCase()}  ` : v.def.wrong; // spacing/case show the normalisation
          row = { option: null, text, status: matched ? "AUTO_CORRECT" : "NEEDS_REVIEW", marks: matched ? v.marks : null };
        } else {
          row = { option: null, text: `${v.def.sample} (${student.name.split(" ")[0]})`, status: "PENDING_ESSAY", marks: null };
        }
        const answerId = row.status === "NOT_ANSWERED"
          ? (await one(`INSERT INTO answers (attempt_id, attempt_question_id, question_version_id) VALUES ($1, $2, $3) RETURNING id`, [attemptId, item.aq, v.versionId])).id
          : (await one(`INSERT INTO answers (attempt_id, attempt_question_id, question_version_id, selected_option_id, text_answer) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [attemptId, item.aq, v.versionId, row.option, row.text])).id;
        graded.push({ ...row, answerId, item });
      }

      // ... then submitted and moved to yesterday's exam window.
      const startedAt = addMin(midStart, t.offset);
      const baseDeadline = new Date(Math.min(addMin(startedAt, 60).getTime(), midEnd.getTime()));
      const deadline = addMin(baseDeadline, t.extension);
      const submittedAt = t.used ? addMin(startedAt, t.used) : deadline;
      const focus = t.n === 4 ? [[9, 2500], [21, 4000], [33, 12000], [36, 600]] : t.n === 2 ? [[18, 1800]] : [];
      const counted = focus.filter(([, ms]) => ms >= 1000).length;
      await q(
        `UPDATE exam_attempts SET status = 'SUBMITTED', submission_type = $2, started_at = $3, base_deadline = $4,
                total_extension_minutes = $5, deadline = $6, submitted_at = $7, last_seen_at = $7, counted_focus_losses = $8
          WHERE id = $1`,
        [attemptId, t.type, startedAt, baseDeadline, t.extension, deadline, submittedAt, counted],
      );
      for (const [i, g] of graded.entries()) {
        await q(`UPDATE answers SET saved_at = $2 WHERE id = $1`, [g.answerId, addMin(startedAt, 3 + i * 4)]);
      }
      for (const [minute, ms] of focus) {
        const lost = addMin(startedAt, minute);
        await q(
          `INSERT INTO focus_events (attempt_id, client_event_id, lost_at, returned_at, duration_ms, is_counted) VALUES ($1, gen_random_uuid(), $2, $3, $4, $5)`,
          [attemptId, lost, new Date(lost.getTime() + ms), ms, ms >= 1000],
        );
      }
      if (t.extension) {
        await q(
          `INSERT INTO time_extensions (attempt_id, granted_by, minutes, reason, created_at) VALUES ($1, $2, $3, $4, $5)`,
          [attemptId, U.cabdiraxmaan, t.extension, "Korontada ayaa go'day 10 daqiiqo gudaha Shaybaarka A. (Power cut in Lab A for 10 minutes.)", addMin(startedAt, 25)],
        );
        await audit(U.cabdiraxmaan, "TIME_EXTENSION_GRANTED", "exam_attempt", attemptId, { minutes: t.extension, reasonCode: "POWER_CUT" }, addMin(startedAt, 25));
      }
      if (counted >= 3) {
        await q(
          `INSERT INTO invigilator_notes (schedule_id, student_id, author_id, text, created_at) VALUES ($1, $2, $3, $4, $5)`,
          [midSchedule, studentId, U.deeqa, `Ardayga ${student.number} wuxuu ka baxay bogga imtixaanka ${counted} jeer; waa la digay. (Left the exam tab ${counted} times; warned.)`, addMin(startedAt, 34)],
        );
      }
      results.push({ t, student, studentId, attemptId, graded });
    }
    await q(
      `INSERT INTO invigilator_notes (schedule_id, author_id, text, created_at) VALUES ($1, $2, $3, $4)`,
      [midSchedule, U.cabdiraxmaan, "Imtixaanku wuxuu bilaabmay waqtigii loogu talagalay. 3 arday ma iman. (The exam started on time. 3 students were absent.)", addMin(midStart, 2)],
    );

    // --- Grading: objective answers are already marked; now reviews and essays ---------------
    for (const r of results) {
      for (const g of r.graded) {
        const { v } = g.item;
        if (g.status === "AUTO_CORRECT" || g.status === "AUTO_INCORRECT" || g.status === "NOT_ANSWERED") {
          await q(`UPDATE answers SET grading_status = $2, marks_awarded = $3 WHERE id = $1`, [g.answerId, g.status, g.marks]);
        } else if (g.status === "NEEDS_REVIEW") {
          g.marks = 0; // reviewed by the lecturer; student 4's mark is raised in the regrade below
          await q(`UPDATE answers SET grading_status = 'GRADED', marks_awarded = 0, graded_by = $2, graded_at = $3 WHERE id = $1`, [g.answerId, U.axmed, eat(0, 8)]);
        } else {
          // Essay: first grader (course lecturer) and blind second grader (D7); final = average.
          const scale = 0.4 + r.student.ability * 0.6;
          const first = v.criteria.map((c) => Math.min(c.max, Math.round(c.max * scale)));
          const second = first.map((m, i) => Math.max(0, Math.min(v.criteria[i].max, m + (i === 1 ? -1 : 0))));
          for (const [role, grader, marks, comment] of [
            ["FIRST", U.axmed, first, "Sharraxaad wanaagsan; tusaalaha wuxuu u baahan yahay faahfaahin. (Good explanation; the example needs more detail.)"],
            ["SECOND", U.mustafe, second, "Clear structure. Example is partly correct."],
          ]) {
            const total = marks.reduce((a, b) => a + b, 0);
            const em = (await one(
              `INSERT INTO essay_marks (answer_id, grader_id, grader_role, total_marks, comment, updated_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
              [g.answerId, grader, role, total, comment],
            )).id;
            for (const [i, c] of v.criteria.entries()) await q(`INSERT INTO essay_criterion_marks (essay_mark_id, rubric_criterion_id, marks) VALUES ($1, $2, $3)`, [em, c.id, marks[i]]);
          }
          g.marks = (first.reduce((a, b) => a + b, 0) + second.reduce((a, b) => a + b, 0)) / 2;
          await q(`UPDATE answers SET grading_status = 'GRADED', marks_awarded = $2, graded_by = $3, graded_at = $4 WHERE id = $1`, [g.answerId, g.marks, U.axmed, eat(0, 8, 30)]);
        }
      }
    }

    const maxScore = RULES_MIDTERM.reduce((sum, r) => sum + r.marks * r.count, 0);
    const scoreOf = (r) => r.graded.reduce((sum, g) => sum + Number(g.marks ?? 0), 0);
    async function writeGrades() {
      for (const r of results) {
        const total = scoreOf(r);
        const pct = Math.round((total / maxScore) * 10000) / 100;
        r.grade = { total, pct, letter: letterFor(pct) };
        await q(
          `INSERT INTO grades (attempt_id, total_score, max_score, percentage, letter_grade, calculated_at) VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (attempt_id) DO UPDATE SET total_score = EXCLUDED.total_score, percentage = EXCLUDED.percentage, letter_grade = EXCLUDED.letter_grade, calculated_at = now()`,
          [r.attemptId, total, maxScore, pct, r.grade.letter],
        );
      }
    }
    async function publish(number, reason) {
      const pub = (await one(`INSERT INTO result_publications (exam_id, publication_number, published_by, reason) VALUES ($1, $2, $3, $4) RETURNING id`, [midterm, number, U.axmed, reason])).id;
      for (const r of results) {
        const questionMarks = r.graded.map((g) => ({ position: g.item.position, questionVersionId: g.item.v.versionId, maxMarks: g.item.v.marks, awarded: Number(g.marks ?? 0) }));
        await q(
          `INSERT INTO grade_revisions (publication_id, attempt_id, revision_number, total_score, max_score, percentage, letter_grade, question_marks, counted_focus_losses)
           SELECT $1, $2, $3, $4, $5, $6, $7, $8, counted_focus_losses FROM exam_attempts WHERE id = $2`,
          [pub, r.attemptId, number, r.grade.total, maxScore, r.grade.pct, r.grade.letter, JSON.stringify(questionMarks)],
        );
      }
      await q(`UPDATE exams SET results_status = 'PUBLISHED', updated_at = now() WHERE id = $1`, [midterm]);
      return pub;
    }

    await writeGrades();
    await publish(1, null);
    await audit(U.axmed, "RESULTS_PUBLISHED", "exam", midterm, { publication: 1 });

    // Regrade after a student's review request: reopen, raise one reviewed short answer, republish.
    await q(`UPDATE exams SET results_status = 'REOPENED', updated_at = now() WHERE id = $1`, [midterm]);
    await audit(U.axmed, "RESULTS_REOPENED", "exam", midterm, { reasonCode: "REVIEW_REQUEST" });
    const changed = results.find((r) => r.t.n === 4);
    const reviewed = changed.graded.find((g) => g.item.v.type === "SHORT_ANSWER");
    reviewed.marks = 1;
    await q(`UPDATE answers SET marks_awarded = 1, graded_at = now() WHERE id = $1`, [reviewed.answerId]);
    await writeGrades();
    await publish(2, "Dib-u-eegis: jawaab gaaban ayaa la saxay kadib codsiga ardayga. (Regrade: a short answer was re-marked after the student's review request.)");
    await audit(U.axmed, "RESULTS_REPUBLISHED", "exam", midterm, { publication: 2, changedAttempts: 1 });

    // Student 5 drops CS201 after the midterm; the result stays.
    await q(`UPDATE enrolments SET status = 'DROPPED', dropped_at = now() WHERE student_id = $1 AND course_id = $2`, [U.s5, C.CS201]);
    await audit(U.admin, "ENROLMENT_DROPPED", "course", C.CS201, { student: STUDENTS[4].number });

    // An edited question (version 2) for one question already used in the midterm.
    const usedQuestion = bankCS201.find((v) => v.type === "MCQ" && results.some((r) => r.graded.some((g) => g.item.v.versionId === v.versionId)));
    const newText = `${usedQuestion.def.text.replace(/:$/, "")} (revised wording)`;
    const v2 = (await one(
      `INSERT INTO question_versions (question_id, version_number, type, text, marks, difficulty, topic_id) VALUES ($1, 2, 'MCQ', $2, 2, $3, $4) RETURNING id`,
      [usedQuestion.questionId, newText, usedQuestion.difficulty, usedQuestion.topicId],
    )).id;
    for (const [i, text] of usedQuestion.def.options.entries()) {
      await q(`INSERT INTO question_options (question_version_id, text, is_correct, position) VALUES ($1, $2, $3, $4)`, [v2, text, i === usedQuestion.def.correct, i + 1]);
    }
    await q(`UPDATE questions SET current_version_id = $1, normalized_text = $2, updated_at = now() WHERE id = $3`, [v2, normalize(newText), usedQuestion.questionId]);

    // --- Simulated payments for the upcoming final -------------------------------------------
    const pay = async (n, provider, phone) => (await one(
      `INSERT INTO payments (student_id, exam_id, provider, phone, amount, currency, merchant_name, merchant_number, idempotency_key)
       VALUES ($1, $2, $3, $4, 5.00, 'USD', $5, $6, gen_random_uuid()) RETURNING id`,
      [U[`s${n}`], finalExam, provider, phone, MERCHANT.name, MERCHANT.number],
    )).id;
    const yes = (id) => q(`UPDATE payments SET status = 'PENDING_PIN', confirmed_at = now() WHERE id = $1`, [id]);
    const wrongPin = (id, k) => q(`UPDATE payments SET pin_attempts = $2 WHERE id = $1`, [id, k]);
    const succeed = async (id, provider) => {
      const code = { EVC_PLUS: "EVC", ZAAD: "ZAAD", EDAHAB: "EDAHAB" }[provider];
      const receipt = `DEMO-${code}-${todayStamp()}-${receiptCode()}`;
      await q(`UPDATE payments SET status = 'SUCCESS', receipt_number = $2, mock_reference = $3, completed_at = now() WHERE id = $1`, [id, receipt, `MOCK-${receiptCode()}`]);
      return receipt;
    };
    const receipts = {};
    for (const [n, provider, phone, wrong] of [[1, "EVC_PLUS", "+252615123401", 0], [2, "ZAAD", "+252634234502", 0], [3, "EDAHAB", "+252623345603", 1]]) {
      const id = await pay(n, provider, phone);
      await yes(id);
      for (let k = 1; k <= wrong; k++) await wrongPin(id, k);
      receipts[n] = await succeed(id, provider);
    }
    const failedId = await pay(4, "EVC_PLUS", "+252615456704");
    await yes(failedId);
    await wrongPin(failedId, 1);
    await wrongPin(failedId, 2);
    await q(`UPDATE payments SET pin_attempts = 3, status = 'FAILED', failure_reason = 'PIN_ATTEMPTS_EXCEEDED', completed_at = now() WHERE id = $1`, [failedId]);
    const retryId = await pay(4, "EVC_PLUS", "+252615456704");
    await yes(retryId);
    receipts[4] = await succeed(retryId, "EVC_PLUS");
    const cancelledId = await pay(6, "EVC_PLUS", "+252652678906");
    await q(`UPDATE payments SET status = 'CANCELLED', completed_at = now() WHERE id = $1`, [cancelledId]);
    await pay(7, "ZAAD", "+252634789007"); // left at the Yes/No step; expires after 5 minutes

    // --- SMS outbox (simulated) and in-app notifications --------------------------------------
    const lang = (n) => STUDENTS[n - 1].lang;
    const sms = async (n, template, params, status, related) => {
      const body = SMS_TEXT[template][lang(n)](params);
      const sent = status === "QUEUED" ? null : new Date();
      await q(
        `INSERT INTO sms_outbox (recipient_id, phone, language, template_key, params, body, sender_id, segments, status, related_type, related_id, sent_at, delivered_at, failure_reason)
         VALUES ($1, $2, $3, $4, $5, $6, 'JAAMACADDA-DEMO', $7, $8, $9, $10, $11, $12, $13)`,
        [U[`s${n}`], STUDENTS[n - 1].phone, lang(n), template, JSON.stringify(params), body, Math.ceil(body.length / 160), status,
          related?.[0] ?? null, related?.[1] ?? null, sent, status === "DELIVERED" ? new Date() : null, status === "FAILED" ? "SIMULATED_NETWORK_ERROR" : null],
      );
    };
    const notify = (n, template, params, read = false) =>
      q(`INSERT INTO notifications (user_id, template_key, params, read_at) VALUES ($1, $2, $3, $4)`, [U[`s${n}`], template, JSON.stringify(params), read ? new Date() : null]);

    for (const s of STUDENTS) await sms(s.n, "ACCOUNT_CREATED", { studentNumber: s.number }, s.n === 8 ? "FAILED" : "DELIVERED", ["user", U[`s${s.n}`]]);
    const finalDate = finalStart.toISOString().slice(0, 10).split("-").reverse().join("/");
    for (const n of [1, 2, 3, 4, 6, 7, 8]) await sms(n, "SCHEDULE_APPROVED", { course: "CS201", date: finalDate, window: "09:00–12:00" }, n <= 4 ? "DELIVERED" : "SENT", ["exam_schedule", finalSchedule]);
    for (const n of [1, 2, 3, 4]) await sms(n, "PAYMENT_SUCCESS", { amount: "5.00 USD", receipt: receipts[n] }, "DELIVERED", ["exam", finalExam]);
    for (const r of results) {
      await sms(r.t.n, "RESULTS_PUBLISHED", { course: "CS201" }, "DELIVERED", ["exam", midterm]);
      await notify(r.t.n, "RESULTS_PUBLISHED", { course: "CS201", exam: "CS201 Midterm Examination" }, r.t.n !== 4);
    }
    await sms(4, "RESULTS_CHANGED", { course: "CS201" }, "QUEUED", ["exam", midterm]);
    await notify(4, "RESULTS_CHANGED", { course: "CS201", exam: "CS201 Midterm Examination" });
    for (const n of [1, 2, 3, 4, 6, 7, 8]) await notify(n, "SCHEDULE_APPROVED", { course: "CS201", exam: "CS201 Final Examination", date: finalDate });

    await q("COMMIT");

    // --- Report and account file (only after a successful commit) ----------------------------
    const lines = [
      "# Demo accounts (LOCAL FILE, never commit or share publicly)",
      "",
      `Database host: ${new URL(url).hostname}  |  Created: ${new Date().toISOString()}`,
      "",
      "| Role | Name | Login | Password |",
      "|---|---|---|---|",
      ...accounts.map((a) => `| ${a.role} | ${a.name} | ${a.login} | \`${a.password}\` |`),
      "",
    ];
    fs.writeFileSync(ACCOUNTS_FILE, lines.join("\n"), { mode: 0o600 });
    console.log("Demo data created:");
    for (const r of results) console.log(`  midterm ${r.student.number}: ${r.grade.total}/${maxScore} = ${r.grade.pct}% (${r.grade.letter})`);
    console.log(`  ${accounts.length} demo accounts; passwords saved to ${ACCOUNTS_FILE}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seeding failed; nothing was saved:", error.message);
  process.exit(1);
});
