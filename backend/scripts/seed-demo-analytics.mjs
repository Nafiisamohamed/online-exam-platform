/**
 * Adds a larger, completed exam to the demo data so question analytics show
 * real numbers (each question needs at least 5 answers, section 4.13).
 *
 * Requires the base demo data (npm run db:seed:demo). It ADDS, and never
 * changes or deletes existing rows:
 *   - 30 more students (DEMO-2026-0011 ... 0040), enrolled in CS105;
 *   - 15 more CS105 questions (MCQ, True/False, short answer);
 *   - "CS105 Practice Test 1", held 3 days ago, with an approved schedule:
 *     38 of the 40 CS105 students sat it (2 absent), each with their own random
 *     question set, a few tab switches, automatic and reviewed short answers;
 *   - grades, publication 1 with grade revisions, RESULTS_PUBLISHED SMS
 *     messages and notifications, and audit log entries.
 * One question is answered correctly by almost everyone and one by almost
 * nobody, so both analytics highlights (over 95%, under 20%) appear.
 *
 * Connection: DATABASE_URL (the exam_app role), like the base seed.
 * Safety: refuses to run twice, everything in ONE transaction. New passwords
 * are appended to backend/demo-accounts.local.md (ignored by git) after commit.
 *
 * Usage: npm run db:seed:demo:analytics
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
dotenv.config({ path: path.join(backendDir, ".env") });
const ACCOUNTS_FILE = process.env.SEED_ACCOUNTS_FILE || path.join(backendDir, "demo-accounts.local.md");
const EXAM_TITLE = "CS105 Practice Test 1";

// Deterministic random numbers (same data on every database).
let seed = 20261107;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const normalize = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
const addMin = (d, m) => new Date(d.getTime() + m * 60_000);
/** hh:mm Mogadishu time (UTC+3), `days` from today. */
function eat(days, hh, mm = 0) {
  const local = new Date(Date.now() + 3 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, hh - 3, mm));
}

const FIRST = ["Xamdi", "Cabdiraxiim", "Sacdiya", "Mustafe", "Hibo", "Liibaan", "Ruqiya", "Cabdisalaan", "Ikraan", "Saciid", "Nasra", "Bilaal", "Shukri", "Zakariye", "Hamse", "Ubax", "Cabdinaasir", "Kowsar", "Mahad", "Najma", "Guuleed", "Fartuun", "Abshir", "Sagal", "Khaliif", "Hawo", "Ilyaas", "Deeqa", "Warsame", "Muna"];
const MIDDLE = ["Cali", "Xasan", "Maxamed", "Axmed", "Cabdi", "Yuusuf", "Nuur", "Jaamac", "Faarax", "Aadan"];
const LAST = ["Warsame", "Samatar", "Guuleed", "Ducaale", "Raage", "Muuse", "Xirsi", "Siciid", "Cilmi", "Mire"];
const PREFIX = ["61", "62", "63", "65", "68", "77"];
const NEW_STUDENTS = FIRST.map((first, i) => ({
  n: i + 11,
  number: `DEMO-2026-${String(i + 11).padStart(4, "0")}`,
  name: `${first} ${MIDDLE[i % 10]} ${LAST[(i * 3) % 10]}`,
  phone: `+252${PREFIX[i % PREFIX.length]}${String(4100000 + i * 7919).slice(0, 7)}`,
  lang: i % 4 === 0 ? "en" : "so",
}));

const mcq = (difficulty, text, options, special) => ({ type: "MCQ", difficulty, marks: 2, text, options, special });
const tf = (text, isTrue) => ({ type: "TRUE_FALSE", difficulty: "EASY", marks: 1, text, options: ["TRUE", "FALSE"], correct: isTrue ? 0 : 1 });
const short = (text, accepted, near) => ({ type: "SHORT_ANSWER", difficulty: "MEDIUM", marks: 2, text, accepted, near });
const NEW_QUESTIONS = {
  Variables: [
    mcq("EASY", "Which symbol is used to assign a value to a variable in most languages?", ["=", "==", "=>", "::"], "EASY_FOR_ALL"),
    mcq("EASY", "Which value is a Boolean?", ["true", "\"true\"", "1.5", "'t'"]),
    mcq("MEDIUM", "What is the value of x after: x = 7; x = x % 3?", ["1", "2", "0", "3"]),
    mcq("MEDIUM", "Which type should store a price such as 12.50 exactly?", ["Decimal", "Float", "Integer", "Boolean"], "HARD_FOR_ALL"),
    tf("Variable names are usually case-sensitive.", true),
    short("Name the data type that stores text.", ["String"], "Text."),
  ],
  Loops: [
    mcq("EASY", "How many times does for (i = 0; i < 3; i++) run?", ["3", "2", "4", "Forever"]),
    mcq("EASY", "Which statement skips to the next loop iteration?", ["continue", "break", "return", "exit"]),
    mcq("MEDIUM", "What is printed by: s = 0; for i in 1..4: s = s + i; print(s)?", ["10", "4", "6", "24"]),
    mcq("MEDIUM", "Which loop is best when the number of repetitions is known?", ["for", "while", "do-while", "goto"]),
    mcq("MEDIUM", "A loop whose condition never becomes false is called:", ["An infinite loop", "A nested loop", "A counted loop", "A for-each loop"]),
    mcq("MEDIUM", "Which loop visits every item of a list without an index?", ["for-each", "do-while", "while", "switch"]),
    tf("A for loop can never be nested inside another for loop.", false),
    short("Which keyword exits a loop immediately?", ["break"], "Break;"),
    short("What do we call one pass through the body of a loop?", ["Iteration", "An iteration"], "Repeat"),
  ],
};
const RULES = [
  { type: "MCQ", difficulty: "EASY", marks: 2, count: 4 },
  { type: "MCQ", difficulty: "MEDIUM", marks: 2, count: 3 },
  { type: "TRUE_FALSE", difficulty: "EASY", marks: 1, count: 2 },
  { type: "SHORT_ANSWER", difficulty: "MEDIUM", marks: 2, count: 1 },
];
const SMS = {
  so: (course) => `[DEMO] Natiijada ${course} waa la daabacay. Gal nidaamka si aad u aragto.`,
  en: (course) => `[DEMO] Your ${course} results have been published. Log in to view them.`,
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (the exam_app connection) is not set.");
  const client = new pg.Client(pgClientConfig(url));
  await client.connect();
  const q = (sql, params) => client.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  try {
    const me = await one(`SELECT current_user AS name`);
    if (me.name !== "exam_app" && !process.env.SEED_ALLOW_OWNER) throw new Error(`Connect as exam_app (connected as ${me.name}).`);
    const staff = Object.fromEntries((await q(`SELECT email, id FROM users WHERE email LIKE '%@uni-demo.test'`)).rows.map((r) => [r.email, r.id]));
    const admin = staff["registrar@uni-demo.test"];
    const lecturer = staff["mustafe.jibriil@uni-demo.test"];
    const invigilator = staff["cabdiraxmaan.faarax@uni-demo.test"];
    if (!admin || !lecturer || !invigilator) throw new Error("Run npm run db:seed:demo first (base demo data not found).");
    if ((await q(`SELECT 1 FROM exams WHERE title = $1`, [EXAM_TITLE])).rowCount || (await q(`SELECT 1 FROM users WHERE student_number = 'DEMO-2026-0011'`)).rowCount) {
      console.log("The analytics demo data is already there. Nothing was changed.");
      return;
    }
    const course = await one(`SELECT id, code FROM courses WHERE code = 'CS105' AND lecturer_id = $1`, [lecturer]);
    const room = await one(`SELECT id FROM rooms ORDER BY name LIMIT 1`);
    const studentRole = (await one(`SELECT id FROM roles WHERE name = 'STUDENT'`)).id;
    const scale = (await q(`SELECT letter, min_percentage::float8 AS min FROM grading_scale ORDER BY min_percentage DESC`)).rows;
    const letterFor = (pct) => (scale.find((b) => pct >= b.min) ?? scale[scale.length - 1]).letter;

    // Passwords are hashed before the transaction (bcrypt is slow on purpose).
    const accounts = await Promise.all(NEW_STUDENTS.map(async (s) => {
      const password = crypto.randomBytes(12).toString("base64url");
      return { ...s, password, hash: await bcrypt.hash(password, 12) };
    }));

    await q("BEGIN");
    const audit = (actor, action, type, id, details, at) =>
      q(`INSERT INTO audit_logs (actor_id, action_code, entity_type, entity_id, details, ip_address, created_at) VALUES ($1, $2, $3, $4, $5, '10.10.4.20', $6)`, [actor, action, type, id, details ? JSON.stringify(details) : null, at]);

    // --- Students and enrolment -------------------------------------------------------
    const students = [];
    for (const a of accounts) {
      const id = (await one(
        `INSERT INTO users (role_id, student_number, full_name, phone, password_hash, preferred_language, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id`,
        [studentRole, a.number, a.name, a.phone, a.hash, a.lang],
      )).id;
      await q(`INSERT INTO enrolments (student_id, course_id, enrolled_at) VALUES ($1, $2, $3)`, [id, course.id, eat(-20, 9)]);
      students.push({ id, number: a.number, phone: a.phone, lang: a.lang });
    }
    await audit(admin, "ENROLMENTS_IMPORTED", "course", course.id, { semester: "2026-Fall", rows: accounts.length }, eat(-20, 9));
    const existing = (await q(
      `SELECT u.id, u.student_number AS number, u.phone, u.preferred_language AS lang FROM users u JOIN enrolments e ON e.student_id = u.id
        WHERE e.course_id = $1 AND e.status = 'ACTIVE' AND u.student_number <= 'DEMO-2026-0010' ORDER BY u.student_number`, [course.id],
    )).rows;
    const takers = [...existing, ...students].map((s, i) => ({ ...s, ability: 0.3 + ((i * 37) % 65) / 100 }));

    // --- New questions ------------------------------------------------------------------
    for (const [topicName, list] of Object.entries(NEW_QUESTIONS)) {
      const topic = (await one(`SELECT id FROM topics WHERE course_id = $1 AND name = $2`, [course.id, topicName]))?.id
        ?? (await one(`INSERT INTO topics (course_id, name) VALUES ($1, $2) RETURNING id`, [course.id, topicName])).id;
      for (const def of list) {
        const qid = (await one(`INSERT INTO questions (course_id, created_by, normalized_text, updated_at) VALUES ($1, $2, $3, $4) RETURNING id`, [course.id, lecturer, normalize(def.text), eat(-10, 10)])).id;
        const vid = (await one(`INSERT INTO question_versions (question_id, version_number, type, text, marks, difficulty, topic_id) VALUES ($1, 1, $2, $3, $4, $5, $6) RETURNING id`, [qid, def.type, def.text, def.marks, def.difficulty, topic])).id;
        await q(`UPDATE questions SET current_version_id = $1 WHERE id = $2`, [vid, qid]);
        for (const [i, text] of (def.options ?? []).entries()) {
          await q(`INSERT INTO question_options (question_version_id, text, is_correct, position) VALUES ($1, $2, $3, $4)`, [vid, text, i === (def.correct ?? 0), i + 1]);
        }
        for (const ans of def.accepted ?? []) await q(`INSERT INTO accepted_answers (question_version_id, answer_text, normalized_text) VALUES ($1, $2, $3)`, [vid, ans, normalize(ans)]);
      }
    }
    await audit(lecturer, "QUESTIONS_IMPORTED", "course", course.id, { valid: 15, invalid: 0, duplicates: 0 }, eat(-10, 10));

    // The whole current CS105 bank, by rule.
    const bank = (await q(
      `SELECT v.id, v.type::text, v.difficulty::text, v.marks::float8 AS marks, v.text,
              (SELECT array_agg(o.id ORDER BY o.position) FROM question_options o WHERE o.question_version_id = v.id) AS options,
              (SELECT o.id FROM question_options o WHERE o.question_version_id = v.id AND o.is_correct) AS correct,
              (SELECT array_agg(a.answer_text) FROM accepted_answers a WHERE a.question_version_id = v.id) AS accepted
         FROM questions q JOIN question_versions v ON v.id = q.current_version_id
        WHERE q.course_id = $1 AND NOT q.is_archived`, [course.id],
    )).rows;
    const special = new Map(Object.values(NEW_QUESTIONS).flat().filter((d) => d.special).map((d) => [d.text, d.special]));
    const near = new Map(Object.values(NEW_QUESTIONS).flat().filter((d) => d.near).map((d) => [d.text, d.near]));

    // --- Exam, rules, schedule ----------------------------------------------------------
    const exam = (await one(
      `INSERT INTO exams (course_id, created_by, title, instructions, shuffle_questions, shuffle_options, allow_answer_review, fee_amount, fee_currency, status, results_status, updated_at)
       VALUES ($1, $2, $3, $4, true, true, true, 0, 'USD', 'PUBLISHED', 'PUBLISHED', now()) RETURNING id`,
      [course.id, lecturer, EXAM_TITLE, "Ka jawaab dhammaan su'aalaha. 45 daqiiqo. (Answer all questions. 45 minutes.)"],
    )).id;
    const rules = [];
    for (const [i, r] of RULES.entries()) {
      const id = (await one(`INSERT INTO exam_rules (exam_id, question_type, difficulty, marks_per_question, question_count, position) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [exam, r.type, r.difficulty, r.marks, r.count, i + 1])).id;
      const pool = bank.filter((v) => v.type === r.type && v.difficulty === r.difficulty && v.marks === r.marks);
      if (pool.length < r.count) throw new Error(`Not enough CS105 questions for rule ${i + 1}`);
      rules.push({ ...r, id, pool });
    }
    const windowStart = eat(-3, 13);
    const windowEnd = eat(-3, 15);
    const schedule = (await one(
      `INSERT INTO exam_schedules (exam_id, requested_by, decided_by, status, window_start, window_end, duration_minutes, decided_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'APPROVED', $4, $5, 45, $6, $6, now()) RETURNING id`,
      [exam, lecturer, admin, windowStart, windowEnd, eat(-8, 10)],
    )).id;
    if (room) await q(`INSERT INTO schedule_rooms (schedule_id, room_id) VALUES ($1, $2)`, [schedule, room.id]);
    await q(`INSERT INTO schedule_invigilators (schedule_id, invigilator_id) VALUES ($1, $2)`, [schedule, invigilator]);
    await audit(lecturer, "EXAM_PUBLISHED", "exam", exam, null, eat(-9, 10));
    await audit(admin, "SCHEDULE_APPROVED", "exam_schedule", schedule, { exam: EXAM_TITLE }, eat(-8, 10));

    // --- Attempts: created live (so the deadline trigger accepts the answers), then moved to the window ---
    const usage = new Map();
    const absent = new Set([takers[13].id, takers[27].id]);
    const results = [];
    for (const [k, s] of takers.entries()) {
      if (absent.has(s.id)) continue;
      const attempt = (await one(
        `INSERT INTO exam_attempts (exam_id, schedule_id, student_id, started_at, base_deadline, deadline, start_ip)
         VALUES ($1, $2, $3, now() - interval '1 minute', now() + interval '30 minutes', now() + interval '30 minutes', $4) RETURNING id`,
        [exam, schedule, s.id, `10.10.4.${40 + k}`],
      )).id;
      // Least-used questions first, as the real generator does.
      const drawn = [];
      for (const r of rules) {
        const pick = shuffle(r.pool).sort((a, b) => (usage.get(a.id) ?? 0) - (usage.get(b.id) ?? 0)).slice(0, r.count);
        for (const v of pick) { usage.set(v.id, (usage.get(v.id) ?? 0) + 1); drawn.push({ v, rule: r }); }
      }
      const items = [];
      for (const [i, { v, rule }] of shuffle(drawn).entries()) {
        const order = v.type === "MCQ" ? shuffle(v.options) : v.options ?? [];
        const aq = (await one(`INSERT INTO attempt_questions (attempt_id, question_version_id, exam_rule_id, position, option_order, marks) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [attempt, v.id, rule.id, i + 1, order, v.marks])).id;
        let p = v.difficulty === "EASY" ? Math.min(0.97, s.ability + 0.2) : s.ability - 0.05;
        if (special.get(v.text) === "EASY_FOR_ALL") p = 1;
        if (special.get(v.text) === "HARD_FOR_ALL") p = s.ability > 0.9 ? 0.5 : 0.05;
        const correct = rand() < p;
        let row;
        if (v.type === "SHORT_ANSWER") {
          const nearMiss = !correct && rand() < 0.5;
          const text = correct ? `  ${v.accepted[0].toUpperCase()} ` : nearMiss ? near.get(v.text) ?? "?" : "I am not sure";
          const matched = (v.accepted ?? []).map(normalize).includes(normalize(text));
          row = { text, option: null, status: matched ? "AUTO_CORRECT" : "GRADED", marks: matched ? v.marks : nearMiss ? v.marks : 0, reviewed: !matched };
        } else {
          const option = correct ? v.correct : shuffle(v.options.filter((o) => o !== v.correct))[0];
          row = { text: null, option, status: option === v.correct ? "AUTO_CORRECT" : "AUTO_INCORRECT", marks: option === v.correct ? v.marks : 0 };
        }
        const answer = (await one(`INSERT INTO answers (attempt_id, attempt_question_id, question_version_id, selected_option_id, text_answer) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [attempt, aq, v.id, row.option, row.text])).id;
        items.push({ ...row, answer, aq, position: i + 1, v });
      }
      const startedAt = addMin(windowStart, 2 + (k % 20));
      const deadline = addMin(startedAt, 45);
      const auto = k % 11 === 5;
      const submittedAt = auto ? deadline : addMin(startedAt, 25 + (k % 18));
      const switches = k % 7 === 3 ? [[6, 2200], [14, 800], [22, 3500]] : k % 9 === 4 ? [[10, 1600]] : [];
      const counted = switches.filter(([, ms]) => ms >= 1000).length;
      await q(`UPDATE exam_attempts SET status = 'SUBMITTED', submission_type = $2, started_at = $3, base_deadline = $4, deadline = $4, submitted_at = $5, last_seen_at = $5, counted_focus_losses = $6 WHERE id = $1`,
        [attempt, auto ? "AUTO_DEADLINE" : "MANUAL", startedAt, deadline, submittedAt, counted]);
      for (const [i, it] of items.entries()) {
        await q(`UPDATE answers SET saved_at = $2 WHERE id = $1`, [it.answer, addMin(startedAt, 2 + i * 2)]);
        await q(`UPDATE answers SET grading_status = $2, marks_awarded = $3, graded_by = $4, graded_at = $5 WHERE id = $1`,
          [it.answer, it.status, it.marks, it.reviewed ? lecturer : null, it.reviewed ? eat(-2, 10) : null]);
      }
      for (const [minute, ms] of switches) {
        const lost = addMin(startedAt, minute);
        await q(`INSERT INTO focus_events (attempt_id, client_event_id, lost_at, returned_at, duration_ms, is_counted) VALUES ($1, gen_random_uuid(), $2, $3, $4, $5)`, [attempt, lost, new Date(lost.getTime() + ms), ms, ms >= 1000]);
      }
      const max = items.reduce((t, it) => t + it.v.marks, 0);
      const total = items.reduce((t, it) => t + it.marks, 0);
      const pct = Math.round((total / max) * 10000) / 100;
      await q(`INSERT INTO grades (attempt_id, total_score, max_score, percentage, letter_grade, calculated_at) VALUES ($1, $2, $3, $4, $5, $6)`, [attempt, total, max, pct, letterFor(pct), eat(-2, 11)]);
      results.push({ s, attempt, items, total, max, pct, counted });
    }

    // --- Publication 1, revisions, messages ---------------------------------------------------
    const publishedAt = eat(-2, 12);
    const pub = (await one(`INSERT INTO result_publications (exam_id, publication_number, published_by, published_at) VALUES ($1, 1, $2, $3) RETURNING id`, [exam, lecturer, publishedAt])).id;
    for (const r of results) {
      const marks = r.items.map((it) => ({ position: it.position, questionVersionId: it.v.id, maxMarks: it.v.marks, awarded: it.marks, status: it.status }));
      await q(`INSERT INTO grade_revisions (publication_id, attempt_id, revision_number, total_score, max_score, percentage, letter_grade, question_marks, counted_focus_losses, created_at) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9)`,
        [pub, r.attempt, r.total, r.max, r.pct, letterFor(r.pct), JSON.stringify(marks), r.counted, publishedAt]);
      const body = SMS[r.s.lang](course.code);
      await q(`INSERT INTO sms_outbox (recipient_id, phone, language, template_key, params, body, sender_id, segments, status, related_type, related_id, created_at, sent_at, delivered_at)
               VALUES ($1, $2, $3, 'RESULTS_PUBLISHED', $4, $5, 'ONLINE-EXAM-SYSTEM', 1, 'DELIVERED', 'exam', $6, $7, $7, $7)`,
        [r.s.id, r.s.phone, r.s.lang, JSON.stringify({ course: course.code }), body, exam, publishedAt]);
      await q(`INSERT INTO notifications (user_id, template_key, params, created_at) VALUES ($1, 'RESULTS_PUBLISHED', $2, $3)`, [r.s.id, JSON.stringify({ course: course.code, exam: EXAM_TITLE }), publishedAt]);
    }
    await audit(lecturer, "RESULTS_PUBLISHED", "exam", exam, { publication: 1, attempts: results.length }, publishedAt);
    await q("COMMIT");

    const lines = ["", `## Added by db:seed:demo:analytics (${new Date().toISOString()})`, "", "| Role | Name | Login | Password |", "|---|---|---|---|",
      ...accounts.map((a) => `| STUDENT | ${a.name} | ${a.number} | \`${a.password}\` |`), ""];
    fs.appendFileSync(ACCOUNTS_FILE, lines.join("\n"), { mode: 0o600 });
    const counts = [...usage.values()];
    console.log(`Added ${accounts.length} students, 15 questions and "${EXAM_TITLE}" with ${results.length} graded, published attempts.`);
    console.log(`Every question in the exam was answered by ${Math.min(...counts)} to ${Math.max(...counts)} students. Passwords appended to ${ACCOUNTS_FILE}.`);
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
