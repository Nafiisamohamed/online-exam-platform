-- Policy: the third counted tab switch ends the attempt automatically.
-- A terminated attempt is closed like a submitted one (closing time in submitted_at,
-- the reason in submission_type = TERMINATED_TAB_LIMIT), keeps its saved answers,
-- and can no longer be changed: the answers trigger already accepts writes only
-- while the attempt is IN_PROGRESS. Existing rows are unchanged and stay valid.
ALTER TYPE "AttemptStatus" ADD VALUE IF NOT EXISTS 'TERMINATED';
ALTER TYPE "SubmissionType" ADD VALUE IF NOT EXISTS 'TERMINATED_TAB_LIMIT';

-- "Closed" (submitted or terminated) <=> closing time and closing type are set.
-- (Written without the new enum labels, which cannot be used in the transaction that adds them.)
ALTER TABLE "exam_attempts" DROP CONSTRAINT "exam_attempts_submitted_chk";
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_submitted_chk" CHECK (
  ("status" <> 'IN_PROGRESS') = ("submitted_at" IS NOT NULL) AND
  ("status" <> 'IN_PROGRESS') = ("submission_type" IS NOT NULL));
