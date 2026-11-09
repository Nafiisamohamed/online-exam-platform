-- Phase 2: academic structure.
--   academic_years         "2026/2027" with dates; at most one is current.
--   courses                + academic_year_id and semester_number (1-8), both set or both empty.
--                          Existing courses keep both EMPTY (nothing is guessed); the registrar
--                          completes them on the Courses screen. The old "semester" text stays.
--   faculty_lecturers      lecturers assigned to a faculty; filled from the faculty/lecturer pairs
--                          the existing courses already have (no new information).
--   student_registrations  a student's faculty and semester (1-8) in an academic year: one row per
--                          student, academic year and semester (Semester 1 and 2 of one year are two rows).
-- Nothing is deleted or rewritten. Everything runs in ONE transaction: if any step fails,
-- nothing is changed.
BEGIN;

-- 1. Academic years.
CREATE TABLE "academic_years" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "name"       TEXT         NOT NULL,
  "start_date" DATE         NOT NULL,
  "end_date"   DATE         NOT NULL,
  "is_current" BOOLEAN      NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id"),
  -- "2026/2027": two consecutive years.
  CONSTRAINT "academic_years_name_chk" CHECK (
    "name" ~ '^[0-9]{4}/[0-9]{4}$' AND split_part("name", '/', 2)::int = split_part("name", '/', 1)::int + 1),
  CONSTRAINT "academic_years_dates_chk" CHECK ("end_date" > "start_date")
);
CREATE UNIQUE INDEX "academic_years_name_key" ON "academic_years" ("name");
-- At most one current year.
CREATE UNIQUE INDEX "academic_years_one_current" ON "academic_years" ("is_current") WHERE "is_current";

-- 2. Courses: academic year and semester (1-8).
ALTER TABLE "courses"
  ADD COLUMN "academic_year_id" UUID,
  ADD COLUMN "semester_number" SMALLINT,
  ADD CONSTRAINT "courses_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "courses_semester_number_chk" CHECK ("semester_number" BETWEEN 1 AND 8),
  ADD CONSTRAINT "courses_year_and_semester_chk" CHECK (("academic_year_id" IS NULL) = ("semester_number" IS NULL));
CREATE INDEX "courses_academic_year_id_semester_number_idx" ON "courses" ("academic_year_id", "semester_number");

-- 3. Lecturers assigned to faculties.
CREATE TABLE "faculty_lecturers" (
  "faculty_id"  UUID NOT NULL,
  "lecturer_id" UUID NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "faculty_lecturers_pkey" PRIMARY KEY ("faculty_id", "lecturer_id"),
  CONSTRAINT "faculty_lecturers_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "faculty_lecturers_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "faculty_lecturers_lecturer_id_idx" ON "faculty_lecturers" ("lecturer_id");
-- Every lecturer already teaching a course becomes assigned to that course's faculty.
INSERT INTO "faculty_lecturers" ("faculty_id", "lecturer_id")
SELECT DISTINCT "faculty_id", "lecturer_id" FROM "courses"
ON CONFLICT DO NOTHING;

-- 4. Student registrations (faculty and semester per academic year).
CREATE TABLE "student_registrations" (
  "id"               UUID     NOT NULL DEFAULT gen_random_uuid(),
  "student_id"       UUID     NOT NULL,
  "academic_year_id" UUID     NOT NULL,
  "faculty_id"       UUID     NOT NULL,
  "semester_number"  SMALLINT NOT NULL,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "student_registrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_registrations_semester_number_chk" CHECK ("semester_number" BETWEEN 1 AND 8),
  CONSTRAINT "student_registrations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "student_registrations_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "student_registrations_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- One registration per student, academic year and semester.
CREATE UNIQUE INDEX "student_registrations_student_year_semester_key" ON "student_registrations" ("student_id", "academic_year_id", "semester_number");
CREATE INDEX "student_registrations_group_idx" ON "student_registrations" ("academic_year_id", "faculty_id", "semester_number");

-- 5. Same access rules as every other table: exam_app may read, add and update (never delete),
--    except that a lecturer can be removed from a faculty (faculty_lecturers allows DELETE);
--    row-level security on with the single exam_app policy.
GRANT SELECT, INSERT, UPDATE ON "academic_years", "faculty_lecturers", "student_registrations" TO exam_app;
GRANT DELETE ON "faculty_lecturers" TO exam_app;
ALTER TABLE "academic_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "faculty_lecturers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_registrations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academic_years_exam_app_access" ON "academic_years" AS PERMISSIVE FOR ALL TO exam_app USING (true) WITH CHECK (true);
CREATE POLICY "faculty_lecturers_exam_app_access" ON "faculty_lecturers" AS PERMISSIVE FOR ALL TO exam_app USING (true) WITH CHECK (true);
CREATE POLICY "student_registrations_exam_app_access" ON "student_registrations" AS PERMISSIVE FOR ALL TO exam_app USING (true) WITH CHECK (true);

COMMIT;
