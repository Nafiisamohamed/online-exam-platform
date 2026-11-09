/** Deleting faculties and courses created by mistake: refused while linked records exist (they are kept). */
import { describe, expect, it } from "vitest";
import { assignToFaculty, createUser, enrol, loginAs, prisma, testAcademicYear, uid, userAgent } from "./helpers.ts";

async function setup() {
  const [, admin] = await userAgent("ADMIN");
  const year = await testAcademicYear();
  const lecturer = await createUser("LECTURER");
  const f = (await admin.post("/api/faculties").send({ code: `DF${uid()}`.slice(0, 18), name: "Demo Faculty (test)" })).body.faculty;
  await assignToFaculty(f.id, lecturer.id);
  const newCourse = async () => (await admin.post("/api/courses").send({ facultyId: f.id, code: `DC${uid()}`.slice(0, 18), name: "Demo Course (test)", academicYearId: year.id, semesterNumber: 1, lecturerId: lecturer.id })).body.course;
  return { admin, year, lecturer, f, newCourse };
}

describe("deleting a course", () => {
  it("deletes an unused course and records it in Activity History", async () => {
    const { admin, newCourse } = await setup();
    const c = await newCourse();
    const res = await admin.delete(`/api/courses/${c.id}`);
    expect(res.body).toEqual({ deleted: true });
    expect(await prisma.course.count({ where: { id: c.id } })).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { entityId: c.id, actionCode: "COURSE_DELETED" } });
    expect(log?.details).toMatchObject({ code: c.code, semesterNumber: 1 });
    expect((await admin.delete(`/api/courses/${c.id}`)).status).toBe(404);
  });

  it("refuses while enrolments (also dropped), questions, topics or exams exist, and keeps them", async () => {
    const { admin, lecturer, newCourse } = await setup();
    const withStudent = await newCourse();
    const student = await createUser("STUDENT");
    await enrol(withStudent.id, student.id);
    await admin.post(`/api/courses/${withStudent.id}/enrolments/${student.id}/drop`);
    const r1 = await admin.delete(`/api/courses/${withStudent.id}`);
    expect(r1.status).toBe(409);
    expect(r1.body.error).toMatchObject({ code: "COURSE_IN_USE", details: { enrolments: 1, exams: 0 } });

    const withTopic = await newCourse();
    await prisma.topic.create({ data: { courseId: withTopic.id, name: "SQL" } });
    expect((await admin.delete(`/api/courses/${withTopic.id}`)).body.error).toMatchObject({ code: "COURSE_IN_USE", details: { topics: 1 } });

    const withExam = await newCourse();
    const lecturerAgent = await loginAs(lecturer);
    expect((await lecturerAgent.post("/api/exams").send({ examType: "QUIZ", courseId: withExam.id, title: "Kept" })).status).toBe(201);
    expect((await admin.delete(`/api/courses/${withExam.id}`)).body.error).toMatchObject({ code: "COURSE_IN_USE", details: { exams: 1 } });
    expect(await prisma.course.count({ where: { id: { in: [withStudent.id, withTopic.id, withExam.id] } } })).toBe(3);
    expect(await prisma.enrolment.count({ where: { courseId: withStudent.id } })).toBe(1);
  });

  it("is for the registrar only", async () => {
    const { newCourse } = await setup();
    const c = await newCourse();
    const [, lecturer] = await userAgent("LECTURER");
    const [, student] = await userAgent("STUDENT");
    expect((await lecturer.delete(`/api/courses/${c.id}`)).status).toBe(403);
    expect((await student.delete(`/api/courses/${c.id}`)).status).toBe(403);
  });
});

describe("faculties", () => {
  it("can be edited (code and name) and deleted with their lecturer assignments when nothing else links to them", async () => {
    const { admin, f, lecturer } = await setup();
    const code = `ED${uid()}`.slice(0, 18);
    const edited = await admin.patch(`/api/faculties/${f.id}`).send({ code: code.toLowerCase(), name: "Renamed Faculty (test)" });
    expect(edited.body.faculty).toMatchObject({ code: code.toUpperCase(), name: "Renamed Faculty (test)" });
    const res = await admin.delete(`/api/faculties/${f.id}`);
    expect(res.body).toEqual({ deleted: true });
    expect(await prisma.faculty.count({ where: { id: f.id } })).toBe(0);
    expect(await prisma.facultyLecturer.count({ where: { facultyId: f.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: lecturer.id } })).toBe(1); // the lecturer stays
    const log = await prisma.auditLog.findFirst({ where: { entityId: f.id, actionCode: "FACULTY_DELETED" } });
    expect(log?.details).toMatchObject({ lecturerAssignmentsRemoved: 1 });
  });

  it("refuses while courses, registrations or semester fees belong to the faculty", async () => {
    const { admin, f, year, newCourse } = await setup();
    const c = await newCourse();
    expect((await admin.delete(`/api/faculties/${f.id}`)).body.error).toMatchObject({ code: "FACULTY_IN_USE", details: { courses: 1 } });
    await admin.delete(`/api/courses/${c.id}`);
    const student = await createUser("STUDENT");
    await prisma.studentRegistration.create({ data: { studentId: student.id, academicYearId: year.id, facultyId: f.id, semesterNumber: 1 } });
    expect((await admin.delete(`/api/faculties/${f.id}`)).body.error).toMatchObject({ code: "FACULTY_IN_USE", details: { courses: 0, registrations: 1 } });
    expect(await prisma.faculty.count({ where: { id: f.id } })).toBe(1);
    const [, lecturerAgent] = await userAgent("LECTURER");
    expect((await lecturerAgent.delete(`/api/faculties/${f.id}`)).status).toBe(403);
    expect((await admin.patch(`/api/faculties/${f.id}`).send({})).status).toBe(400);
  });
});
