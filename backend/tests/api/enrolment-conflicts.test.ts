/** 4.5: enrolling after approval must not give a student two overlapping exams. */
import { describe, expect, it } from "vitest";
import { addQuestions, createCourse, createUser, enrol, prisma, userAgent } from "./helpers.ts";

const at = (days: number, hourUtc: number) => {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + days);
  t.setUTCHours(hourUtc, 0, 0, 0);
  return t;
};

/** A course with a published exam and an APPROVED schedule for the given window. */
async function courseWithExam(windowStart: Date, windowEnd: Date) {
  const [lecturer, agent] = await userAgent("LECTURER");
  const course = await createCourse(lecturer.id);
  await addQuestions(agent, course.id, 1, { type: "MCQ" });
  const exam = await agent.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: `Exam ${course.code}`, rules: [{ questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 2, questionCount: 1 }] });
  await agent.post(`/api/exams/${exam.body.exam.id}/publish`);
  const admin = await createUser("ADMIN");
  await prisma.examSchedule.create({
    data: { examId: exam.body.exam.id, requestedById: lecturer.id, decidedById: admin.id, decidedAt: new Date(), status: "APPROVED", windowStart, windowEnd, durationMinutes: 60 },
  });
  return course;
}

describe("enrolment schedule conflicts", () => {
  it("refuses an individual enrolment (or reactivation) that would create overlapping exams", async () => {
    const [, admin] = await userAgent("ADMIN");
    const a = await courseWithExam(at(10, 6), at(10, 8));
    const b = await courseWithExam(at(10, 7), at(10, 9)); // overlaps A
    const c = await courseWithExam(at(10, 9), at(10, 11)); // starts when A ends: no overlap
    const student = await createUser("STUDENT");
    await enrol(a.id, student.id);

    const clash = await admin.post(`/api/courses/${b.id}/enrolments`).send({ studentId: student.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("ENROLMENT_SCHEDULE_CONFLICT");
    expect(clash.body.error.details.conflicts[0]).toMatchObject({ course: b.code, otherCourse: a.code });
    expect(await prisma.enrolment.count({ where: { studentId: student.id, courseId: b.id } })).toBe(0);

    expect((await admin.post(`/api/courses/${c.id}/enrolments`).send({ studentId: student.id })).status).toBe(201);

    // Reactivating a dropped enrolment is checked too.
    await prisma.enrolment.create({ data: { studentId: (await createUser("STUDENT")).id, courseId: b.id } });
    const dropped = await createUser("STUDENT");
    await enrol(a.id, dropped.id);
    await prisma.enrolment.create({ data: { studentId: dropped.id, courseId: b.id, status: "DROPPED", droppedAt: new Date() } });
    const reactivate = await admin.post(`/api/courses/${b.id}/enrolments`).send({ studentId: dropped.id });
    expect(reactivate.body.error.code).toBe("ENROLMENT_SCHEDULE_CONFLICT");
  });

  it("ignores exams that are already over", async () => {
    const [, admin] = await userAgent("ADMIN");
    const past1 = await courseWithExam(at(-3, 6), at(-3, 8));
    const past2 = await courseWithExam(at(-3, 7), at(-3, 9));
    const student = await createUser("STUDENT");
    await enrol(past1.id, student.id);
    expect((await admin.post(`/api/courses/${past2.id}/enrolments`).send({ studentId: student.id })).status).toBe(201);
  });

  it("marks CSV rows that would create overlapping exams as invalid, including two clashing courses on one row", async () => {
    const [, admin] = await userAgent("ADMIN");
    const a = await courseWithExam(at(12, 6), at(12, 8));
    const b = await courseWithExam(at(12, 7), at(12, 9));
    const c = await courseWithExam(at(13, 6), at(13, 8));
    const existing = await createUser("STUDENT", { fullName: "Xaliimo Cali Nuur" });
    await enrol(a.id, existing.id);
    const csv = [
      "student_id,student_name,phone,course_codes",
      `${existing.studentNumber},Xaliimo Cali Nuur,+252615000101,${b.code}`,
      `,Bile Xasan Faarax,+252615000102,${a.code};${b.code}`,
      `,Muna Cumar Aadan,+252615000103,${a.code};${c.code}`,
    ].join("\n");
    const preview = await admin.post("/api/imports/enrolments").field("semester", "2026-Fall").attach("file", Buffer.from(csv), "e.csv");
    expect(preview.status).toBe(201);
    const row = (n: number) => preview.body.rows.find((r: { row: number }) => r.row === n);
    expect(row(2)).toMatchObject({ status: "INVALID", errors: [{ code: "SCHEDULE_CONFLICT", params: { course: b.code, otherCourse: a.code } }] });
    expect(row(3).status).toBe("INVALID");
    expect(row(3).errors[0].code).toBe("SCHEDULE_CONFLICT");
    expect(row(4).status).toBe("VALID");
    const confirm = await admin.post(`/api/imports/${preview.body.batch.id}/confirm`);
    expect(confirm.body).toMatchObject({ savedRows: 1, enrolled: 2 });
    expect(await prisma.enrolment.count({ where: { studentId: existing.id, courseId: b.id } })).toBe(0);
  });
});
