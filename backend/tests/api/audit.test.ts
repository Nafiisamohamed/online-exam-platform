/**
 * Pre-frontend audit: extra evidence for the core challenge and for security
 * rules that the feature tests do not cover directly.
 */
import { describe, expect, it } from "vitest";
import { answerKey, openExam, setDeadline } from "./exam-fixtures.ts";
import { addQuestions, app, createCourse, createUser, enrol, loginAs, PASSWORD, prisma, questionBody, request, userAgent } from "./helpers.ts";

describe("core challenge: extra evidence", () => {
  it("respects topic rules, never repeats a question in one attempt, and shuffles only within each question's own options", async () => {
    const [lecturer, lec] = await userAgent("LECTURER");
    const course = await createCourse(lecturer.id);
    await addQuestions(lec, course.id, 6, { type: "MCQ", difficulty: "MEDIUM", marks: 2, topic: "Joins" });
    await addQuestions(lec, course.id, 6, { type: "MCQ", difficulty: "MEDIUM", marks: 2, topic: "Indexes" });
    const topics = await lec.get(`/api/courses/${course.id}/topics`);
    const joins = topics.body.items.find((t: any) => t.name === "Joins").id;
    const exam = await lec.post("/api/exams").send({ courseId: course.id, title: "Topic exam", rules: [{ questionType: "MCQ", difficulty: "MEDIUM", marksPerQuestion: 2, questionCount: 3, topicIds: [joins] }] });
    expect(exam.body.exam.rules[0]).toMatchObject({ available: 6, topics: [{ id: joins, name: "Joins" }] });
    await lec.post(`/api/exams/${exam.body.exam.id}/publish`);
    const admin = await createUser("ADMIN");
    await prisma.examSchedule.create({ data: { examId: exam.body.exam.id, requestedById: lecturer.id, decidedById: admin.id, decidedAt: new Date(), status: "APPROVED", windowStart: new Date(Date.now() - 60_000), windowEnd: new Date(Date.now() + 3_600_000), durationMinutes: 30 } });
    const students = [await createUser("STUDENT"), await createUser("STUDENT")];
    await enrol(course.id, ...students.map((s) => s.id));

    const attempts: any[] = [];
    for (const s of students) attempts.push((await (await loginAs(s)).post(`/api/exams/${exam.body.exam.id}/attempts`)).body.attempt);
    for (const a of attempts) {
      const rows = await prisma.attemptQuestion.findMany({ where: { attemptId: a.id }, include: { questionVersion: { include: { topic: true, options: true } } } });
      expect(rows.every((r) => r.questionVersion.topic.name === "Joins")).toBe(true);
      expect(new Set(rows.map((r) => r.questionVersionId)).size).toBe(rows.length);
      expect(rows.map((r) => r.position).sort()).toEqual([1, 2, 3]);
      for (const r of rows) expect([...r.optionOrder].sort()).toEqual(r.questionVersion.options.map((o) => o.id).sort());
    }
    // Two students, pool of 6, rule of 3: least-used-first gives disjoint sets.
    const ids = (a: any) => a.questions.map((q: any) => q.text).sort();
    expect(ids(attempts[0]).filter((t: string) => ids(attempts[1]).includes(t))).toHaveLength(0);
  });

  it("keeps the attempt frozen when the lecturer edits a question during the exam", async () => {
    const fx = await openExam({ students: 1 });
    const t = (await fx.studentAgents[0].post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    const first = t.questions.find((q: any) => q.type === "MCQ");
    const aq = await prisma.attemptQuestion.findUniqueOrThrow({ where: { id: first.id }, include: { questionVersion: true } });
    const edit = await fx.lecturerAgent.put(`/api/questions/${aq.questionVersion.questionId}`).send({ ...questionBody({ type: "MCQ", marks: 1 }), text: "Edited during the exam?" });
    expect(edit.body.newVersionCreated).toBe(true);
    const reload = await fx.studentAgents[0].get(`/api/attempts/${t.id}`);
    const same = reload.body.attempt.questions.find((q: any) => q.id === first.id);
    expect(same.text).toBe(first.text);
    expect(same.options.map((o: any) => o.id)).toEqual(first.options.map((o: any) => o.id));
  });

  it("ignores any time sent by the browser: client clocks cannot move the deadline", async () => {
    const fx = await openExam({ students: 1 });
    const agent = fx.studentAgents[0];
    const t = (await agent.post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    const mcq = (await answerKey(t.id)).find((k) => k.type === "MCQ")!;
    const fakeFuture = new Date(Date.now() + 86_400_000).toISOString();
    const fakePast = "2000-01-01T00:00:00.000Z";
    // Before the deadline: client-supplied times are dropped; the server records its own time.
    const ok = await agent
      .put(`/api/attempts/${t.id}/questions/${mcq.attemptQuestionId}/answer`)
      .set("Date", new Date(0).toUTCString())
      .send({ selectedOptionId: mcq.correctOptionId, savedAt: fakePast, clientTime: fakePast, deadline: fakeFuture });
    expect(ok.status).toBe(200);
    expect(Math.abs(new Date(ok.body.savedAt).getTime() - Date.now())).toBeLessThan(10_000);
    const row = await prisma.examAttempt.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.deadline.toISOString()).toBe(t.deadline);

    // After the deadline: a browser claiming an earlier time is still refused.
    await setDeadline(t.id, new Date(Date.now() - 1000));
    const late = await agent
      .put(`/api/attempts/${t.id}/questions/${mcq.attemptQuestionId}/answer`)
      .set("Date", new Date(Date.now() - 3_600_000).toUTCString())
      .send({ selectedOptionId: mcq.wrongOptionId, clientTime: new Date(Date.now() - 3_600_000).toISOString() });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("ATTEMPT_DEADLINE_PASSED");
    const answer = await prisma.answer.findUniqueOrThrow({ where: { attemptQuestionId: mcq.attemptQuestionId } });
    expect(answer.selectedOptionId).toBe(mcq.correctOptionId);
  });

  it("never resets the timer: starting again or reloading keeps the original deadline", async () => {
    const fx = await openExam({ students: 1 });
    const agent = fx.studentAgents[0];
    const first = (await agent.post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    await new Promise((r) => setTimeout(r, 1200));
    const again = (await agent.post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    const reload = (await agent.get(`/api/attempts/${first.id}`)).body.attempt;
    const beat = (await agent.post(`/api/attempts/${first.id}/heartbeat`)).body;
    for (const v of [again, reload, beat]) expect(v.deadline).toBe(first.deadline);
    expect(again.startedAt).toBe(first.startedAt);
    expect(reload.remainingSeconds).toBeLessThan(first.remainingSeconds);
    expect(await prisma.examAttempt.count({ where: { examId: fx.examId } })).toBe(1);
  });
});

describe("permissions and data exposure", () => {
  it("does not let an invigilator perform admin, lecturer or grading actions", async () => {
    const fx = await openExam({ students: 1 });
    const inv = await loginAs(fx.invigilators[0]);
    const attempt = (await fx.studentAgents[0].post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    await fx.studentAgents[0].post(`/api/attempts/${attempt.id}/submit`);
    const answer = await prisma.answer.findFirstOrThrow({ where: { attemptId: attempt.id } });
    const forbidden = [
      inv.post("/api/users").send({ role: "ADMIN", fullName: "X", phone: "+252615000000", email: "x@test.local" }),
      inv.post("/api/exams").send({ courseId: fx.course.id, title: "X" }),
      inv.post(`/api/exams/${fx.examId}/publish`),
      inv.put(`/api/grading/answers/${answer.id}/marks`).send({ marks: 1 }),
      inv.post(`/api/exams/${fx.examId}/results/publish`).send({}),
      inv.post(`/api/schedules/${fx.schedule.id}/approve`),
      inv.get(`/api/exams/${fx.examId}/grades.csv`),
      inv.get(`/api/courses/${fx.course.id}/questions`),
      inv.get("/api/audit-logs"),
    ];
    for (const res of await Promise.all(forbidden)) expect(res.status).toBe(403);
  });

  it("never returns password hashes", async () => {
    const [, admin] = await userAgent("ADMIN");
    const user = await createUser("LECTURER");
    const responses = await Promise.all([
      admin.get("/api/users?pageSize=200"),
      admin.get(`/api/users/${user.id}`),
      admin.get("/api/staff?role=LECTURER"),
      admin.get("/api/auth/me"),
      admin.get("/api/courses"),
      admin.get("/api/audit-logs?pageSize=200"),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
    }
  });

  it("ignores fields the client is not allowed to set (mass assignment)", async () => {
    const [, admin] = await userAgent("ADMIN");
    const user = await createUser("STUDENT");
    const res = await admin.patch(`/api/users/${user.id}`).send({ fullName: "Renamed", role: "ADMIN", roleId: "x", passwordHash: "hacked", tokenVersion: 0, email: "evil@test.local" });
    expect(res.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { role: true } });
    expect(after).toMatchObject({ fullName: "Renamed", email: null });
    expect(after.role.name).toBe("STUDENT");
    expect(after.passwordHash).toBe(user.passwordHash);
  });

  it("rejects invalid ids and unknown routes with clean errors", async () => {
    const [, admin] = await userAgent("ADMIN");
    const bad = await admin.get("/api/users/not-a-uuid");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    const injection = await admin.get("/api/users").query({ search: "'; DROP TABLE users; --" });
    expect(injection.status).toBe(200);
    expect(await prisma.user.count()).toBeGreaterThan(0);
    const missing = await admin.get("/api/nothing-here");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("ROUTE_NOT_FOUND");
    const json = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{bad json");
    expect(json.status).toBe(400);
    expect(json.body.error.code).toBe("INVALID_JSON");
  });

  it("sets security headers and only allows the configured frontend origin", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://localhost:3000");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    const evil = await request(app).get("/api/health").set("Origin", "http://evil.example");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rate-limits repeated login attempts", async () => {
    const user = await createUser("STUDENT");
    process.env.RATE_LIMITS_IN_TESTS = "1";
    try {
      const statuses = [];
      for (let i = 0; i < 11; i++) statuses.push((await request(app).post("/api/auth/login").send({ identifier: user.studentNumber, password: `wrong-${i}` })).status);
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
      // The correct password is blocked too until the window passes.
      expect((await request(app).post("/api/auth/login").send({ identifier: user.studentNumber, password: PASSWORD })).status).toBe(429);
    } finally {
      delete process.env.RATE_LIMITS_IN_TESTS;
    }
  });
});
