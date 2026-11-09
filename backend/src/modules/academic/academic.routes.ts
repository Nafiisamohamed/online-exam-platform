/**
 * Academic structure endpoints (Phase 2). See docs/api.md#academic-structure.
 *
 * GET    /api/academic-years                          ADMIN, LECTURER
 * POST   /api/academic-years                          ADMIN  { name: "2026/2027", startDate, endDate, isCurrent? }
 * PATCH  /api/academic-years/:id                      ADMIN  { startDate?, endDate? }
 * POST   /api/academic-years/:id/activate             ADMIN  make it the current year
 * GET    /api/faculties/:id/lecturers                 ADMIN
 * POST   /api/faculties/:id/lecturers                 ADMIN  { lecturerId }
 * DELETE /api/faculties/:id/lecturers/:lecturerId     ADMIN  (refused while they teach a course there)
 * GET    /api/registrations                           ADMIN  ?academicYearId, facultyId, semesterNumber, search, page, pageSize
 * POST   /api/registrations                           ADMIN  { studentId | studentNumber, academicYearId, facultyId, semesterNumber }
 * POST   /api/registrations/enrol-group               ADMIN  { academicYearId, facultyId, semesterNumber }
 * GET    /api/my/academic                             STUDENT: own faculty, academic year and semester
 * GET    /api/my/faculties                            LECTURER: own faculties with their course counts
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, pageQuery, validate, zid } from "../../middleware/validate.ts";
import * as academic from "./academic.service.ts";

export const academicRouter = Router();

const day = z.coerce.date();
const yearName = z.string().trim().regex(/^\d{4}\/\d{4}$/, 'use the form "2026/2027"');
const semesterNumber = z.coerce.number().int().min(1).max(8);
const group = { academicYearId: zid, facultyId: zid, semesterNumber };

academicRouter.get("/academic-years", authenticate(), requireRole("ADMIN", "LECTURER"), async (_req, res) => {
  res.json({ items: await academic.listAcademicYears() });
});

academicRouter.post(
  "/academic-years",
  authenticate(), requireRole("ADMIN"),
  validate({ body: z.object({ name: yearName, startDate: day, endDate: day, isCurrent: z.boolean().optional() }) }),
  async (req, res) => {
    res.status(201).json({ academicYear: await academic.createAcademicYear(req.valid.body, currentUser(req).id, req) });
  },
);

academicRouter.patch(
  "/academic-years/:id",
  authenticate(), requireRole("ADMIN"),
  validate({ params: idParams, body: z.object({ startDate: day.optional(), endDate: day.optional() }).refine((v) => Object.keys(v).length > 0, "send at least one field") }),
  async (req, res) => {
    res.json({ academicYear: await academic.updateAcademicYear(req.valid.params.id, req.valid.body, currentUser(req).id, req) });
  },
);

academicRouter.post("/academic-years/:id/activate", authenticate(), requireRole("ADMIN"), validate({ params: idParams }), async (req, res) => {
  res.json({ academicYear: await academic.activateAcademicYear(req.valid.params.id, currentUser(req).id, req) });
});

academicRouter.get("/faculties/:id/lecturers", authenticate(), requireRole("ADMIN"), validate({ params: idParams }), async (req, res) => {
  res.json({ items: await academic.listFacultyLecturers(req.valid.params.id) });
});

academicRouter.post(
  "/faculties/:id/lecturers",
  authenticate(), requireRole("ADMIN"),
  validate({ params: idParams, body: z.object({ lecturerId: zid }) }),
  async (req, res) => {
    res.status(201).json({ assignment: await academic.assignLecturer(req.valid.params.id, req.valid.body.lecturerId, currentUser(req).id, req) });
  },
);

academicRouter.delete(
  "/faculties/:id/lecturers/:lecturerId",
  authenticate(), requireRole("ADMIN"),
  validate({ params: z.object({ id: zid, lecturerId: zid }) }),
  async (req, res) => {
    await academic.unassignLecturer(req.valid.params.id, req.valid.params.lecturerId, currentUser(req).id, req);
    res.status(204).end();
  },
);

academicRouter.get(
  "/registrations",
  authenticate(), requireRole("ADMIN"),
  validate({ query: pageQuery.extend({ academicYearId: zid.optional(), facultyId: zid.optional(), semesterNumber: semesterNumber.optional(), search: z.string().trim().min(1).max(100).optional() }) }),
  async (req, res) => {
    res.json(await academic.listRegistrations(req.valid.query));
  },
);

academicRouter.post(
  "/registrations",
  authenticate(), requireRole("ADMIN"),
  validate({
    body: z.object({ ...group, studentId: zid.optional(), studentNumber: z.string().trim().min(1).max(30).optional() })
      .refine((v) => v.studentId || v.studentNumber, "send studentId or studentNumber"),
  }),
  async (req, res) => {
    const { registration, created } = await academic.registerStudent(req.valid.body, currentUser(req).id, req);
    res.status(created ? 201 : 200).json({ registration, created });
  },
);

academicRouter.post("/registrations/enrol-group", authenticate(), requireRole("ADMIN"), validate({ body: z.object(group) }), async (req, res) => {
  res.json(await academic.enrolGroup(req.valid.body, currentUser(req).id, req));
});

academicRouter.get("/my/academic", authenticate(), requireRole("STUDENT"), async (req, res) => {
  res.json(await academic.myAcademic(currentUser(req)));
});

academicRouter.get("/my/faculties", authenticate(), requireRole("LECTURER"), async (req, res) => {
  res.json({ items: await academic.myFaculties(currentUser(req)) });
});
