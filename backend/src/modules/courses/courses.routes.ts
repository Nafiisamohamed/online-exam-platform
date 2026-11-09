/**
 * Faculty, course and enrolment endpoints. See docs/api.md#courses-and-enrolment.
 *
 * GET   /api/faculties                                  ADMIN, LECTURER
 * POST  /api/faculties                                  ADMIN
 * PATCH /api/faculties/:id                              ADMIN
 * GET   /api/courses                                    any role (scoped to the user)
 * POST  /api/courses                                    ADMIN  { facultyId, code, name, academicYearId, semesterNumber, lecturerId }
 * GET   /api/courses/:id                                ADMIN, course lecturer, enrolled student
 * PATCH /api/courses/:id                                ADMIN
 * GET   /api/courses/:id/enrolments                     ADMIN, course lecturer
 * POST  /api/courses/:id/enrolments                     ADMIN  { studentId } or { studentNumber }
 * POST  /api/courses/:id/enrolments/:studentId/drop     ADMIN  keeps past results
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, trimmed, validate, zid } from "../../middleware/validate.ts";
import { semesterLabel } from "../../lib/semester-label.ts";
import * as courses from "./courses.service.ts";

export const facultiesRouter = Router();
export const coursesRouter = Router();

const code = z.string().trim().regex(/^[A-Za-z0-9-]{2,20}$/, "use 2-20 letters, digits or dashes");
const semester = semesterLabel;
const semesterNumber = z.coerce.number().int().min(1).max(8);

facultiesRouter.use(authenticate());

facultiesRouter.get("/", requireRole("ADMIN", "LECTURER"), async (_req, res) => {
  res.json({ items: await courses.listFaculties() });
});

facultiesRouter.post("/", requireRole("ADMIN"), validate({ body: z.object({ code, name: trimmed(200) }) }), async (req, res) => {
  res.status(201).json({ faculty: await courses.createFaculty(req.valid.body, currentUser(req).id, req) });
});

facultiesRouter.patch("/:id", requireRole("ADMIN"), validate({ params: idParams, body: z.object({ name: trimmed(200) }) }), async (req, res) => {
  res.json({ faculty: await courses.updateFaculty(req.valid.params.id, req.valid.body, currentUser(req).id, req) });
});

coursesRouter.use(authenticate());

/** Query: semester?, facultyId?, academicYearId?, semesterNumber?. Response: { items: Course[] } scoped to the user. */
coursesRouter.get("/", validate({ query: z.object({ semester: semester.optional(), facultyId: zid.optional(), academicYearId: zid.optional(), semesterNumber: semesterNumber.optional() }) }), async (req, res) => {
  res.json({ items: await courses.listCourses(currentUser(req), req.valid.query) });
});

coursesRouter.post(
  "/",
  requireRole("ADMIN"),
  validate({ body: z.object({ facultyId: zid, code, name: trimmed(200), academicYearId: zid, semesterNumber, lecturerId: zid }) }),
  async (req, res) => {
    res.status(201).json({ course: await courses.createCourse(req.valid.body, currentUser(req).id, req) });
  },
);

coursesRouter.get("/:id", validate({ params: idParams }), async (req, res) => {
  res.json({ course: await courses.getCourse(currentUser(req), req.valid.params.id) });
});

coursesRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  validate({
    params: idParams,
    body: z.object({ name: trimmed(200).optional(), lecturerId: zid.optional(), facultyId: zid.optional(), academicYearId: zid.optional(), semesterNumber: semesterNumber.optional() })
      .refine((v) => Object.keys(v).length > 0, "send at least one field")
      .refine((v) => (v.academicYearId === undefined) === (v.semesterNumber === undefined), "send academicYearId and semesterNumber together"),
  }),
  async (req, res) => {
    res.json({ course: await courses.updateCourse(req.valid.params.id, req.valid.body, currentUser(req).id, req) });
  },
);

coursesRouter.get(
  "/:id/enrolments",
  requireRole("ADMIN", "LECTURER"),
  validate({ params: idParams, query: z.object({ status: z.enum(["ACTIVE", "DROPPED"]).optional() }) }),
  async (req, res) => {
    res.json({ items: await courses.listEnrolments(currentUser(req), req.valid.params.id, req.valid.query.status) });
  },
);

coursesRouter.post(
  "/:id/enrolments",
  requireRole("ADMIN"),
  validate({
    params: idParams,
    body: z.object({ studentId: zid.optional(), studentNumber: z.string().trim().min(1).max(30).optional() }).refine((v) => v.studentId || v.studentNumber, "send studentId or studentNumber"),
  }),
  async (req, res) => {
    res.status(201).json({ enrolment: await courses.enrolStudent(req.valid.params.id, req.valid.body, currentUser(req).id, req) });
  },
);

coursesRouter.post(
  "/:id/enrolments/:studentId/drop",
  requireRole("ADMIN"),
  validate({ params: z.object({ id: zid, studentId: zid }) }),
  async (req, res) => {
    res.json({ enrolment: await courses.dropStudent(req.valid.params.id, req.valid.params.studentId, currentUser(req).id, req) });
  },
);
