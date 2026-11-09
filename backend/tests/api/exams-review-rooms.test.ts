/**
 * Phase 3: exam types, question review, question selection (untick), equivalent random sets,
 * rooms with capacity and the capacity rule at approval.
 */
import { describe, expect, it } from "vitest";
import { openExam } from "./exam-fixtures.ts";
import { addQuestions, createCourse, createUser, enrol, prisma, questionBody, uid, userAgent } from "./helpers.ts";

const inDays = (d: number, hour = 9) => { const t = new Date(); t.setUTCDate(t.getUTCDate() + d); t.setUTCHours(hour, 0, 0, 0); return t.toISOString(); };
const rule = { questionType: "MCQ" as const, difficulty: "EASY" as const, marksPerQuestion: 1, questionCount: 2 };

async function lecturerCourse() {
  const [lecturer, agent] = await userAgent("LECTURER");
  const course = await createCourse(lecturer.id);
  return { lecturer, agent, course };
}

describe("exam types", () => {
  it("are required, shown, and fixed after publishing", async () => {
    const { agent, course } = await lecturerCourse();
    await addQuestions(agent, course.id, 3, { type: "MCQ", difficulty: "EASY", marks: 1 });
    const missing = await agent.post("/api/exams").send({ courseId: course.id, title: "No type" });
    expect(missing.status).toBe(400);
    const e = await agent.post("/api/exams").send({ examType: "MIDTERM", courseId: course.id, title: "Mid", rules: [rule] });
    expect(e.body.exam).toMatchObject({ examType: "MIDTERM", reviewedOnly: false });
    expect((await agent.get("/api/exams")).body.items.find((x: any) => x.id === e.body.exam.id).examType).toBe("MIDTERM");
    expect((await agent.patch(`/api/exams/${e.body.exam.id}`).send({ examType: "FINAL" })).body.exam.examType).toBe("FINAL");
    const pub = await agent.post(`/api/exams/${e.body.exam.id}/publish`);
    expect(pub.body.exam).toMatchObject({ status: "PUBLISHED", reviewedOnly: true });
    expect((await agent.patch(`/api/exams/${e.body.exam.id}`).send({ examType: "QUIZ" })).body.error.code).toBe("EXAM_PUBLISHED_LOCKED");
  });
});

describe("question review", () => {
  it("starts as draft, can be reviewed, and goes back to draft when edited", async () => {
    const { lecturer, agent, course } = await lecturerCourse();
    const [q] = await addQuestions(agent, course.id, 1, { type: "MCQ", difficulty: "EASY", marks: 1, reviewed: false });
    expect((await agent.get(`/api/questions/${q.id}`)).body.question.review.status).toBe("DRAFT");
    const r = await agent.post(`/api/questions/${q.id}/review`);
    expect(r.body.question.review).toMatchObject({ status: "REVIEWED", reviewedBy: { id: lecturer.id } });
    const list = await agent.get(`/api/courses/${course.id}/questions`).query({ review: "REVIEWED" });
    expect(list.body.items.map((x: any) => x.id)).toEqual([q.id]);
    expect(list.body.review).toEqual({ reviewed: 1, total: 1, target: 40 });
    const edited = await agent.put(`/api/questions/${q.id}`).send(questionBody({ type: "MCQ", difficulty: "EASY", marks: 1, text: "Edited text for review" }));
    expect(edited.status).toBe(200);
    expect(edited.body.question.review.status).toBe("DRAFT");
    expect((await agent.get(`/api/courses/${course.id}/questions`).query({ review: "DRAFT" })).body.items).toHaveLength(1);
    // Only the course lecturer reviews.
    const [, other] = await userAgent("LECTURER");
    expect((await other.post(`/api/questions/${q.id}/review`)).status).toBe(404);
    await agent.post(`/api/questions/${q.id}/archive`);
    expect((await agent.post(`/api/questions/${q.id}/review`)).body.error.code).toBe("QUESTION_ARCHIVED");
  });

  it("new exams need reviewed questions; draft questions do not count", async () => {
    const { agent, course } = await lecturerCourse();
    const drafts = await addQuestions(agent, course.id, 2, { type: "MCQ", difficulty: "EASY", marks: 1, reviewed: false });
    const refused = await agent.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: "Needs review", rules: [rule] });
    expect(refused.body.error.code).toBe("EXAM_NOT_ENOUGH_QUESTIONS");
    for (const d of drafts) await agent.post(`/api/questions/${d.id}/review`);
    expect((await agent.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: "Reviewed", rules: [rule] })).status).toBe(201);
  });
});

describe("question selection and random sets", () => {
  it("lets the lecturer untick questions; students get equivalent random sets of ticked, reviewed questions only", async () => {
    const fx = await openExam({
      students: 6,
      rules: [
        { questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 2, poolSize: 6 },
        { questionType: "TRUE_FALSE", difficulty: "MEDIUM", marksPerQuestion: 2, questionCount: 1, poolSize: 3 },
      ],
    });
    // The fixture publishes; make a fresh draft on the same course to test the tick list.
    const draft = await fx.lecturerAgent.post("/api/exams").send({ examType: "QUIZ", courseId: fx.course.id, title: "Tick list", rules: [{ questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 2 }] });
    const pool = await fx.lecturerAgent.get(`/api/exams/${draft.body.exam.id}/question-pool`);
    expect(pool.body.rules[0].questions).toHaveLength(6);
    expect(pool.body.rules[0].questions.every((q: any) => q.included && q.text)).toBe(true);
    const ids = pool.body.rules[0].questions.map((q: any) => q.questionId);
    const tooMany = await fx.lecturerAgent.put(`/api/exams/${draft.body.exam.id}/excluded-questions`).send({ questionIds: ids.slice(0, 5) });
    expect(tooMany.body.error.code).toBe("EXAM_NOT_ENOUGH_QUESTIONS");
    const ok = await fx.lecturerAgent.put(`/api/exams/${draft.body.exam.id}/excluded-questions`).send({ questionIds: ids.slice(0, 2) });
    expect(ok.body.exam).toMatchObject({ excludedQuestions: 2 });
    expect(ok.body.exam.rules[0].available).toBe(4);
    const after = await fx.lecturerAgent.get(`/api/exams/${draft.body.exam.id}/question-pool`);
    expect(after.body.rules[0].questions.filter((q: any) => !q.included).map((q: any) => q.questionId).sort()).toEqual(ids.slice(0, 2).sort());
    await fx.lecturerAgent.post(`/api/exams/${draft.body.exam.id}/publish`);
    expect((await fx.lecturerAgent.put(`/api/exams/${draft.body.exam.id}/excluded-questions`).send({ questionIds: [] })).body.error.code).toBe("EXAM_PUBLISHED_LOCKED");

    // Unticked questions of the published fixture exam: tick list is per exam, so untick on the fixture via the database
    // is not possible after publishing; instead check the fixture's draws below (reviewed only, equivalent sets).
    const unreviewedLater = await addQuestions(fx.lecturerAgent, fx.course.id, 4, { type: "MCQ", difficulty: "EASY", marks: 1, reviewed: false });
    const draws: { versions: string[]; dist: string; marks: number }[] = [];
    for (const agent of fx.studentAgents) {
      const s = await agent.post(`/api/exams/${fx.examId}/attempts`);
      expect(s.status).toBe(201);
      const qs = await prisma.attemptQuestion.findMany({ where: { attemptId: s.body.attempt.id }, include: { questionVersion: true } });
      const dist = qs.map((q) => `${q.questionVersion.type}/${q.questionVersion.difficulty}/${Number(q.marks)}`).sort().join(",");
      draws.push({ versions: qs.map((q) => q.questionVersionId), dist, marks: qs.reduce((t, q) => t + Number(q.marks), 0) });
    }
    // Same distribution and total marks for everyone; sets differ between students.
    expect(new Set(draws.map((d) => d.dist)).size).toBe(1);
    expect(draws[0].dist).toBe("MCQ/EASY/1,MCQ/EASY/1,TRUE_FALSE/MEDIUM/2");
    expect(new Set(draws.map((d) => d.marks))).toEqual(new Set([4]));
    expect(new Set(draws.map((d) => d.versions.slice().sort().join())).size).toBeGreaterThan(1);
    // Draft questions added after publishing are never drawn (the exam draws reviewed questions only).
    const draftVersions = new Set((await prisma.question.findMany({ where: { id: { in: unreviewedLater.map((q) => q.id) } } })).map((q) => q.currentVersionId));
    expect(draws.flatMap((d) => d.versions).some((v) => draftVersions.has(v))).toBe(false);
  });

  it("keeps exams published before review (reviewed_only = false) drawing from their existing pools", async () => {
    const fx = await openExam({ students: 1, rules: [{ questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 2, poolSize: 2 }] });
    // Simulate an exam published before Phase 3 whose questions were never reviewed.
    await prisma.exam.update({ where: { id: fx.examId }, data: { reviewedOnly: false } });
    await prisma.question.updateMany({ where: { courseId: fx.course.id }, data: { reviewedVersionId: null, reviewedById: null, reviewedAt: null } });
    const s = await fx.studentAgents[0].post(`/api/exams/${fx.examId}/attempts`);
    expect(s.status).toBe(201);
    expect(s.body.attempt.questions).toHaveLength(2);
  });
});

describe("rooms and capacity", () => {
  async function schedulable(students: number) {
    const [lecturer, agent] = await userAgent("LECTURER");
    const course = await createCourse(lecturer.id);
    await addQuestions(agent, course.id, 2, { type: "MCQ", difficulty: "EASY", marks: 1 });
    const e = await agent.post("/api/exams").send({ examType: "QUIZ", courseId: course.id, title: `Cap ${uid()}`, rules: [rule] });
    await agent.post(`/api/exams/${e.body.exam.id}/publish`);
    const ss = await Promise.all(Array.from({ length: students }, () => createUser("STUDENT")));
    await enrol(course.id, ...ss.map((s) => s.id));
    return { agent, examId: e.body.exam.id };
  }

  it("lets the registrar manage rooms; inactive rooms cannot be chosen; capacity is checked at approval", async () => {
    const [, admin] = await userAgent("ADMIN");
    const mk = (body: object) => admin.post("/api/rooms").send({ name: `Demo room ${uid()}`, building: "Demo building (test)", ...body });
    const small = (await mk({ capacity: 2 })).body.room;
    const medium = (await mk({ capacity: 3 })).body.room;
    const unknown = (await mk({})).body.room;
    expect(unknown).toMatchObject({ capacity: null, isActive: true });
    const off = (await mk({ capacity: 50, isActive: false })).body.room;
    expect((await admin.get("/api/rooms").query({ active: "true" })).body.items.some((r: any) => r.id === off.id)).toBe(false);
    expect((await admin.patch(`/api/rooms/${small.id}`).send({ capacity: 0 })).status).toBe(400);
    const [, lec] = await userAgent("LECTURER");
    expect((await lec.post("/api/rooms").send({ name: "X", building: "Y" })).status).toBe(403);

    const a = await schedulable(4);
    expect((await a.agent.post(`/api/exams/${a.examId}/schedules`).send({ windowStart: inDays(9, 6), windowEnd: inDays(9, 8), roomIds: [off.id] })).body.error.code).toBe("ROOM_INACTIVE");
    const sA = await a.agent.post(`/api/exams/${a.examId}/schedules`).send({ windowStart: inDays(9, 6), windowEnd: inDays(9, 8), roomIds: [small.id] });
    expect(sA.body.schedule.durationMinutes).toBe(120);
    const insufficient = await admin.post(`/api/schedules/${sA.body.schedule.id}/approve`);
    expect(insufficient.body.error).toMatchObject({ code: "ROOM_CAPACITY_INSUFFICIENT", details: { capacity: 2, students: 4 } });

    const b = await schedulable(4); // two rooms: 2 + 3 = 5 seats >= 4 students
    const sB = await b.agent.post(`/api/exams/${b.examId}/schedules`).send({ windowStart: inDays(10, 6), windowEnd: inDays(10, 8), roomIds: [small.id, medium.id] });
    expect((await admin.post(`/api/schedules/${sB.body.schedule.id}/approve`)).body.schedule.status).toBe("APPROVED");

    const c = await schedulable(1);
    const sC = await c.agent.post(`/api/exams/${c.examId}/schedules`).send({ windowStart: inDays(11, 6), windowEnd: inDays(11, 8), roomIds: [unknown.id, small.id] });
    const warn = await admin.post(`/api/schedules/${sC.body.schedule.id}/approve`);
    expect(warn.body.error).toMatchObject({ code: "ROOM_CAPACITY_UNKNOWN", details: { students: 1 } });
    expect((await admin.post(`/api/schedules/${sC.body.schedule.id}/approve`).send({ confirmUnknownCapacity: true })).body.schedule.status).toBe("APPROVED");
    const log = await prisma.auditLog.findFirst({ where: { entityId: sC.body.schedule.id, actionCode: "SCHEDULE_APPROVED" } });
    expect(log?.details).toMatchObject({ capacity: { unknownConfirmed: [unknown.name] } });

    const d = await schedulable(30); // no rooms: no capacity check
    const sD = await d.agent.post(`/api/exams/${d.examId}/schedules`).send({ windowStart: inDays(12, 6), windowEnd: inDays(12, 8) });
    expect((await admin.post(`/api/schedules/${sD.body.schedule.id}/approve`)).body.schedule.status).toBe("APPROVED");
  });
});
