/**
 * Academic structure (Phase 2): academic years, eight semesters, lecturers assigned to faculties,
 * courses in a faculty + academic year + semester, student registrations, enrolling a whole
 * semester group, and who may see what.
 */
import { describe, expect, it } from "vitest";
import { assignToFaculty, createCourse, createUser, loginAs, prisma, testAcademicYear, uid, userAgent } from "./helpers.ts";

async function faculty(admin: Awaited<ReturnType<typeof userAgent>>[1]) {
  const f = await admin.post("/api/faculties").send({ code: `F${uid()}`.slice(0, 18), name: "Demo Faculty (test)" });
  expect(f.status).toBe(201);
  return f.body.faculty as { id: string; code: string };
}
const freeYear = () => 2100 + Math.floor(Math.random() * 800);

describe("academic years", () => {
  it("are created by the registrar as YYYY/YYYY+1 with dates, and exactly one can be current", async () => {
    const [, admin] = await userAgent("ADMIN");
    const y = freeYear();
    const a = await admin.post("/api/academic-years").send({ name: `${y}/${y + 1}`, startDate: `${y}-09-01`, endDate: `${y + 1}-07-31` });
    expect(a.status).toBe(201);
    expect(a.body.academicYear).toMatchObject({ name: `${y}/${y + 1}`, isCurrent: false });
    expect((await admin.post("/api/academic-years").send({ name: `${y}/${y + 1}`, startDate: `${y}-09-01`, endDate: `${y + 1}-07-31` })).body.error.code).toBe("ACADEMIC_YEAR_EXISTS");
    expect((await admin.post("/api/academic-years").send({ name: `${y}/${y + 2}`, startDate: `${y}-09-01`, endDate: `${y + 1}-07-31` })).body.error.code).toBe("ACADEMIC_YEAR_NAME_INVALID");
    expect((await admin.post("/api/academic-years").send({ name: `${y + 900}/${y + 901}`, startDate: `${y}-09-01`, endDate: `${y}-08-01` })).body.error.code).toBe("ACADEMIC_YEAR_DATES_INVALID");

    const b = await testAcademicYear(y === 2899 ? 2100 : y + 1);
    expect((await admin.post(`/api/academic-years/${a.body.academicYear.id}/activate`)).status).toBe(200);
    expect((await admin.post(`/api/academic-years/${b.id}/activate`)).body.academicYear.isCurrent).toBe(true);
    const current = await prisma.academicYear.findMany({ where: { isCurrent: true } });
    expect(current.map((c) => c.id)).toEqual([b.id]);
    // The database allows only one current year too.
    await expect(prisma.academicYear.update({ where: { id: a.body.academicYear.id }, data: { isCurrent: true } })).rejects.toThrow();

    const patched = await admin.patch(`/api/academic-years/${b.id}`).send({ endDate: `${b.name.slice(5)}-08-15` });
    expect(patched.status).toBe(200);
    const [, lecturer] = await userAgent("LECTURER");
    expect((await lecturer.get("/api/academic-years")).status).toBe(200);
    expect((await lecturer.post("/api/academic-years").send({ name: "2990/2991", startDate: "2990-09-01", endDate: "2991-07-01" })).status).toBe(403);
    const [, student] = await userAgent("STUDENT");
    expect((await student.get("/api/academic-years")).status).toBe(403);
  });
});

describe("faculty lecturers and courses", () => {
  it("require the lecturer to be assigned to the faculty, and record lecturer changes", async () => {
    const [, admin] = await userAgent("ADMIN");
    const f = await faculty(admin);
    const year = await testAcademicYear();
    const [l1] = await userAgent("LECTURER");
    const l2 = await createUser("LECTURER");
    const body = { facultyId: f.id, name: "Demo Course (test)", academicYearId: year.id, semesterNumber: 3 };

    const refused = await admin.post("/api/courses").send({ ...body, code: `C${uid()}`.slice(0, 18), lecturerId: l1.id });
    expect(refused.body.error.code).toBe("LECTURER_NOT_IN_FACULTY");
    expect((await admin.post(`/api/faculties/${f.id}/lecturers`).send({ lecturerId: l1.id })).status).toBe(201);
    expect((await admin.post(`/api/faculties/${f.id}/lecturers`).send({ lecturerId: l1.id })).body.error.code).toBe("LECTURER_ALREADY_ASSIGNED");
    const student = await createUser("STUDENT");
    expect((await admin.post(`/api/faculties/${f.id}/lecturers`).send({ lecturerId: student.id })).body.error.code).toBe("LECTURER_INVALID");

    const c = await admin.post("/api/courses").send({ ...body, code: `C${uid()}`.slice(0, 18), lecturerId: l1.id });
    expect(c.status).toBe(201);
    expect(c.body.course).toMatchObject({ academicYearId: year.id, semesterNumber: 3, semester: `${year.name} S3` });
    // Several courses in one semester.
    expect((await admin.post("/api/courses").send({ ...body, code: `C${uid()}`.slice(0, 18), lecturerId: l1.id })).status).toBe(201);
    const listed = await admin.get("/api/courses").query({ academicYearId: year.id, semesterNumber: 3, facultyId: f.id });
    expect(listed.body.items).toHaveLength(2);
    expect(listed.body.items[0].academicYear).toMatchObject({ id: year.id, name: year.name });

    // Cannot remove a lecturer who still teaches there; reassign first.
    expect((await admin.delete(`/api/faculties/${f.id}/lecturers/${l1.id}`)).body.error.code).toBe("LECTURER_TEACHES_IN_FACULTY");
    expect((await admin.patch(`/api/courses/${c.body.course.id}`).send({ lecturerId: l2.id })).body.error.code).toBe("LECTURER_NOT_IN_FACULTY");
    await admin.post(`/api/faculties/${f.id}/lecturers`).send({ lecturerId: l2.id });
    expect((await admin.patch(`/api/courses/${c.body.course.id}`).send({ lecturerId: l2.id })).status).toBe(200);
    const change = await prisma.auditLog.findFirst({ where: { entityId: c.body.course.id, actionCode: "COURSE_UPDATED" }, orderBy: { createdAt: "desc" } });
    expect(change?.details).toMatchObject({ lecturer: { from: l1.id, to: l2.id } });

    const lecturers = await admin.get(`/api/faculties/${f.id}/lecturers`);
    expect(lecturers.body.items.map((x: any) => [x.id, x.coursesInFaculty]).sort()).toEqual([[l1.id, 1], [l2.id, 1]].sort());
  });

  it("let an older course (no year yet) be given an academic year and semester, both together", async () => {
    const [, admin] = await userAgent("ADMIN");
    const lecturer = await createUser("LECTURER");
    const legacy = await createCourse(lecturer.id); // like the courses created before Phase 2
    expect(legacy.academicYearId).toBeNull();
    const year = await testAcademicYear();
    expect((await admin.patch(`/api/courses/${legacy.id}`).send({ academicYearId: year.id })).status).toBe(400);
    const done = await admin.patch(`/api/courses/${legacy.id}`).send({ academicYearId: year.id, semesterNumber: 8 });
    expect(done.status).toBe(200);
    expect(done.body.course).toMatchObject({ academicYearId: year.id, semesterNumber: 8, semester: `${year.name} S8` });
    expect((await admin.patch(`/api/courses/${legacy.id}`).send({ academicYearId: year.id, semesterNumber: 9 })).status).toBe(400);
  });

  it("show a lecturer only their faculties, and in a faculty only the courses they teach", async () => {
    const [, admin] = await userAgent("ADMIN");
    const f1 = await faculty(admin); const f2 = await faculty(admin);
    const year = await testAcademicYear();
    const [me, lec] = await userAgent("LECTURER");
    const other = await createUser("LECTURER");
    for (const [f, l] of [[f1, me], [f2, me], [f1, other]] as const) await assignToFaculty(f.id, l.id);
    const course = (f: { id: string }, l: { id: string }) => admin.post("/api/courses").send({ facultyId: f.id, code: `C${uid()}`.slice(0, 18), name: "Demo Course (test)", academicYearId: year.id, semesterNumber: 1, lecturerId: l.id });
    const mine = await course(f1, me); await course(f2, me); await course(f2, me); const theirs = await course(f1, other);

    const faculties = await lec.get("/api/my/faculties");
    expect(faculties.status).toBe(200);
    expect(Object.fromEntries(faculties.body.items.map((x: any) => [x.id, x.myCourses]))).toEqual({ [f1.id]: 1, [f2.id]: 2 });
    const inF1 = await lec.get("/api/courses").query({ facultyId: f1.id });
    expect(inF1.body.items.map((c: any) => c.id)).toEqual([mine.body.course.id]);
    expect((await lec.get(`/api/courses/${theirs.body.course.id}`)).status).toBe(404);
    expect((await lec.get(`/api/faculties/${f1.id}/lecturers`)).status).toBe(403);
  });
});

describe("student registrations and group enrolment", () => {
  it("register students per academic year, correct a registration, and enrol a semester group in its courses", async () => {
    const [, admin] = await userAgent("ADMIN");
    const f = await faculty(admin);
    const year = await testAcademicYear();
    const lecturer = await createUser("LECTURER");
    await assignToFaculty(f.id, lecturer.id);
    const s1 = await createUser("STUDENT"); const s2 = await createUser("STUDENT"); const outside = await createUser("STUDENT");
    const group = { academicYearId: year.id, facultyId: f.id, semesterNumber: 2 };

    const r1 = await admin.post("/api/registrations").send({ ...group, studentNumber: s1.username.toLowerCase() });
    expect(r1.status).toBe(201);
    expect(r1.body.registration).toMatchObject({ semesterNumber: 2, faculty: { id: f.id }, academicYear: { id: year.id }, student: { id: s1.id } });
    // Registering again in the same year corrects it (one registration per student and year).
    const wrong = await admin.post("/api/registrations").send({ ...group, semesterNumber: 5, studentId: s2.id });
    expect(wrong.status).toBe(201);
    const fixed = await admin.post("/api/registrations").send({ ...group, studentId: s2.id });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ created: false, registration: { semesterNumber: 2 } });
    expect(await prisma.studentRegistration.count({ where: { studentId: s2.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { actionCode: "REGISTRATION_UPDATED", entityId: fixed.body.registration.id } })).toBe(1);
    await admin.post("/api/registrations").send({ ...group, semesterNumber: 4, studentId: outside.id });
    expect((await admin.post("/api/registrations").send({ ...group, studentNumber: "S-2099-0000000001" })).body.error.code).toBe("STUDENT_NOT_FOUND");
    expect((await admin.post("/api/registrations").send({ ...group, studentId: s1.id, semesterNumber: 9 })).status).toBe(400);

    const list = await admin.get("/api/registrations").query({ ...group });
    expect(list.body.items.map((r: any) => r.student.id).sort()).toEqual([s1.id, s2.id].sort());

    expect((await admin.post("/api/registrations/enrol-group").send(group)).body.error.code).toBe("GROUP_HAS_NO_COURSES");
    const mk = () => admin.post("/api/courses").send({ facultyId: f.id, code: `C${uid()}`.slice(0, 18), name: "Demo Course (test)", ...{ academicYearId: year.id, semesterNumber: 2 }, lecturerId: lecturer.id });
    const c1 = (await mk()).body.course; const c2 = (await mk()).body.course;
    const first = await admin.post("/api/registrations/enrol-group").send(group);
    expect(first.body).toMatchObject({ students: 2, courses: 2, enrolled: 4, reactivated: 0, alreadyEnrolled: 0, skipped: [] });
    expect(await prisma.enrolment.count({ where: { studentId: outside.id } })).toBe(0);
    await admin.post(`/api/courses/${c1.id}/enrolments/${s1.id}/drop`);
    const again = await admin.post("/api/registrations/enrol-group").send(group);
    expect(again.body).toMatchObject({ enrolled: 0, reactivated: 1, alreadyEnrolled: 3 });
    expect(await prisma.enrolment.count({ where: { courseId: { in: [c1.id, c2.id] }, status: "ACTIVE" } })).toBe(4);
  });

  it("let a student see only their own academic information, and only the registrar manage it", async () => {
    const [, admin] = await userAgent("ADMIN");
    const f = await faculty(admin);
    const year = await testAcademicYear();
    const student = await createUser("STUDENT");
    await admin.post("/api/registrations").send({ academicYearId: year.id, facultyId: f.id, semesterNumber: 6, studentId: student.id });
    const me = await loginAs(student);
    const mine = await me.get("/api/my/academic");
    expect(mine.status).toBe(200);
    expect(mine.body.current).toMatchObject({ semesterNumber: 6, faculty: { id: f.id }, academicYear: { id: year.id } });
    expect(mine.body.registrations.every((r: any) => r.student.id === student.id)).toBe(true);
    expect((await me.get("/api/registrations")).status).toBe(403);
    expect((await me.post("/api/registrations/enrol-group").send({ academicYearId: year.id, facultyId: f.id, semesterNumber: 6 })).status).toBe(403);
    const [, lecturer] = await userAgent("LECTURER");
    expect((await lecturer.post("/api/registrations").send({ academicYearId: year.id, facultyId: f.id, semesterNumber: 1, studentId: student.id })).status).toBe(403);
    expect((await lecturer.get("/api/my/academic")).status).toBe(403);
    expect((await me.get("/api/my/faculties")).status).toBe(403);
  });
});
