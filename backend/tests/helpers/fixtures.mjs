/**
 * Fixture builders: insert the minimum rows a test needs and return their ids.
 * Every builder takes a db object ({ q, one }) and generates unique codes, so
 * builders can be called many times in one run.
 */
import { randomUUID } from "node:crypto";

export const uid = () => randomUUID().slice(0, 8);

/** Id of one of the four roles inserted by global-setup. */
export async function roleId(db, name) {
  return (await db.one(`SELECT id FROM roles WHERE name = $1`, [name])).id;
}

const PREFIX = { STUDENT: "S", LECTURER: "T", ADMIN: "R", INVIGILATOR: "I" };
let numberSeq = 0;
/** A unique username in the real format (year 2099, so it never meets a generated number). */
export const testUsername = (role) => `${PREFIX[role]}-2099-${Date.now()}${String(numberSeq++).padStart(3, "0")}`;

/** Creates a user with a username; a student's student number is the username, staff get an email. */
export async function createUser(db, role = "STUDENT") {
  const isStudent = role === "STUDENT";
  const username = testUsername(role);
  return db.one(
    `INSERT INTO users (role_id, username, student_number, email, full_name, phone, password_hash, updated_at)
     VALUES ($1, $2, $3, $4, 'Test User', '+252615000000', 'not-a-real-hash', now())
     RETURNING id, preferred_language`,
    [await roleId(db, role), username, isStudent ? username : null, isStudent ? null : `${uid()}@uni.test`],
  );
}

/** Creates a faculty, a course taught by lecturerId, and one topic. */
export async function createCourse(db, lecturerId) {
  const faculty = await db.one(`INSERT INTO faculties (code, name, updated_at) VALUES ($1, 'Faculty', now()) RETURNING id`, [`F-${uid()}`]);
  const course = await db.one(
    `INSERT INTO courses (faculty_id, code, name, semester, lecturer_id, updated_at)
     VALUES ($1, $2, 'Course', '2026-F', $3, now()) RETURNING id`,
    [faculty.id, `C-${uid()}`, lecturerId],
  );
  const topic = await db.one(`INSERT INTO topics (course_id, name) VALUES ($1, 'Topic') RETURNING id`, [course.id]);
  return { facultyId: faculty.id, courseId: course.id, topicId: topic.id };
}

/**
 * Creates a question with version 1. MCQ versions get `optionCount` options,
 * the first one correct.
 * @returns {{ questionId, versionId, optionIds: string[] }}
 */
export async function createQuestion(db, { courseId, topicId, lecturerId, type = "MCQ", optionCount = 4, text } = {}) {
  const questionText = text ?? `Question ${uid()}?`;
  const question = await db.one(
    `INSERT INTO questions (course_id, created_by, normalized_text, updated_at) VALUES ($1, $2, $3, now()) RETURNING id`,
    [courseId, lecturerId, questionText.toLowerCase()],
  );
  const version = await db.one(
    `INSERT INTO question_versions (question_id, version_number, type, text, marks, difficulty, topic_id)
     VALUES ($1, 1, $2, $3, 2, 'EASY', $4) RETURNING id`,
    [question.id, type, questionText, topicId],
  );
  const optionIds = [];
  if (type === "MCQ") {
    for (let i = 1; i <= optionCount; i++) {
      const option = await db.one(
        `INSERT INTO question_options (question_version_id, text, is_correct, position) VALUES ($1, $2, $3, $4) RETURNING id`,
        [version.id, `Option ${i}`, i === 1, i],
      );
      optionIds.push(option.id);
    }
  }
  return { questionId: question.id, versionId: version.id, optionIds };
}

export async function createExam(db, { courseId, lecturerId, fee = 0 }) {
  return (await db.one(
    `INSERT INTO exams (course_id, created_by, title, instructions, fee_amount, fee_currency, updated_at)
     VALUES ($1, $2, 'Exam', 'Read carefully', $3, 'USD', now()) RETURNING id`,
    [courseId, lecturerId, fee],
  )).id;
}

export async function createRule(db, examId, { type = "MCQ", difficulty = "EASY", marks = 2, count = 1, position = 1 } = {}) {
  return (await db.one(
    `INSERT INTO exam_rules (exam_id, question_type, difficulty, marks_per_question, question_count, position)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [examId, type, difficulty, marks, count, position],
  )).id;
}

/** Creates a schedule. Defaults: APPROVED, window from 2 hours ago to 2 hours ahead, 60 minutes. */
export async function createSchedule(db, examId, lecturerId, { approved = true, start = "-2 hours", end = "2 hours", duration = 60 } = {}) {
  return (await db.one(
    `INSERT INTO exam_schedules (exam_id, requested_by, decided_by, status, window_start, window_end, duration_minutes, decided_at, updated_at)
     VALUES ($1, $2, $3, $4, now() + $5::interval, now() + $6::interval, $7, $8, now()) RETURNING id`,
    [examId, lecturerId, approved ? lecturerId : null, approved ? "APPROVED" : "REQUESTED", start, end, duration, approved ? new Date() : null],
  )).id;
}

/** Creates an IN_PROGRESS attempt. `deadline` is relative to now (e.g. "30 minutes", "-1 minute"). */
export async function createAttempt(db, { examId, scheduleId, studentId, started = "-90 minutes", deadline = "30 minutes" }) {
  return (await db.one(
    `INSERT INTO exam_attempts (exam_id, schedule_id, student_id, started_at, base_deadline, deadline)
     VALUES ($1, $2, $3, now() + $4::interval, now() + $5::interval, now() + $5::interval) RETURNING id`,
    [examId, scheduleId, studentId, started, deadline],
  )).id;
}

/** Draws a question version into an attempt (this locks the version). */
export async function addAttemptQuestion(db, { attemptId, versionId, ruleId, position = 1, optionOrder = [] }) {
  return (await db.one(
    `INSERT INTO attempt_questions (attempt_id, question_version_id, exam_rule_id, position, option_order, marks)
     VALUES ($1, $2, $3, $4, $5, 2) RETURNING id`,
    [attemptId, versionId, ruleId, position, optionOrder],
  )).id;
}

/**
 * Builds a full exam setup: lecturer, student, course, one MCQ question,
 * exam, rule and approved schedule.
 */
export async function createExamWorld(db, { fee = 0 } = {}) {
  const lecturer = await createUser(db, "LECTURER");
  const student = await createUser(db, "STUDENT");
  const course = await createCourse(db, lecturer.id);
  const question = await createQuestion(db, { ...course, lecturerId: lecturer.id });
  const examId = await createExam(db, { courseId: course.courseId, lecturerId: lecturer.id, fee });
  const ruleId = await createRule(db, examId);
  const scheduleId = await createSchedule(db, examId, lecturer.id);
  return { lecturerId: lecturer.id, studentId: student.id, ...course, ...question, examId, ruleId, scheduleId };
}
