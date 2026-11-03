/**
 * Database constraints: keys, CHECK constraints and partial unique indexes
 * that protect data integrity (30 tests).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useRollbackDb } from "../helpers/db.mjs";
import {
  addAttemptQuestion, createAttempt, createExam, createExamWorld, createQuestion, createRule,
  createSchedule, createUser, uid,
} from "../helpers/fixtures.mjs";

describe("database constraints", () => {
  const db = useRollbackDb();
  let w; // exam world
  let attemptId, attemptQuestionId, otherAttemptQuestionId, otherOptionId;

  beforeAll(async () => {
    w = await createExamWorld(db);
    attemptId = await createAttempt(db, { examId: w.examId, scheduleId: w.scheduleId, studentId: w.studentId });
    attemptQuestionId = await addAttemptQuestion(db, { attemptId, versionId: w.versionId, ruleId: w.ruleId, optionOrder: w.optionIds });

    const otherStudent = await createUser(db, "STUDENT");
    const otherAttempt = await createAttempt(db, { examId: w.examId, scheduleId: w.scheduleId, studentId: otherStudent.id });
    otherAttemptQuestionId = await addAttemptQuestion(db, { attemptId: otherAttempt, versionId: w.versionId, ruleId: w.ruleId, optionOrder: w.optionIds });

    const other = await createQuestion(db, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId });
    otherOptionId = other.optionIds[0];
  });

  const insertAnswer = (attempt, aq, optionId, text = null) =>
    db.q(
      `INSERT INTO answers (attempt_id, attempt_question_id, question_version_id, selected_option_id, text_answer) VALUES ($1, $2, $3, $4, $5)`,
      [attempt, aq, w.versionId, optionId, text],
    );

  describe("answers belong to the student's own attempt (P8)", () => {
    it("rejects a chosen option that belongs to another question", async () => {
      await expectDbError(db, () => insertAnswer(attemptId, attemptQuestionId, otherOptionId), "answers_question_version_id_selected_option_id_fkey");
    });

    it("rejects an answer pointing at another attempt's question", async () => {
      await expectDbError(db, () => insertAnswer(attemptId, otherAttemptQuestionId, null, "x"), "answers_attempt_id_attempt_question_id_question_version_id_fkey");
    });

    it("rejects an answer with both a chosen option and text", async () => {
      await expectDbError(db, () => insertAnswer(attemptId, attemptQuestionId, w.optionIds[0], "x"), "answers_single_response_chk");
    });
  });

  describe("attempts", () => {
    it("rejects a second attempt by the same student for the same exam", async () => {
      await expectDbError(db, () => createAttempt(db, { examId: w.examId, scheduleId: w.scheduleId, studentId: w.studentId }), "exam_attempts_exam_id_student_id_key");
    });

    it("rejects an attempt that uses another exam's schedule", async () => {
      const otherExam = await createExam(db, { courseId: w.courseId, lecturerId: w.lecturerId });
      await expectDbError(db, () => createAttempt(db, { examId: otherExam, scheduleId: w.scheduleId, studentId: w.studentId }), "exam_attempts_exam_id_schedule_id_fkey");
    });
  });

  describe("focus events (4.8)", () => {
    const insertFocus = (ms, counted) =>
      db.q(
        `INSERT INTO focus_events (attempt_id, client_event_id, lost_at, returned_at, duration_ms, is_counted)
         VALUES ($1, gen_random_uuid(), now(), now() + $2 * interval '1 millisecond', $2, $3)`,
        [attemptId, ms, counted],
      );

    it("counts a 1.5-second focus loss", async () => {
      await insertFocus(1500, true);
    });

    it("rejects a 0.5-second focus loss marked as counted", async () => {
      await expectDbError(db, () => insertFocus(500, true), "focus_events_counted_chk");
    });

    it("stores a 0.5-second focus loss without counting it", async () => {
      await insertFocus(500, false);
    });

    it("rejects the same client event id twice (retries are not stored twice)", async () => {
      const sql = `INSERT INTO focus_events (attempt_id, client_event_id, lost_at) VALUES ($1, '11111111-1111-1111-1111-111111111111', now())`;
      await db.q(sql, [attemptId]);
      await expectDbError(db, () => db.q(sql, [attemptId]), "focus_events_attempt_id_client_event_id_key");
    });
  });

  describe("question bank, exams and schedules", () => {
    it("rejects duplicate question text among active questions of a course (D19)", async () => {
      await createQuestion(db, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId, text: "What is SQL?" });
      await expectDbError(db, () => createQuestion(db, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId, text: "What is SQL?" }), "questions_active_text_key");
    });

    it("allows the same text again once the original question is archived", async () => {
      const first = await createQuestion(db, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId, text: "What is a key?" });
      await db.q(`UPDATE questions SET is_archived = true WHERE id = $1`, [first.questionId]);
      await createQuestion(db, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId, text: "What is a key?" });
    });

    it("rejects a second correct option on one question version", async () => {
      const q = await createQuestion(db, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId, optionCount: 1 });
      await expectDbError(db, () => db.q(`INSERT INTO question_options (question_version_id, text, is_correct, position) VALUES ($1, 'y', true, 2)`, [q.versionId]), "question_options_one_correct_key");
    });

    it("rejects two rules with the same type, difficulty and marks in one exam (P2)", async () => {
      await expectDbError(db, () => createRule(db, w.examId, { count: 3, position: 2 }), "exam_rules_exam_id_question_type_difficulty_marks_per_quest_key");
    });

    it("rejects a rule with zero questions", async () => {
      await expectDbError(db, () => createRule(db, w.examId, { type: "ESSAY", difficulty: "HARD", marks: 10, count: 0, position: 2 }), "exam_rules_count_chk");
    });

    it("rejects a currency that is not 3 uppercase letters (P9)", async () => {
      await expectDbError(db, () => db.q(`UPDATE exams SET fee_currency = 'usd' WHERE id = $1`, [w.examId]), "exams_fee_currency_chk");
    });

    it("rejects a duration longer than the exam window", async () => {
      const exam = await createExam(db, { courseId: w.courseId, lecturerId: w.lecturerId });
      await expectDbError(db, () => createSchedule(db, exam, w.lecturerId, { approved: false, start: "0 minutes", end: "2 hours", duration: 200 }), "exam_schedules_duration_chk");
    });

    it("rejects a second approved schedule for one exam", async () => {
      await expectDbError(db, () => createSchedule(db, w.examId, w.lecturerId), "exam_schedules_one_approved_key");
    });

    it("rejects a schedule rejection without a reason", async () => {
      const exam = await createExam(db, { courseId: w.courseId, lecturerId: w.lecturerId });
      const schedule = await createSchedule(db, exam, w.lecturerId, { approved: false });
      await expectDbError(db, () => db.q(`UPDATE exam_schedules SET status = 'REJECTED', decided_by = $2, decided_at = now() WHERE id = $1`, [schedule, w.lecturerId]), "exam_schedules_rejection_chk");
    });

    it("rejects an invalid room network range", async () => {
      await expectDbError(db, () => db.q(`INSERT INTO rooms (name, building, network_ranges) VALUES ($1, 'A', ARRAY['not-an-ip'])`, [`Lab ${uid()}`]), "22P02");
    });

    it("accepts valid room network ranges", async () => {
      await db.q(`INSERT INTO rooms (name, building, network_ranges) VALUES ($1, 'A', ARRAY['10.10.4.0/24', '127.0.0.1/32'])`, [`Lab ${uid()}`]);
    });

    it("rejects a dropped enrolment without a drop date", async () => {
      await expectDbError(db, () => db.q(`INSERT INTO enrolments (student_id, course_id, status) VALUES ($1, $2, 'DROPPED')`, [w.studentId, w.courseId]), "enrolments_dropped_at_chk");
    });
  });

  describe("append-only history (P1, 6.2)", () => {
    let publicationId, revisionId;
    beforeAll(async () => {
      publicationId = (await db.one(`INSERT INTO result_publications (exam_id, publication_number, published_by) VALUES ($1, 1, $2) RETURNING id`, [w.examId, w.lecturerId])).id;
      revisionId = (await db.one(
        `INSERT INTO grade_revisions (publication_id, attempt_id, revision_number, total_score, max_score, percentage, letter_grade, question_marks, counted_focus_losses)
         VALUES ($1, $2, 1, 2, 2, 100, 'A', '{}', 1) RETURNING id`,
        [publicationId, attemptId],
      )).id;
      await db.q(`INSERT INTO audit_logs (actor_id, action_code, entity_type) VALUES ($1, 'TEST', 'exam')`, [w.lecturerId]);
    });

    it("rejects updating a grade revision", async () => {
      await expectDbError(db, () => db.q(`UPDATE grade_revisions SET total_score = 0 WHERE id = $1`, [revisionId]), "APPEND_ONLY_TABLE");
    });

    it("rejects deleting a grade revision", async () => {
      await expectDbError(db, () => db.q(`DELETE FROM grade_revisions WHERE id = $1`, [revisionId]), "APPEND_ONLY_TABLE");
    });

    it("rejects updating a result publication", async () => {
      await expectDbError(db, () => db.q(`UPDATE result_publications SET reason = 'x' WHERE id = $1`, [publicationId]), "APPEND_ONLY_TABLE");
    });

    it("rejects republishing without a reason", async () => {
      await expectDbError(db, () => db.q(`INSERT INTO result_publications (exam_id, publication_number, published_by) VALUES ($1, 2, $2)`, [w.examId, w.lecturerId]), "result_publications_reason_chk");
    });

    it("rejects deleting audit log entries", async () => {
      await expectDbError(db, () => db.q(`DELETE FROM audit_logs`), "APPEND_ONLY_TABLE");
    });
  });

  describe("SMS outbox (simulated)", () => {
    const insertSms = (body, params) =>
      db.one(
        `INSERT INTO sms_outbox (recipient_id, phone, language, template_key, params, body, sender_id)
         VALUES ($1, '+252615000000', 'so', 'ACCOUNT_CREATED', $2, $3, 'JAAMACADDA-DEMO') RETURNING status`,
        [w.studentId, params, body],
      );

    it("stores a [DEMO] message as QUEUED", async () => {
      const row = await insertSms("[DEMO] Akoonkaaga waa diyaar.", '{"studentNumber":"S1"}');
      expect(row.status).toBe("QUEUED");
    });

    it("rejects a message without the [DEMO] prefix", async () => {
      await expectDbError(db, () => insertSms("Akoonkaaga waa diyaar.", "{}"), "sms_outbox_demo_body_chk");
    });

    it("rejects a password inside the message parameters", async () => {
      await expectDbError(db, () => insertSms("[DEMO] x", '{"tempPassword":"abc123"}'), "sms_outbox_no_secrets_chk");
    });

    it("rejects DELIVERED without sent and delivered times", async () => {
      await insertSms("[DEMO] x", "{}");
      await expectDbError(db, () => db.q(`UPDATE sms_outbox SET status = 'DELIVERED'`), "sms_outbox_status_chk");
    });
  });
});
