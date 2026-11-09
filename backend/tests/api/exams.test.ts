/** Exam builder (4.4) and scheduling with conflict blocking (4.5). */
import { describe, expect, it } from "vitest";
import { addQuestions, createCourse, createUser, enrol, loginAs, prisma, uid, userAgent } from "./helpers.ts";

const inDays = (d: number, hour = 9) => {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + d);
  t.setUTCHours(hour, 0, 0, 0);
  return t;
};

async function examSetup() {
  const [lecturer, agent] = await userAgent("LECTURER");
  const course = await createCourse(lecturer.id);
  await addQuestions(agent, course.id, 6, { type: "MCQ", difficulty: "EASY", marks: 1 });
  await addQuestions(agent, course.id, 3, { type: "ESSAY", difficulty: "HARD", marks: 10 });
  return { lecturer, agent, course };
}

describe("exam builder", () => {
  it("refuses rules the question bank cannot fill, and reports each shortage", async () => {
    const { agent, course } = await examSetup();
    const res = await agent.post("/api/exams").send({
      examType: "MIDTERM",
      courseId: course.id,
      title: "Midterm",
      rules: [
        { questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 10 },
        { questionType: "ESSAY", difficulty: "HARD", marksPerQuestion: 10, questionCount: 2 },
        { questionType: "MCQ", difficulty: "MEDIUM", marksPerQuestion: 2, questionCount: 1 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("EXAM_NOT_ENOUGH_QUESTIONS");
    expect(res.body.error.details.rules).toEqual([
      { position: 1, required: 10, available: 6 },
      { position: 3, required: 1, available: 0 },
    ]);
    expect(await prisma.exam.count({ where: { courseId: course.id } })).toBe(0);
  });

  it("builds, previews (without locking) and publishes an exam; rules are then fixed", async () => {
    const { agent, course } = await examSetup();
    const created = await agent.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: "Quiz", instructions: "Answer all", feeAmount: 0 });
    expect(created.status).toBe(201);
    const id = created.body.exam.id;
    expect((await agent.post(`/api/exams/${id}/publish`)).body.error.code).toBe("EXAM_HAS_NO_RULES");

    const rules = await agent.put(`/api/exams/${id}/rules`).send({
      rules: [
        { questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 4 },
        { questionType: "ESSAY", difficulty: "HARD", marksPerQuestion: 10, questionCount: 1 },
      ],
    });
    expect(rules.status).toBe(200);
    expect(rules.body.exam).toMatchObject({ totalQuestions: 5, totalMarks: 14 });
    expect(rules.body.exam.rules.map((r: any) => r.available)).toEqual([6, 3]);

    const dupRule = await agent.put(`/api/exams/${id}/rules`).send({
      rules: [
        { questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 1 },
        { questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 2 },
      ],
    });
    expect(dupRule.body.error.code).toBe("RULE_DUPLICATE");

    const preview = await agent.get(`/api/exams/${id}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.questions).toHaveLength(5);
    expect(preview.body.totalMarks).toBe(14);
    expect(preview.body.questions.find((q: any) => q.type === "MCQ").options.filter((o: any) => o.isCorrect)).toHaveLength(1);
    expect(await prisma.questionVersion.count({ where: { question: { courseId: course.id }, isLocked: true } })).toBe(0);

    const published = await agent.post(`/api/exams/${id}/publish`);
    expect(published.body.exam.status).toBe("PUBLISHED");
    const locked = await agent.put(`/api/exams/${id}/rules`).send({ rules: [{ questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 1 }] });
    expect(locked.status).toBe(409);
    expect((await agent.patch(`/api/exams/${id}`).send({ feeAmount: 5 })).body.error.code).toBe("EXAM_PUBLISHED_LOCKED");
    expect((await agent.patch(`/api/exams/${id}`).send({ allowAnswerReview: true })).status).toBe(200);
  });

  it("checks the fee currency and the second grader", async () => {
    const { agent, course, lecturer } = await examSetup();
    expect((await agent.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: "X", feeAmount: 5, feeCurrency: "EUR" })).body.error.code).toBe("CURRENCY_NOT_SUPPORTED");
    expect((await agent.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: "X", secondGraderId: lecturer.id })).body.error.code).toBe("SECOND_GRADER_IS_LECTURER");
    const second = await createUser("LECTURER");
    const ok = await agent.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: "Paid", feeAmount: 5, feeCurrency: "USD", secondGraderId: second.id });
    expect(ok.status).toBe(201);
    expect(ok.body.exam).toMatchObject({ feeAmount: 5, feeCurrency: "USD", secondGrader: { id: second.id } });
  });

  it("hides other lecturers' exams", async () => {
    const { agent, course } = await examSetup();
    const created = await agent.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: "Private" });
    const [, other] = await userAgent("LECTURER");
    expect((await other.get(`/api/exams/${created.body.exam.id}`)).status).toBe(404);
    expect((await other.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: "Steal" })).status).toBe(404);
    const [, admin] = await userAgent("ADMIN");
    expect((await admin.get(`/api/exams/${created.body.exam.id}`)).status).toBe(200);
    expect((await admin.put(`/api/exams/${created.body.exam.id}/rules`).send({ rules: [{ questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 1 }] })).status).toBe(403);
  });
});

/** A published exam with one rule, for scheduling tests. */
async function publishedExam(agent: Awaited<ReturnType<typeof examSetup>>["agent"], courseId: string, title = "Exam") {
  const e = await agent.post("/api/exams").send({ examType: "QUIZ", courseId, title, rules: [{ questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 2 }] });
  await agent.post(`/api/exams/${e.body.exam.id}/publish`);
  return e.body.exam.id as string;
}

describe("scheduling", () => {
  it("validates requests, approves them and notifies the enrolled students", async () => {
    const { agent, course } = await examSetup();
    const [, admin] = await userAgent("ADMIN");
    const students = [await createUser("STUDENT"), await createUser("STUDENT", { preferredLanguage: "en" })];
    await enrol(course.id, ...students.map((s) => s.id));
    const invigilator = await createUser("INVIGILATOR");
    const room = await prisma.room.create({ data: { name: `Room ${uid()}`, building: "Main", networkRanges: [], capacity: 40 } });
    const examId = await publishedExam(agent, course.id);

    // The duration is the window length; a window under 5 minutes is refused.
    const tooShort = await agent.post(`/api/exams/${examId}/schedules`).send({ windowStart: inDays(3, 6), windowEnd: new Date(new Date(inDays(3, 6)).getTime() + 3 * 60_000).toISOString() });
    expect(tooShort.body.error.code).toBe("WINDOW_LENGTH_INVALID");
    const past = await agent.post(`/api/exams/${examId}/schedules`).send({ windowStart: inDays(-1, 6), windowEnd: inDays(-1, 8), durationMinutes: 60 });
    expect(past.body.error.code).toBe("WINDOW_IN_PAST");

    const req = await agent.post(`/api/exams/${examId}/schedules`).send({ windowStart: inDays(3, 6), windowEnd: inDays(3, 8), durationMinutes: 60, roomIds: [room.id], invigilatorIds: [invigilator.id] });
    expect(req.status).toBe(201);
    expect(req.body.schedule.status).toBe("REQUESTED");
    expect(req.body.schedule.durationMinutes).toBe(120); // 06:00-08:00, whatever was sent
    expect((await agent.post(`/api/exams/${examId}/schedules`).send({ windowStart: inDays(4, 6), windowEnd: inDays(4, 8), durationMinutes: 60 })).body.error.code).toBe("SCHEDULE_ALREADY_REQUESTED");
    expect((await agent.post(`/api/schedules/${req.body.schedule.id}/approve`)).status).toBe(403);

    const approved = await admin.post(`/api/schedules/${req.body.schedule.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.schedule.status).toBe("APPROVED");
    const sms = await prisma.smsOutbox.findMany({ where: { relatedId: req.body.schedule.id } });
    expect(sms).toHaveLength(2);
    expect(sms.find((m) => m.recipientId === students[1].id)!.body).toMatch(/^\[DEMO\] The C\w+ exam takes place on/);
    expect(sms.find((m) => m.recipientId === students[0].id)!.body).toMatch(/^\[DEMO\] Imtixaanka/);
    expect(await prisma.notification.count({ where: { userId: students[0].id, templateKey: "SCHEDULE_APPROVED" } })).toBe(1);

    // The invigilator sees the approved session.
    const inv = await loginAs(invigilator);
    expect((await inv.get("/api/schedules")).body.items.map((s: any) => s.id)).toContain(req.body.schedule.id);
  });

  it("blocks approval when a shared student, a room or an invigilator would have overlapping exams", async () => {
    const [, admin] = await userAgent("ADMIN");
    const a = await examSetup();
    const b = await examSetup();
    const shared = await createUser("STUDENT");
    await enrol(a.course.id, shared.id);
    await enrol(b.course.id, shared.id);

    const examA = await publishedExam(a.agent, a.course.id, "Exam A");
    const examB = await publishedExam(b.agent, b.course.id, "Exam B");
    const sA = await a.agent.post(`/api/exams/${examA}/schedules`).send({ windowStart: inDays(5, 6), windowEnd: inDays(5, 8), durationMinutes: 60 });
    const sB = await b.agent.post(`/api/exams/${examB}/schedules`).send({ windowStart: inDays(5, 7), windowEnd: inDays(5, 9), durationMinutes: 60 });
    expect((await admin.post(`/api/schedules/${sA.body.schedule.id}/approve`)).status).toBe(200);
    const clash = await admin.post(`/api/schedules/${sB.body.schedule.id}/approve`);
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("SCHEDULE_CONFLICT");
    expect(clash.body.error.details.conflicts).toEqual([{ type: "STUDENT", scheduleId: sA.body.schedule.id, examTitle: "Exam A", count: 1 }]);

    // Rejecting needs a reason; the lecturer can then request a time that does not overlap.
    expect((await admin.post(`/api/schedules/${sB.body.schedule.id}/reject`).send({})).status).toBe(400);
    expect((await admin.post(`/api/schedules/${sB.body.schedule.id}/reject`).send({ reason: "Clash with Exam A" })).body.schedule.status).toBe("REJECTED");
    const later = await b.agent.post(`/api/exams/${examB}/schedules`).send({ windowStart: inDays(5, 8), windowEnd: inDays(5, 10), durationMinutes: 60 });
    expect((await admin.post(`/api/schedules/${later.body.schedule.id}/approve`)).status).toBe(200);

    // Room clash between exams without shared students.
    const c = await examSetup();
    const d = await examSetup();
    const room = await prisma.room.create({ data: { name: `Hall ${uid()}`, building: "Main", networkRanges: [], capacity: 500 } });
    const examC = await publishedExam(c.agent, c.course.id, "Exam C");
    const examD = await publishedExam(d.agent, d.course.id, "Exam D");
    const sC = await c.agent.post(`/api/exams/${examC}/schedules`).send({ windowStart: inDays(6, 6), windowEnd: inDays(6, 8), durationMinutes: 60, roomIds: [room.id] });
    const sD = await d.agent.post(`/api/exams/${examD}/schedules`).send({ windowStart: inDays(6, 7), windowEnd: inDays(6, 8), durationMinutes: 60, roomIds: [room.id] });
    await admin.post(`/api/schedules/${sC.body.schedule.id}/approve`);
    const roomClash = await admin.post(`/api/schedules/${sD.body.schedule.id}/approve`);
    expect(roomClash.body.error.details.conflicts[0]).toMatchObject({ type: "ROOM", examTitle: "Exam C" });
  });

  it("requires the exam to be published before approval", async () => {
    const { agent, course } = await examSetup();
    const [, admin] = await userAgent("ADMIN");
    const draft = await agent.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: "Draft", rules: [{ questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 1 }] });
    const s = await agent.post(`/api/exams/${draft.body.exam.id}/schedules`).send({ windowStart: inDays(7, 6), windowEnd: inDays(7, 8), durationMinutes: 60 });
    expect((await admin.post(`/api/schedules/${s.body.schedule.id}/approve`)).body.error.code).toBe("EXAM_NOT_PUBLISHED");
    expect((await agent.post(`/api/schedules/${s.body.schedule.id}/cancel`)).body.schedule.status).toBe("CANCELLED");
  });
});
