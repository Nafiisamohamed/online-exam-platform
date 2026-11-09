-- Phase 3: exam types, question review, question selection, rooms.
--   exams.exam_type          QUIZ, MIDTERM or FINAL. The nine existing exams get the approved
--                            mapping (by title and course); the migration stops if that mapping
--                            does not match exactly nine exams. On an empty database (a new
--                            installation or the test database) there is nothing to map.
--   exams.reviewed_only      exams published from now on draw only reviewed questions; existing
--                            exams keep false, so their question pools do not change.
--   questions.reviewed_*     a question is "reviewed" when its reviewed version is its current
--                            version; editing it (a new version) makes it a draft again.
--   exam_excluded_questions  questions the lecturer unticked for one exam (draft exams only).
--   rooms.capacity/is_active capacity may be unknown (empty); inactive rooms cannot be chosen.
-- Nothing is deleted. Everything runs in ONE transaction: if any step fails, nothing changes.
BEGIN;

-- 1. Exam types.
CREATE TYPE "ExamType" AS ENUM ('QUIZ', 'MIDTERM', 'FINAL');
ALTER TABLE "exams"
  ADD COLUMN "exam_type" "ExamType",
  ADD COLUMN "reviewed_only" BOOLEAN NOT NULL DEFAULT false;

CREATE TEMP TABLE "exam_type_mapping" ("course_code" TEXT, "title" TEXT, "exam_type" "ExamType") ON COMMIT DROP;
INSERT INTO "exam_type_mapping" VALUES
  ('CS201', 'CS201 Final Examination', 'FINAL'),
  ('CS201', 'CS201 Midterm Examination', 'MIDTERM'),
  ('BA110', 'BA110 Midterm Examination (draft)', 'MIDTERM'),
  ('CS105', 'CS105 Quiz 1', 'QUIZ'),
  ('CS201', 'quiz 1', 'QUIZ'),
  ('CS201', 'quiz 3', 'QUIZ'),
  ('CS105', 'quiz 2', 'QUIZ'),
  ('BA110', 'quiz 1', 'QUIZ'),
  ('CS105', 'CS105 Practice Test 1', 'QUIZ');

UPDATE "exams" e SET "exam_type" = m."exam_type"
  FROM "exam_type_mapping" m JOIN "courses" c ON c."code" = m."course_code"
 WHERE e."course_id" = c."id" AND e."title" = m."title";

DO $$
DECLARE total INTEGER; mapped INTEGER;
BEGIN
  SELECT count(*), count("exam_type") INTO total, mapped FROM "exams";
  IF total > 0 AND (total <> 9 OR mapped <> 9) THEN
    RAISE EXCEPTION 'exam type mapping stopped: % exam(s) found, % matched the approved mapping of 9', total, mapped;
  END IF;
END $$;
ALTER TABLE "exams" ALTER COLUMN "exam_type" SET NOT NULL;

-- 2. Question review.
ALTER TABLE "questions"
  ADD COLUMN "reviewed_version_id" UUID,
  ADD COLUMN "reviewed_by" UUID,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "questions_reviewed_version_id_fkey" FOREIGN KEY ("reviewed_version_id") REFERENCES "question_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "questions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "questions_review_complete_chk" CHECK (
    ("reviewed_version_id" IS NULL) = ("reviewed_by" IS NULL) AND ("reviewed_by" IS NULL) = ("reviewed_at" IS NULL));

-- 3. Questions unticked by the lecturer for one exam.
CREATE TABLE "exam_excluded_questions" (
  "exam_id"     UUID NOT NULL,
  "question_id" UUID NOT NULL,
  CONSTRAINT "exam_excluded_questions_pkey" PRIMARY KEY ("exam_id", "question_id"),
  CONSTRAINT "exam_excluded_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "exam_excluded_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 4. Rooms: capacity (may be unknown) and active flag. The 2 existing rooms: capacity unknown, active.
ALTER TABLE "rooms"
  ADD COLUMN "capacity" INTEGER,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD CONSTRAINT "rooms_capacity_chk" CHECK ("capacity" IS NULL OR "capacity" > 0);

-- 5. Same access rules as every other table. exam_app may also DELETE unticked questions
--    (the lecturer can tick a question again while the exam is a draft).
GRANT SELECT, INSERT, UPDATE, DELETE ON "exam_excluded_questions" TO exam_app;
ALTER TABLE "exam_excluded_questions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_excluded_questions_exam_app_access" ON "exam_excluded_questions" AS PERMISSIVE FOR ALL TO exam_app USING (true) WITH CHECK (true);

COMMIT;
