/**
 * Question locking (P4, 4.2): a question version used by an exam attempt can
 * never change, so past results keep the exact question the student saw (11 tests).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, expectDbError, useRollbackDb, wrap } from "../helpers/db.mjs";
import { addAttemptQuestion, createAttempt, createExamWorld, createQuestion, createUser } from "../helpers/fixtures.mjs";

describe("question locking", () => {
  describe("a version drawn into an attempt", () => {
    const db = useRollbackDb();
    let w, unlocked;

    beforeAll(async () => {
      w = await createExamWorld(db);
      const attemptId = await createAttempt(db, { examId: w.examId, scheduleId: w.scheduleId, studentId: w.studentId });
      await addAttemptQuestion(db, { attemptId, versionId: w.versionId, ruleId: w.ruleId, optionOrder: w.optionIds });
      unlocked = await createQuestion(db, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId });
    });

    it("is locked automatically", async () => {
      const row = await db.one(`SELECT is_locked, locked_at FROM question_versions WHERE id = $1`, [w.versionId]);
      expect(row.is_locked).toBe(true);
      expect(row.locked_at).not.toBeNull();
    });

    it("cannot be updated", async () => {
      await expectDbError(db, () => db.q(`UPDATE question_versions SET text = 'changed' WHERE id = $1`, [w.versionId]), "QUESTION_VERSION_LOCKED");
    });

    it("cannot be deleted", async () => {
      await expectDbError(db, () => db.q(`DELETE FROM question_versions WHERE id = $1`, [w.versionId]), "QUESTION_VERSION_LOCKED");
    });

    it("cannot have its options changed", async () => {
      await expectDbError(db, () => db.q(`UPDATE question_options SET text = 'x' WHERE id = $1`, [w.optionIds[1]]), "QUESTION_VERSION_LOCKED");
    });

    it("cannot get new options", async () => {
      await expectDbError(db, () => db.q(`INSERT INTO question_options (question_version_id, text, position) VALUES ($1, 'new', 5)`, [w.versionId]), "QUESTION_VERSION_LOCKED");
    });

    it("cannot get new accepted answers", async () => {
      await expectDbError(db, () => db.q(`INSERT INTO accepted_answers (question_version_id, answer_text, normalized_text) VALUES ($1, 'a', 'a')`, [w.versionId]), "QUESTION_VERSION_LOCKED");
    });

    it("leaves versions not used by any attempt editable", async () => {
      await db.q(`UPDATE question_versions SET text = 'Edited text' WHERE id = $1`, [unlocked.versionId]);
    });
  });

  // These tests need two real connections, so their rows are committed.
  // The next run rebuilds the test database, which removes them. They are
  // skipped in verification mode (npm run verify:db), which must not commit.
  describe.skipIf(process.env.TEST_VERIFY_MODE)("locking within the question-selection transaction", () => {
    let a, b, w;
    beforeAll(async () => {
      a = wrap(await connect());
      b = wrap(await connect());
      w = await createExamWorld(a);
    });
    afterAll(async () => {
      await a?.client.end();
      await b?.client.end();
    });

    const startAttempt = async (versionId) => {
      const student = await createUser(a, "STUDENT");
      return createAttempt(a, { examId: w.examId, scheduleId: w.scheduleId, studentId: student.id });
    };

    it("locks the version inside the selection transaction, before commit", async () => {
      const q = await createQuestion(a, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId });
      const attemptId = await startAttempt();
      await a.q("BEGIN");
      try {
        await addAttemptQuestion(a, { attemptId, versionId: q.versionId, ruleId: w.ruleId });
        expect((await a.one(`SELECT is_locked FROM question_versions WHERE id = $1`, [q.versionId])).is_locked).toBe(true);
      } finally {
        await a.q("ROLLBACK");
      }
    });

    it("keeps the lock invisible to other connections until commit", async () => {
      const q = await createQuestion(a, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId });
      const attemptId = await startAttempt();
      await a.q("BEGIN");
      try {
        await addAttemptQuestion(a, { attemptId, versionId: q.versionId, ruleId: w.ruleId });
        expect((await b.one(`SELECT is_locked FROM question_versions WHERE id = $1`, [q.versionId])).is_locked).toBe(false);
      } finally {
        await a.q("ROLLBACK");
      }
    });

    it("leaves the version unlocked when the selection is rolled back", async () => {
      const q = await createQuestion(a, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId });
      const attemptId = await startAttempt();
      await a.q("BEGIN");
      await addAttemptQuestion(a, { attemptId, versionId: q.versionId, ruleId: w.ruleId });
      await a.q("ROLLBACK");
      expect((await b.one(`SELECT is_locked FROM question_versions WHERE id = $1`, [q.versionId])).is_locked).toBe(false);
    });

    it("makes a lecturer edit that races with question selection wait, then fail", async () => {
      const q = await createQuestion(a, { courseId: w.courseId, topicId: w.topicId, lecturerId: w.lecturerId });
      const attemptId = await startAttempt();
      await a.q("BEGIN");
      await addAttemptQuestion(a, { attemptId, versionId: q.versionId, ruleId: w.ruleId });

      await b.q("BEGIN");
      const edit = b.q(`UPDATE question_versions SET text = 'edited' WHERE id = $1`, [q.versionId]).then(() => "allowed", (e) => e.message);
      await new Promise((resolve) => setTimeout(resolve, 300)); // the edit is now waiting on the row lock
      await a.q("COMMIT");
      const outcome = await edit;
      await b.q("ROLLBACK");

      expect(outcome).toBe("QUESTION_VERSION_LOCKED");
    });
  });
});
