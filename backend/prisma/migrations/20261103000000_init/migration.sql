-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'LECTURER', 'STUDENT', 'INVIGILATOR');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('so', 'en');

-- CreateEnum
CREATE TYPE "EnrolmentStatus" AS ENUM ('ACTIVE', 'DROPPED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('QUESTIONS', 'ENROLMENTS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ResultsStatus" AS ENUM ('UNPUBLISHED', 'PUBLISHED', 'REOPENED');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('MANUAL', 'AUTO_DEADLINE');

-- CreateEnum
CREATE TYPE "GradingStatus" AS ENUM ('AUTO_CORRECT', 'AUTO_INCORRECT', 'NEEDS_REVIEW', 'PENDING_ESSAY', 'AWAITING_SECOND_GRADE', 'DISCREPANCY', 'GRADED', 'NOT_ANSWERED');

-- CreateEnum
CREATE TYPE "GraderRole" AS ENUM ('FIRST', 'SECOND');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('EVC_PLUS', 'ZAAD', 'EDAHAB');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING_CONFIRMATION', 'PENDING_PIN', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" "RoleName" NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "student_number" TEXT,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "temp_password_expires_at" TIMESTAMPTZ(6),
    "preferred_language" "Language" NOT NULL DEFAULT 'so',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action_code" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "faculty_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "lecturer_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrolments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dropped_at" TIMESTAMPTZ(6),

    CONSTRAINT "enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "current_version_id" UUID,
    "normalized_text" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "text" TEXT NOT NULL,
    "image_path" TEXT,
    "marks" DECIMAL(6,2) NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "topic_id" UUID NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_version_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accepted_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_version_id" UUID NOT NULL,
    "answer_text" TEXT NOT NULL,
    "normalized_text" TEXT NOT NULL,

    CONSTRAINT "accepted_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_criteria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_version_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "max_marks" DECIMAL(6,2) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "rubric_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ImportType" NOT NULL,
    "course_id" UUID,
    "semester" TEXT,
    "uploaded_by" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "row_results" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT true,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT true,
    "allow_answer_review" BOOLEAN NOT NULL DEFAULT false,
    "fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fee_currency" CHAR(3) NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "results_status" "ResultsStatus" NOT NULL DEFAULT 'UNPUBLISHED',
    "second_grader_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "question_type" "QuestionType" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "marks_per_question" DECIMAL(6,2) NOT NULL,
    "question_count" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "exam_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_rule_topics" (
    "rule_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,

    CONSTRAINT "exam_rule_topics_pkey" PRIMARY KEY ("rule_id","topic_id")
);

-- CreateTable
CREATE TABLE "exam_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'REQUESTED',
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "window_end" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "rejection_reason" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "network_ranges" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_rooms" (
    "schedule_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,

    CONSTRAINT "schedule_rooms_pkey" PRIMARY KEY ("schedule_id","room_id")
);

-- CreateTable
CREATE TABLE "schedule_invigilators" (
    "schedule_id" UUID NOT NULL,
    "invigilator_id" UUID NOT NULL,

    CONSTRAINT "schedule_invigilators_pkey" PRIMARY KEY ("schedule_id","invigilator_id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "submission_type" "SubmissionType",
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "base_deadline" TIMESTAMPTZ(6) NOT NULL,
    "total_extension_minutes" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counted_focus_losses" INTEGER NOT NULL DEFAULT 0,
    "start_ip" TEXT,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "question_version_id" UUID NOT NULL,
    "exam_rule_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "option_order" UUID[],
    "marks" DECIMAL(6,2) NOT NULL,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attempt_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "attempt_question_id" UUID NOT NULL,
    "question_version_id" UUID NOT NULL,
    "selected_option_id" UUID,
    "text_answer" TEXT,
    "grading_status" "GradingStatus",
    "marks_awarded" DECIMAL(6,2),
    "graded_by" UUID,
    "graded_at" TIMESTAMPTZ(6),
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "client_event_id" UUID NOT NULL,
    "lost_at" TIMESTAMPTZ(6) NOT NULL,
    "returned_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "is_counted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "focus_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_extensions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "granted_by" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invigilator_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schedule_id" UUID NOT NULL,
    "student_id" UUID,
    "author_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invigilator_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_marks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "answer_id" UUID NOT NULL,
    "grader_id" UUID NOT NULL,
    "grader_role" "GraderRole" NOT NULL,
    "total_marks" DECIMAL(6,2) NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "essay_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_criterion_marks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "essay_mark_id" UUID NOT NULL,
    "rubric_criterion_id" UUID NOT NULL,
    "marks" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "essay_criterion_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_scale" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "letter" TEXT NOT NULL,
    "min_percentage" DECIMAL(5,2) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "grading_scale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "total_score" DECIMAL(8,2) NOT NULL,
    "max_score" DECIMAL(8,2) NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "letter_grade" TEXT NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "publication_number" INTEGER NOT NULL,
    "published_by" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "result_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publication_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "total_score" DECIMAL(8,2) NOT NULL,
    "max_score" DECIMAL(8,2) NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "letter_grade" TEXT NOT NULL,
    "question_marks" JSONB NOT NULL,
    "counted_focus_losses" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "phone" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "merchant_name" TEXT NOT NULL,
    "merchant_number" TEXT NOT NULL,
    "pin_attempts" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "idempotency_key" UUID NOT NULL,
    "mock_reference" TEXT,
    "receipt_number" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "is_simulated" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "template_key" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "body" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "related_type" TEXT,
    "related_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "is_simulated" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sms_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "template_key" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_student_number_key" ON "users"("student_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_code_key" ON "faculties"("code");

-- CreateIndex
CREATE INDEX "courses_faculty_id_idx" ON "courses"("faculty_id");

-- CreateIndex
CREATE INDEX "courses_lecturer_id_idx" ON "courses"("lecturer_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_semester_key" ON "courses"("code", "semester");

-- CreateIndex
CREATE INDEX "enrolments_course_id_status_idx" ON "enrolments"("course_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrolments_student_id_course_id_key" ON "enrolments"("student_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_course_id_name_key" ON "topics"("course_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "questions_current_version_id_key" ON "questions"("current_version_id");

-- CreateIndex
CREATE INDEX "questions_course_id_idx" ON "questions"("course_id");

-- CreateIndex
CREATE INDEX "question_versions_topic_id_idx" ON "question_versions"("topic_id");

-- CreateIndex
CREATE INDEX "question_versions_difficulty_type_marks_idx" ON "question_versions"("difficulty", "type", "marks");

-- CreateIndex
CREATE UNIQUE INDEX "question_versions_question_id_version_number_key" ON "question_versions"("question_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_question_version_id_position_key" ON "question_options"("question_version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_question_version_id_id_key" ON "question_options"("question_version_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "accepted_answers_question_version_id_normalized_text_key" ON "accepted_answers"("question_version_id", "normalized_text");

-- CreateIndex
CREATE UNIQUE INDEX "rubric_criteria_question_version_id_position_key" ON "rubric_criteria"("question_version_id", "position");

-- CreateIndex
CREATE INDEX "import_batches_uploaded_by_idx" ON "import_batches"("uploaded_by");

-- CreateIndex
CREATE INDEX "exams_course_id_idx" ON "exams"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_rules_exam_id_position_key" ON "exam_rules"("exam_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "exam_rules_exam_id_question_type_difficulty_marks_per_quest_key" ON "exam_rules"("exam_id", "question_type", "difficulty", "marks_per_question");

-- CreateIndex
CREATE INDEX "exam_schedules_status_window_start_window_end_idx" ON "exam_schedules"("status", "window_start", "window_end");

-- CreateIndex
CREATE UNIQUE INDEX "exam_schedules_exam_id_id_key" ON "exam_schedules"("exam_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_name_key" ON "rooms"("name");

-- CreateIndex
CREATE INDEX "schedule_invigilators_invigilator_id_idx" ON "schedule_invigilators"("invigilator_id");

-- CreateIndex
CREATE INDEX "exam_attempts_status_deadline_idx" ON "exam_attempts"("status", "deadline");

-- CreateIndex
CREATE INDEX "exam_attempts_schedule_id_idx" ON "exam_attempts"("schedule_id");

-- CreateIndex
CREATE INDEX "exam_attempts_student_id_idx" ON "exam_attempts"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_exam_id_student_id_key" ON "exam_attempts"("exam_id", "student_id");

-- CreateIndex
CREATE INDEX "attempt_questions_question_version_id_idx" ON "attempt_questions"("question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_questions_attempt_id_position_key" ON "attempt_questions"("attempt_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_questions_attempt_id_question_version_id_key" ON "attempt_questions"("attempt_id", "question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_questions_attempt_id_id_question_version_id_key" ON "attempt_questions"("attempt_id", "id", "question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "answers_attempt_question_id_key" ON "answers"("attempt_question_id");

-- CreateIndex
CREATE INDEX "answers_attempt_id_idx" ON "answers"("attempt_id");

-- CreateIndex
CREATE INDEX "answers_question_version_id_grading_status_idx" ON "answers"("question_version_id", "grading_status");

-- CreateIndex
CREATE UNIQUE INDEX "answers_attempt_id_attempt_question_id_question_version_id_key" ON "answers"("attempt_id", "attempt_question_id", "question_version_id");

-- CreateIndex
CREATE INDEX "focus_events_attempt_id_lost_at_idx" ON "focus_events"("attempt_id", "lost_at");

-- CreateIndex
CREATE UNIQUE INDEX "focus_events_attempt_id_client_event_id_key" ON "focus_events"("attempt_id", "client_event_id");

-- CreateIndex
CREATE INDEX "time_extensions_attempt_id_idx" ON "time_extensions"("attempt_id");

-- CreateIndex
CREATE INDEX "invigilator_notes_schedule_id_idx" ON "invigilator_notes"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "essay_marks_answer_id_grader_role_key" ON "essay_marks"("answer_id", "grader_role");

-- CreateIndex
CREATE UNIQUE INDEX "essay_marks_answer_id_grader_id_key" ON "essay_marks"("answer_id", "grader_id");

-- CreateIndex
CREATE UNIQUE INDEX "essay_criterion_marks_essay_mark_id_rubric_criterion_id_key" ON "essay_criterion_marks"("essay_mark_id", "rubric_criterion_id");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scale_letter_key" ON "grading_scale"("letter");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scale_min_percentage_key" ON "grading_scale"("min_percentage");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scale_sort_order_key" ON "grading_scale"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "grades_attempt_id_key" ON "grades"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_exam_id_publication_number_key" ON "result_publications"("exam_id", "publication_number");

-- CreateIndex
CREATE UNIQUE INDEX "grade_revisions_attempt_id_revision_number_key" ON "grade_revisions"("attempt_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "grade_revisions_publication_id_attempt_id_key" ON "grade_revisions"("publication_id", "attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_number_key" ON "payments"("receipt_number");

-- CreateIndex
CREATE INDEX "payments_student_id_exam_id_idx" ON "payments"("student_id", "exam_id");

-- CreateIndex
CREATE INDEX "payments_status_expires_at_idx" ON "payments"("status", "expires_at");

-- CreateIndex
CREATE INDEX "sms_outbox_recipient_id_idx" ON "sms_outbox"("recipient_id");

-- CreateIndex
CREATE INDEX "sms_outbox_status_created_at_idx" ON "sms_outbox"("status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accepted_answers" ADD CONSTRAINT "accepted_answers_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_second_grader_id_fkey" FOREIGN KEY ("second_grader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_rules" ADD CONSTRAINT "exam_rules_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_rule_topics" ADD CONSTRAINT "exam_rule_topics_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "exam_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_rule_topics" ADD CONSTRAINT "exam_rule_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rooms" ADD CONSTRAINT "schedule_rooms_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "exam_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rooms" ADD CONSTRAINT "schedule_rooms_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_invigilators" ADD CONSTRAINT "schedule_invigilators_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "exam_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_invigilators" ADD CONSTRAINT "schedule_invigilators_invigilator_id_fkey" FOREIGN KEY ("invigilator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_schedule_id_fkey" FOREIGN KEY ("exam_id", "schedule_id") REFERENCES "exam_schedules"("exam_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_exam_rule_id_fkey" FOREIGN KEY ("exam_rule_id") REFERENCES "exam_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_attempt_question_id_question_version_id_fkey" FOREIGN KEY ("attempt_id", "attempt_question_id", "question_version_id") REFERENCES "attempt_questions"("attempt_id", "id", "question_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_version_id_selected_option_id_fkey" FOREIGN KEY ("question_version_id", "selected_option_id") REFERENCES "question_options"("question_version_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_events" ADD CONSTRAINT "focus_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_extensions" ADD CONSTRAINT "time_extensions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_extensions" ADD CONSTRAINT "time_extensions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invigilator_notes" ADD CONSTRAINT "invigilator_notes_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "exam_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invigilator_notes" ADD CONSTRAINT "invigilator_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invigilator_notes" ADD CONSTRAINT "invigilator_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_marks" ADD CONSTRAINT "essay_marks_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "answers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_marks" ADD CONSTRAINT "essay_marks_grader_id_fkey" FOREIGN KEY ("grader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_criterion_marks" ADD CONSTRAINT "essay_criterion_marks_essay_mark_id_fkey" FOREIGN KEY ("essay_mark_id") REFERENCES "essay_marks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_criterion_marks" ADD CONSTRAINT "essay_criterion_marks_rubric_criterion_id_fkey" FOREIGN KEY ("rubric_criterion_id") REFERENCES "rubric_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_revisions" ADD CONSTRAINT "grade_revisions_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "result_publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_revisions" ADD CONSTRAINT "grade_revisions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_outbox" ADD CONSTRAINT "sms_outbox_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- RAW SQL SECTION
-- -----------------------------------------------------------------------------
-- Everything below cannot be expressed in schema.prisma, so it is written by
-- hand. Each object is listed and explained in docs/database.md.
--   R1  CHECK constraints
--   R2  Partial unique indexes
--   R3  Triggers
-- Trigger errors use SQLSTATE P0001 with a stable message code (e.g.
-- 'QUESTION_VERSION_LOCKED') that the backend maps to a translated message.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- R1. CHECK constraints
-- -----------------------------------------------------------------------------

-- A. Users
ALTER TABLE "users"
  ADD CONSTRAINT "users_login_identifier_chk" CHECK ("student_number" IS NOT NULL OR "email" IS NOT NULL),
  ADD CONSTRAINT "users_token_version_chk"    CHECK ("token_version" >= 0);

-- B. Enrolments: dropped_at is set exactly when the student is dropped.
ALTER TABLE "enrolments"
  ADD CONSTRAINT "enrolments_dropped_at_chk" CHECK (("status" = 'DROPPED') = ("dropped_at" IS NOT NULL));

-- C. Question bank
ALTER TABLE "question_versions"
  ADD CONSTRAINT "question_versions_version_number_chk" CHECK ("version_number" >= 1),
  ADD CONSTRAINT "question_versions_marks_chk"          CHECK ("marks" > 0),
  ADD CONSTRAINT "question_versions_text_chk"           CHECK (btrim("text") <> ''),
  ADD CONSTRAINT "question_versions_locked_at_chk"      CHECK ("is_locked" = ("locked_at" IS NOT NULL));

ALTER TABLE "question_options"
  ADD CONSTRAINT "question_options_position_chk" CHECK ("position" >= 1),
  ADD CONSTRAINT "question_options_text_chk"     CHECK (btrim("text") <> '');

ALTER TABLE "accepted_answers"
  ADD CONSTRAINT "accepted_answers_text_chk" CHECK (btrim("normalized_text") <> '');

ALTER TABLE "rubric_criteria"
  ADD CONSTRAINT "rubric_criteria_max_marks_chk" CHECK ("max_marks" > 0),
  ADD CONSTRAINT "rubric_criteria_position_chk"  CHECK ("position" >= 1);

ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_counts_chk" CHECK (
    "total_rows" >= 0 AND "valid_rows" >= 0 AND "invalid_rows" >= 0 AND "duplicate_rows" >= 0),
  ADD CONSTRAINT "import_batches_target_chk" CHECK (
    ("type" = 'QUESTIONS'  AND "course_id" IS NOT NULL) OR
    ("type" = 'ENROLMENTS' AND "semester"  IS NOT NULL));

-- D. Exams and scheduling (P9: currency is a 3-letter ISO code)
ALTER TABLE "exams"
  ADD CONSTRAINT "exams_title_chk"        CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "exams_fee_amount_chk"   CHECK ("fee_amount" >= 0),
  ADD CONSTRAINT "exams_fee_currency_chk" CHECK ("fee_currency" ~ '^[A-Z]{3}$');

ALTER TABLE "exam_rules"
  ADD CONSTRAINT "exam_rules_count_chk"    CHECK ("question_count" > 0),
  ADD CONSTRAINT "exam_rules_marks_chk"    CHECK ("marks_per_question" > 0),
  ADD CONSTRAINT "exam_rules_position_chk" CHECK ("position" >= 1);

ALTER TABLE "exam_schedules"
  ADD CONSTRAINT "exam_schedules_window_chk"   CHECK ("window_end" > "window_start"),
  ADD CONSTRAINT "exam_schedules_duration_chk" CHECK (
    "duration_minutes" > 0 AND
    "window_start" + "duration_minutes" * interval '1 minute' <= "window_end"),
  ADD CONSTRAINT "exam_schedules_rejection_chk" CHECK (
    "status" <> 'REJECTED' OR ("rejection_reason" IS NOT NULL AND btrim("rejection_reason") <> '')),
  ADD CONSTRAINT "exam_schedules_decision_chk" CHECK (
    "status" NOT IN ('APPROVED', 'REJECTED') OR ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL));

-- Rooms: the cast fails for anything that is not a valid CIDR range (e.g. '10.10.4.0/24').
ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_network_ranges_chk" CHECK (
    "network_ranges" IS NOT NULL AND ("network_ranges"::cidr[]) IS NOT NULL);

-- E. Attempts
--   P5: total extension 0-15 minutes.
--   Deadline is always base_deadline + total extension, so it cannot drift.
ALTER TABLE "exam_attempts"
  ADD CONSTRAINT "exam_attempts_extension_total_chk" CHECK ("total_extension_minutes" BETWEEN 0 AND 15),
  ADD CONSTRAINT "exam_attempts_deadline_chk" CHECK (
    "deadline" = "base_deadline" + "total_extension_minutes" * interval '1 minute'),
  ADD CONSTRAINT "exam_attempts_base_deadline_chk" CHECK ("base_deadline" > "started_at"),
  ADD CONSTRAINT "exam_attempts_submitted_chk" CHECK (
    ("status" = 'SUBMITTED') = ("submitted_at" IS NOT NULL) AND
    ("status" = 'SUBMITTED') = ("submission_type" IS NOT NULL)),
  ADD CONSTRAINT "exam_attempts_focus_losses_chk" CHECK ("counted_focus_losses" >= 0);

ALTER TABLE "attempt_questions"
  ADD CONSTRAINT "attempt_questions_option_order_chk" CHECK ("option_order" IS NOT NULL),
  ADD CONSTRAINT "attempt_questions_position_chk"     CHECK ("position" >= 1),
  ADD CONSTRAINT "attempt_questions_marks_chk"        CHECK ("marks" > 0);

ALTER TABLE "answers"
  ADD CONSTRAINT "answers_single_response_chk" CHECK (NOT ("selected_option_id" IS NOT NULL AND "text_answer" IS NOT NULL)),
  ADD CONSTRAINT "answers_marks_chk"           CHECK ("marks_awarded" IS NULL OR "marks_awarded" >= 0);

-- Focus events: losses shorter than 1 second are stored but never counted (4.8).
ALTER TABLE "focus_events"
  ADD CONSTRAINT "focus_events_order_chk"    CHECK ("returned_at" IS NULL OR "returned_at" >= "lost_at"),
  ADD CONSTRAINT "focus_events_duration_chk" CHECK (
    ("returned_at" IS NULL) = ("duration_ms" IS NULL) AND ("duration_ms" IS NULL OR "duration_ms" >= 0)),
  ADD CONSTRAINT "focus_events_counted_chk"  CHECK ("is_counted" = COALESCE("duration_ms" >= 1000, false));

ALTER TABLE "time_extensions"
  ADD CONSTRAINT "time_extensions_minutes_chk" CHECK ("minutes" BETWEEN 1 AND 15),
  ADD CONSTRAINT "time_extensions_reason_chk"  CHECK (btrim("reason") <> '');

ALTER TABLE "invigilator_notes"
  ADD CONSTRAINT "invigilator_notes_text_chk" CHECK (btrim("text") <> '');

-- F. Grading and results
ALTER TABLE "essay_marks"
  ADD CONSTRAINT "essay_marks_total_chk" CHECK ("total_marks" >= 0);

ALTER TABLE "essay_criterion_marks"
  ADD CONSTRAINT "essay_criterion_marks_marks_chk" CHECK ("marks" >= 0);

ALTER TABLE "grading_scale"
  ADD CONSTRAINT "grading_scale_letter_chk" CHECK (btrim("letter") <> ''),
  ADD CONSTRAINT "grading_scale_min_chk"    CHECK ("min_percentage" BETWEEN 0 AND 100);

ALTER TABLE "grades"
  ADD CONSTRAINT "grades_scores_chk" CHECK (
    "max_score" > 0 AND "total_score" BETWEEN 0 AND "max_score" AND "percentage" BETWEEN 0 AND 100);

ALTER TABLE "result_publications"
  ADD CONSTRAINT "result_publications_number_chk" CHECK ("publication_number" >= 1),
  ADD CONSTRAINT "result_publications_reason_chk" CHECK (
    "publication_number" = 1 OR ("reason" IS NOT NULL AND btrim("reason") <> ''));

ALTER TABLE "grade_revisions"
  ADD CONSTRAINT "grade_revisions_number_chk" CHECK ("revision_number" >= 1),
  ADD CONSTRAINT "grade_revisions_scores_chk" CHECK (
    "max_score" > 0 AND "total_score" BETWEEN 0 AND "max_score" AND "percentage" BETWEEN 0 AND 100),
  ADD CONSTRAINT "grade_revisions_focus_chk"  CHECK ("counted_focus_losses" >= 0);

-- G. Payments (SIMULATED ONLY)
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_simulated_chk"   CHECK ("is_simulated" = true),
  ADD CONSTRAINT "payments_amount_chk"      CHECK ("amount" > 0),
  ADD CONSTRAINT "payments_currency_chk"    CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "payments_pin_attempts_chk" CHECK ("pin_attempts" BETWEEN 0 AND 3),
  ADD CONSTRAINT "payments_receipt_chk" CHECK (
    ("status" = 'SUCCESS') = ("receipt_number" IS NOT NULL)),
  ADD CONSTRAINT "payments_receipt_format_chk" CHECK (
    "receipt_number" IS NULL OR "receipt_number" ~ (
      '^DEMO-' ||
      CASE "provider" WHEN 'EVC_PLUS' THEN 'EVC' WHEN 'ZAAD' THEN 'ZAAD' ELSE 'EDAHAB' END ||
      '-[0-9]{8}-[A-Z0-9]{6}$')),
  ADD CONSTRAINT "payments_failure_chk" CHECK ("status" <> 'FAILED' OR "failure_reason" IS NOT NULL),
  ADD CONSTRAINT "payments_confirmed_chk" CHECK (
    "status" NOT IN ('PENDING_PIN', 'SUCCESS', 'FAILED') OR "confirmed_at" IS NOT NULL),
  ADD CONSTRAINT "payments_completed_chk" CHECK (
    ("status" IN ('SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED')) = ("completed_at" IS NOT NULL));

-- SMS outbox (SIMULATED ONLY). Bodies start with [DEMO]; params may never carry secrets.
-- Note: LIKE treats '[' literally in PostgreSQL.
ALTER TABLE "sms_outbox"
  ADD CONSTRAINT "sms_outbox_simulated_chk" CHECK ("is_simulated" = true),
  ADD CONSTRAINT "sms_outbox_demo_body_chk" CHECK ("body" LIKE '[DEMO]%'),
  ADD CONSTRAINT "sms_outbox_segments_chk"  CHECK ("segments" >= 1),
  ADD CONSTRAINT "sms_outbox_no_secrets_chk" CHECK (
    NOT ("params" ?| ARRAY['password', 'tempPassword', 'temporaryPassword', 'pin', 'demoPin'])),
  ADD CONSTRAINT "sms_outbox_status_chk" CHECK (
    ("status" <> 'SENT'      OR "sent_at" IS NOT NULL) AND
    ("status" <> 'DELIVERED' OR ("sent_at" IS NOT NULL AND "delivered_at" IS NOT NULL)) AND
    ("status" <> 'FAILED'    OR "failure_reason" IS NOT NULL));

-- -----------------------------------------------------------------------------
-- R2. Partial unique indexes
-- -----------------------------------------------------------------------------

-- D19: no duplicate question text among active questions of one course.
CREATE UNIQUE INDEX "questions_active_text_key"
  ON "questions" ("course_id", "normalized_text") WHERE NOT "is_archived";

-- 4.2: at most one correct option per question version ("exactly one" is checked by the service).
CREATE UNIQUE INDEX "question_options_one_correct_key"
  ON "question_options" ("question_version_id") WHERE "is_correct";

-- 4.5: at most one approved schedule per exam.
CREATE UNIQUE INDEX "exam_schedules_one_approved_key"
  ON "exam_schedules" ("exam_id") WHERE "status" = 'APPROVED';

-- P7: one successful payment, and one open payment, per student per exam.
CREATE UNIQUE INDEX "payments_one_success_key"
  ON "payments" ("student_id", "exam_id") WHERE "status" = 'SUCCESS';
CREATE UNIQUE INDEX "payments_one_open_key"
  ON "payments" ("student_id", "exam_id") WHERE "status" IN ('PENDING_CONFIRMATION', 'PENDING_PIN');

-- -----------------------------------------------------------------------------
-- R3. Triggers
-- -----------------------------------------------------------------------------

-- T1 (P4). When an attempt draws a question version, lock that version.
CREATE FUNCTION "oe_lock_version_on_use"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "question_versions"
     SET "is_locked" = true, "locked_at" = now()
   WHERE "id" = NEW."question_version_id" AND NOT "is_locked";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "attempt_questions_lock_version"
  AFTER INSERT ON "attempt_questions"
  FOR EACH ROW EXECUTE FUNCTION "oe_lock_version_on_use"();

-- T2 (P4). A locked question version can never be updated or deleted.
CREATE FUNCTION "oe_protect_locked_version"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."is_locked" THEN
    RAISE EXCEPTION 'QUESTION_VERSION_LOCKED'
      USING ERRCODE = 'P0001',
            DETAIL = format('question_version %s is used by an exam attempt; create a new version instead', OLD."id");
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "question_versions_protect_locked"
  BEFORE UPDATE OR DELETE ON "question_versions"
  FOR EACH ROW EXECUTE FUNCTION "oe_protect_locked_version"();

-- T3 (P4). Options, accepted answers and rubric criteria of a locked version
-- cannot be added, changed or removed.
CREATE FUNCTION "oe_protect_locked_version_children"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ids := ARRAY[NEW."question_version_id"];
  ELSIF TG_OP = 'UPDATE' THEN
    v_ids := ARRAY[OLD."question_version_id", NEW."question_version_id"];
  ELSE
    v_ids := ARRAY[OLD."question_version_id"];
  END IF;

  IF EXISTS (SELECT 1 FROM "question_versions" WHERE "id" = ANY (v_ids) AND "is_locked") THEN
    RAISE EXCEPTION 'QUESTION_VERSION_LOCKED'
      USING ERRCODE = 'P0001',
            DETAIL = format('%s of a locked question version cannot be changed', TG_TABLE_NAME);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "question_options_protect_locked"
  BEFORE INSERT OR UPDATE OR DELETE ON "question_options"
  FOR EACH ROW EXECUTE FUNCTION "oe_protect_locked_version_children"();
CREATE TRIGGER "accepted_answers_protect_locked"
  BEFORE INSERT OR UPDATE OR DELETE ON "accepted_answers"
  FOR EACH ROW EXECUTE FUNCTION "oe_protect_locked_version_children"();
CREATE TRIGGER "rubric_criteria_protect_locked"
  BEFORE INSERT OR UPDATE OR DELETE ON "rubric_criteria"
  FOR EACH ROW EXECUTE FUNCTION "oe_protect_locked_version_children"();

-- T4 (P1, 6.2). History tables are append-only.
CREATE FUNCTION "oe_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY_TABLE'
    USING ERRCODE = 'P0001',
          DETAIL = format('%s rows cannot be updated or deleted', TG_TABLE_NAME);
END;
$$;

CREATE TRIGGER "grade_revisions_append_only"
  BEFORE UPDATE OR DELETE ON "grade_revisions"
  FOR EACH ROW EXECUTE FUNCTION "oe_append_only"();
CREATE TRIGGER "result_publications_append_only"
  BEFORE UPDATE OR DELETE ON "result_publications"
  FOR EACH ROW EXECUTE FUNCTION "oe_append_only"();
CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "oe_append_only"();

-- T5 (Completion condition 2, 4.7). Backup for the service-layer deadline check:
-- a student's response can only be written while the attempt is IN_PROGRESS and
-- the server clock is before the deadline. Grading updates after submission
-- (grading_status, marks) are still allowed because they do not change the response.
-- The FOR SHARE lock makes a save wait for a concurrent auto-submit and then fail.
CREATE FUNCTION "oe_answers_deadline_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_status   "AttemptStatus";
  v_deadline timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."selected_option_id" IS NULL AND NEW."text_answer" IS NULL THEN
      RETURN NEW;  -- empty row created at submission for unanswered questions
    END IF;
  ELSIF NEW."selected_option_id" IS NOT DISTINCT FROM OLD."selected_option_id"
    AND NEW."text_answer"        IS NOT DISTINCT FROM OLD."text_answer" THEN
    RETURN NEW;    -- response unchanged (e.g. grading update)
  END IF;

  SELECT "status", "deadline" INTO v_status, v_deadline
    FROM "exam_attempts" WHERE "id" = NEW."attempt_id" FOR SHARE;

  IF v_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'ATTEMPT_ALREADY_SUBMITTED' USING ERRCODE = 'P0001';
  END IF;
  IF clock_timestamp() > v_deadline THEN
    RAISE EXCEPTION 'ATTEMPT_DEADLINE_PASSED' USING ERRCODE = 'P0001';
  END IF;

  NEW."saved_at" := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "answers_deadline_guard"
  BEFORE INSERT OR UPDATE ON "answers"
  FOR EACH ROW EXECUTE FUNCTION "oe_answers_deadline_guard"();

-- T6 (P7, payment flow). Payments follow the approved status flow only:
--   PENDING_CONFIRMATION -> PENDING_PIN | CANCELLED | EXPIRED
--   PENDING_PIN          -> SUCCESS | FAILED | EXPIRED
-- Final states never change. Amount, currency, recipient, student, exam and
-- provider are fixed at creation. Payments are never deleted.
CREATE FUNCTION "oe_payments_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PAYMENT_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF NEW."student_id"      IS DISTINCT FROM OLD."student_id"
  OR NEW."exam_id"         IS DISTINCT FROM OLD."exam_id"
  OR NEW."provider"        IS DISTINCT FROM OLD."provider"
  OR NEW."phone"           IS DISTINCT FROM OLD."phone"
  OR NEW."amount"          IS DISTINCT FROM OLD."amount"
  OR NEW."currency"        IS DISTINCT FROM OLD."currency"
  OR NEW."merchant_name"   IS DISTINCT FROM OLD."merchant_name"
  OR NEW."merchant_number" IS DISTINCT FROM OLD."merchant_number"
  OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
  OR NEW."created_at"      IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'PAYMENT_FIELDS_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF OLD."status" IN ('SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED') THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_FINAL' USING ERRCODE = 'P0001';
  END IF;

  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'PENDING_CONFIRMATION' AND NEW."status" IN ('PENDING_PIN', 'CANCELLED', 'EXPIRED'))
    OR (OLD."status" = 'PENDING_PIN'          AND NEW."status" IN ('SUCCESS', 'FAILED', 'EXPIRED'))
  ) THEN
    RAISE EXCEPTION 'PAYMENT_INVALID_TRANSITION'
      USING ERRCODE = 'P0001', DETAIL = format('%s -> %s', OLD."status", NEW."status");
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "payments_guard"
  BEFORE UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "oe_payments_guard"();
