/** Users, faculties, courses, enrolment, CSV enrolment import, rooms and grading scale (4.1, 4.5, D6, Q1). */
import { describe, expect, it } from "vitest";
import { app, assignToFaculty, createUser, loginAs, prisma, request, testAcademicYear, uid, userAgent } from "./helpers.ts";

async function setupCourse() {
  const [, admin] = await userAgent("ADMIN");
  const lecturer = await createUser("LECTURER");
  const f = await admin.post("/api/faculties").send({ code: `F${uid()}`.slice(0, 18), name: "Faculty of Testing" });
  expect(f.status).toBe(201);
  const code = `C${uid()}`.slice(0, 18);
  const year = await testAcademicYear();
  await assignToFaculty(f.body.faculty.id, lecturer.id);
  const c = await admin.post("/api/courses").send({ facultyId: f.body.faculty.id, code, name: "Test Course", academicYearId: year.id, semesterNumber: 1, lecturerId: lecturer.id });
  expect(c.status).toBe(201);
  return { admin, lecturer, facultyId: f.body.faculty.id, course: c.body.course, year };
}

describe("user management", () => {
  it("lets only the admin create users, with a one-time temporary password and an SMS without it", async () => {
    const [, admin] = await userAgent("ADMIN");
    // A typed number is ignored: the server always generates it.
    const res = await admin.post("/api/users").send({ role: "STUDENT", fullName: "Ayaan Cabdi Xasan", phone: "061 512 3499", studentNumber: "MY-OWN-123" });
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toMatch(/^[A-Za-z2-9]{12}$/);
    expect(res.body.user.username).toMatch(/^S-\d{4}-\d{3,}$/);
    expect(res.body.user).toMatchObject({ studentNumber: res.body.user.username, phone: "+252615123499", mustChangePassword: true });
    expect(res.body.user.passwordHash).toBeUndefined();

    const sms = await prisma.smsOutbox.findFirstOrThrow({ where: { recipientId: res.body.user.id } });
    expect(sms.templateKey).toBe("ACCOUNT_CREATED");
    expect(sms.body).not.toContain(res.body.temporaryPassword);
    expect(sms.body.startsWith("[DEMO]")).toBe(true);

    const email = `dup.${uid().toLowerCase()}@uni.test`;
    expect((await admin.post("/api/users").send({ role: "LECTURER", fullName: "Lecturer One", phone: "+252615123400", email })).status).toBe(201);
    const again = await admin.post("/api/users").send({ role: "LECTURER", fullName: "Lecturer Two", phone: "+252615123401", email });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("EMAIL_TAKEN");

    const [, lecturer] = await userAgent("LECTURER");
    expect((await lecturer.get("/api/users")).status).toBe(403);
    expect((await lecturer.post("/api/users").send({})).status).toBe(403);
  });

  it("rejects invalid phone numbers and resets passwords", async () => {
    const [, admin] = await userAgent("ADMIN");
    const bad = await admin.post("/api/users").send({ role: "LECTURER", fullName: "X", phone: "12345", email: `x${uid()}@test.local` });
    expect(bad.status).toBe(400);
    const user = await createUser("LECTURER");
    const reset = await admin.post(`/api/users/${user.id}/reset-password`);
    expect(reset.status).toBe(200);
    const login = await request(app).post("/api/auth/login").send({ identifier: user.email, password: reset.body.temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
  });
});

describe("courses and enrolment", () => {
  it("rejects a duplicate course code in the same semester", async () => {
    const { admin, facultyId, course, lecturer, year } = await setupCourse();
    const dup = await admin.post("/api/courses").send({ facultyId, code: course.code, name: "Again", academicYearId: year.id, semesterNumber: 1, lecturerId: lecturer.id });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("COURSE_EXISTS");
  });

  it("scopes course lists: lecturers see their own courses, students their active enrolments", async () => {
    const { admin, lecturer, course } = await setupCourse();
    const student = await createUser("STUDENT");
    const lecturerAgent = await loginAs(lecturer);
    const studentAgent = await loginAs(student);
    const [, otherLecturer] = await userAgent("LECTURER");

    expect((await lecturerAgent.get("/api/courses")).body.items.map((c: any) => c.id)).toEqual([course.id]);
    expect((await otherLecturer.get("/api/courses")).body.items.map((c: any) => c.id)).not.toContain(course.id);
    expect((await otherLecturer.get(`/api/courses/${course.id}`)).status).toBe(404);
    expect((await studentAgent.get("/api/courses")).body.items).toHaveLength(0);

    expect((await admin.post(`/api/courses/${course.id}/enrolments`).send({ studentNumber: student.studentNumber })).status).toBe(201);
    expect((await admin.post(`/api/courses/${course.id}/enrolments`).send({ studentId: student.id })).body.error.code).toBe("ALREADY_ENROLLED");
    expect((await studentAgent.get("/api/courses")).body.items.map((c: any) => c.id)).toEqual([course.id]);

    // Dropping keeps the row (and so the student's results); the course disappears from their list.
    const drop = await admin.post(`/api/courses/${course.id}/enrolments/${student.id}/drop`);
    expect(drop.status).toBe(200);
    expect(drop.body.enrolment.status).toBe("DROPPED");
    expect((await studentAgent.get("/api/courses")).body.items).toHaveLength(0);
    const list = await lecturerAgent.get(`/api/courses/${course.id}/enrolments`);
    expect(list.body.items[0]).toMatchObject({ status: "DROPPED" });
    // Enrolling again reactivates the same enrolment.
    expect((await admin.post(`/api/courses/${course.id}/enrolments`).send({ studentId: student.id })).body.enrolment.status).toBe("ACTIVE");
  });
});

describe("CSV enrolment import", () => {
  it("previews rows with error codes, saves only valid rows and returns temporary passwords once", async () => {
    const { admin, course } = await setupCourse();
    const existing = await createUser("STUDENT", { fullName: "Faadumo Cali Warsame" });
    const newName = `Cabdullaahi Xasan Nuur ${uid()}`;
    const csv = [
      "student_id,student_name,phone,course_codes",
      `,${newName},+252615111111,${course.code}`, // new student: the number is generated
      `,Maryan Yuusuf Cumar,0634222222,${course.code};NOPE101`,
      `,${newName},+252615111111,${course.code}`, // the same new student twice
      `S-2099-999999999,No Such Student,+252615444444,${course.code}`, // numbers cannot be chosen
      `${existing.studentNumber},Faadumo Cali Warsame,+252615555555,${course.code}`,
      `BAD ID!,Bad Id,12,${course.code}`,
      `,Faadumo Cali Warsame,+252615000000,${course.code}`, // already has an account
    ].join("\n");
    const preview = await admin.post("/api/imports/enrolments").field("semester", course.semester).attach("file", Buffer.from(csv), "students.csv");
    expect(preview.status).toBe(201);
    expect(preview.body.batch).toMatchObject({ totalRows: 7, validRows: 2, invalidRows: 5, status: "PREVIEW" });
    const codes = (row: number) => preview.body.rows.find((r: any) => r.row === row).errors.map((e: any) => e.code);
    expect(codes(3)).toContain("COURSE_NOT_FOUND");
    expect(codes(4)).toContain("DUPLICATE_STUDENT_IN_FILE");
    expect(codes(5)).toContain("STUDENT_NOT_FOUND");
    expect(codes(7)).toEqual(expect.arrayContaining(["STUDENT_ID_INVALID", "PHONE_INVALID"]));
    expect(preview.body.rows.find((r: any) => r.row === 8).errors).toEqual([{ code: "STUDENT_ALREADY_EXISTS", params: { studentNumber: existing.studentNumber } }]);

    // Nothing is saved by the preview.
    expect(await prisma.user.count({ where: { fullName: newName } })).toBe(0);

    const confirm = await admin.post(`/api/imports/${preview.body.batch.id}/confirm`);
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({ savedRows: 2, newStudents: 1, enrolled: 2 });
    expect(confirm.body.temporaryPasswords).toHaveLength(1);
    const n1 = confirm.body.temporaryPasswords[0].studentNumber;
    expect(n1).toMatch(/^S-\d{4}-\d{3,}$/);
    const created = await prisma.user.findUniqueOrThrow({ where: { studentNumber: n1 } });
    expect(created).toMatchObject({ username: n1, fullName: newName, mustChangePassword: true });
    expect(created.passwordHash).not.toContain(confirm.body.temporaryPasswords[0].temporaryPassword);
    expect(await prisma.user.count({ where: { fullName: "Maryan Yuusuf Cumar" } })).toBe(0);

    const login = await request(app).post("/api/auth/login").send({ identifier: n1, password: confirm.body.temporaryPasswords[0].temporaryPassword });
    expect(login.status).toBe(200);

    const twice = await admin.post(`/api/imports/${preview.body.batch.id}/confirm`);
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe("IMPORT_ALREADY_CONFIRMED");
  });

  it("rejects files with missing columns", async () => {
    const [, admin] = await userAgent("ADMIN");
    const res = await admin.post("/api/imports/enrolments").field("semester", "2026-Fall").attach("file", Buffer.from("name,phone\nA,B\n"), "x.csv");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CSV_MISSING_COLUMNS");
  });
});

describe("rooms and grading scale", () => {
  it("validates network ranges", async () => {
    const [, admin] = await userAgent("ADMIN");
    expect((await admin.post("/api/rooms").send({ name: `Lab ${uid()}`, building: "Main", networkRanges: ["10.10.4.0/33"] })).status).toBe(400);
    const ok = await admin.post("/api/rooms").send({ name: `Lab ${uid()}`, building: "Main", networkRanges: ["10.10.4.0/24", "127.0.0.1/32"] });
    expect(ok.status).toBe(201);
  });

  it("lets the admin replace the scale only with a valid one", async () => {
    const [, admin] = await userAgent("ADMIN");
    expect((await admin.put("/api/grading-scale").send({ bands: [{ letter: "A", minPercentage: 90 }, { letter: "B", minPercentage: 50 }] })).status).toBe(400);
    const ok = await admin.put("/api/grading-scale").send({ bands: [{ letter: "A", minPercentage: 90 }, { letter: "B", minPercentage: 80 }, { letter: "C", minPercentage: 70 }, { letter: "D", minPercentage: 60 }, { letter: "F", minPercentage: 0 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.bands.map((b: any) => b.letter)).toEqual(["A", "B", "C", "D", "F"]);
    const [, student] = await userAgent("STUDENT");
    expect((await student.put("/api/grading-scale").send({ bands: [] })).status).toBe(403);
  });
});
