/**
 * Exam deadlines (completion condition 2, 4.7, 4.9): answers are only accepted
 * before the effective server deadline and before submission; extensions are
 * capped at 15 minutes in total and need a reason (15 tests).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useRollbackDb } from "../helpers/db.mjs";
import { addAttemptQuestion, createAttempt, createExamWorld, createUser } from "../helpers/fixtures.mjs";

describe("exam deadlines", () => {
  const db = useRollbackDb();
  let w;

  beforeAll(async () => {
    w = await createExamWorld(db);
  });

  /** A fresh attempt with one question. `deadline` is relative to now. */
  async function attemptWithQuestion(deadline) {
    const student = await createUser(db, "STUDENT");
    const attemptId = await createAttempt(db, { examId: w.examId, scheduleId: w.scheduleId, studentId: student.id, deadline });
    const aq = await addAttemptQuestion(db, { attemptId, versionId: w.versionId, ruleId: w.ruleId, optionOrder: w.optionIds });
    return { attemptId, aq };
  }

  const saveOption = ({ attemptId, aq }, optionId) =>
    db.q(
      `INSERT INTO answers (attempt_id, attempt_question_id, question_version_id, selected_option_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (attempt_question_id) DO UPDATE SET selected_option_id = EXCLUDED.selected_option_id`,
      [attemptId, aq, w.versionId, optionId],
    );
  const submit = (attemptId) => db.q(`UPDATE exam_attempts SET status = 'SUBMITTED', submission_type = 'MANUAL', submitted_at = now() WHERE id = $1`, [attemptId]);
  const extend = (attemptId, total) => db.q(`UPDATE exam_attempts SET total_extension_minutes = $2::int, deadline = base_deadline + $2::int * interval '1 minute' WHERE id = $1`, [attemptId, total]);

  describe("saving answers", () => {
    it("accepts an answer before the deadline", async () => {
      await saveOption(await attemptWithQuestion("30 minutes"), w.optionIds[2]);
    });

    it("lets the student change an answer before the deadline", async () => {
      const a = await attemptWithQuestion("30 minutes");
      await saveOption(a, w.optionIds[2]);
      await saveOption(a, w.optionIds[0]);
      expect((await db.one(`SELECT selected_option_id FROM answers WHERE attempt_question_id = $1`, [a.aq])).selected_option_id).toBe(w.optionIds[0]);
    });

    it("rejects an answer after the deadline", async () => {
      const a = await attemptWithQuestion("-1 minute");
      await expectDbError(db, () => saveOption(a, w.optionIds[0]), "ATTEMPT_DEADLINE_PASSED");
    });

    it("allows the empty row recorded for an unanswered question after the deadline", async () => {
      const { attemptId, aq } = await attemptWithQuestion("-1 minute");
      await db.q(`INSERT INTO answers (attempt_id, attempt_question_id, question_version_id, grading_status) VALUES ($1, $2, $3, 'NOT_ANSWERED')`, [attemptId, aq, w.versionId]);
    });

    it("rejects changing an answer after submission", async () => {
      const a = await attemptWithQuestion("30 minutes");
      await saveOption(a, w.optionIds[0]);
      await submit(a.attemptId);
      await expectDbError(db, () => saveOption(a, w.optionIds[1]), "ATTEMPT_ALREADY_SUBMITTED");
    });

    it("still allows grading updates after submission", async () => {
      const a = await attemptWithQuestion("30 minutes");
      await saveOption(a, w.optionIds[0]);
      await submit(a.attemptId);
      await db.q(`UPDATE answers SET grading_status = 'AUTO_CORRECT', marks_awarded = 2 WHERE attempt_question_id = $1`, [a.aq]);
    });
  });

  describe("time extensions (4.9, D4)", () => {
    it("allows extensions up to 15 minutes in total", async () => {
      const { attemptId } = await attemptWithQuestion("30 minutes");
      await extend(attemptId, 15);
    });

    it("rejects more than 15 minutes in total", async () => {
      const { attemptId } = await attemptWithQuestion("30 minutes");
      await expectDbError(db, () => extend(attemptId, 16), "exam_attempts_extension_total_chk");
    });

    it("rejects a deadline that does not equal base deadline plus extensions", async () => {
      const { attemptId } = await attemptWithQuestion("30 minutes");
      await expectDbError(db, () => db.q(`UPDATE exam_attempts SET deadline = deadline + interval '5 minutes' WHERE id = $1`, [attemptId]), "exam_attempts_deadline_chk");
    });

    it("rejects a single extension of 20 minutes", async () => {
      const { attemptId } = await attemptWithQuestion("30 minutes");
      await expectDbError(db, () => db.q(`INSERT INTO time_extensions (attempt_id, granted_by, minutes, reason) VALUES ($1, $2, 20, 'power cut')`, [attemptId, w.lecturerId]), "time_extensions_minutes_chk");
    });

    it("rejects an extension without a reason", async () => {
      const { attemptId } = await attemptWithQuestion("30 minutes");
      await expectDbError(db, () => db.q(`INSERT INTO time_extensions (attempt_id, granted_by, minutes, reason) VALUES ($1, $2, 5, '  ')`, [attemptId, w.lecturerId]), "time_extensions_reason_chk");
    });

    it("rejects SUBMITTED without a submission time", async () => {
      const { attemptId } = await attemptWithQuestion("30 minutes");
      await expectDbError(db, () => db.q(`UPDATE exam_attempts SET status = 'SUBMITTED' WHERE id = $1`, [attemptId]), "exam_attempts_submitted_chk");
    });
  });

  describe("effective deadline (base deadline plus extensions)", () => {
    it("rejects an answer after the base deadline when there is no extension", async () => {
      const a = await attemptWithQuestion("-2 minutes");
      await expectDbError(db, () => saveOption(a, w.optionIds[0]), "ATTEMPT_DEADLINE_PASSED");
    });

    it("accepts the same answer after a 10-minute extension", async () => {
      const a = await attemptWithQuestion("-2 minutes");
      await extend(a.attemptId, 10);
      await saveOption(a, w.optionIds[0]);
    });

    it("rejects an answer after submission even before the deadline", async () => {
      const a = await attemptWithQuestion("-2 minutes");
      await extend(a.attemptId, 10);
      await submit(a.attemptId);
      await expectDbError(db, () => saveOption(a, w.optionIds[0]), "ATTEMPT_ALREADY_SUBMITTED");
    });
  });
});
