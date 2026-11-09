-- Lets the registrar delete faculties and courses that were created by mistake.
--   Only the DELETE permission is added for the application role (exam_app); no table, column or row
--   is changed. Every table that refers to a faculty or course keeps its ON DELETE RESTRICT foreign key,
--   so the database itself refuses to delete a faculty or course that still has courses, registrations,
--   semester fees, lecturer assignments, enrolments, questions, topics, imports or examinations.
--   The application checks the same before deleting and removes only lecturer assignments with a faculty.
BEGIN;

GRANT DELETE ON "faculties" TO exam_app;
GRANT DELETE ON "courses" TO exam_app;

COMMIT;
