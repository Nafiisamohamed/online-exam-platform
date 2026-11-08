/** Invigilator live view, notes and time extensions (4.9) and Demo 3 (tab switch shows in the live view). */
import { describe, expect, it } from "vitest";
import { answerKey, openExam } from "./exam-fixtures.ts";
import { loginAs, prisma, randomUUID, userAgent } from "./helpers.ts";

describe("invigilator live view", () => {
  it("shows each student's status, answers, tab switches and connection", async () => {
    const fx = await openExam({ students: 3 });
    const inv = await loginAs(fx.invigilators[0]);
    const [a0, a1] = fx.studentAgents;
    const t0 = (await a0.post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    const t1 = (await a1.post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    const key = await answerKey(t0.id);
    await a0.put(`/api/attempts/${t0.id}/questions/${key[0].attemptQuestionId}/answer`).send(key[0].correctOptionId ? { selectedOptionId: key[0].correctOptionId } : { textAnswer: "x" });

    // Demo 3: student 0 switches away for 5 seconds and comes back.
    const ev = randomUUID();
    await a0.post(`/api/attempts/${t0.id}/focus-events`).send({ clientEventId: ev, type: "LOST" });
    await prisma.focusEvent.update({ where: { attemptId_clientEventId: { attemptId: t0.id, clientEventId: ev } }, data: { lostAt: new Date(Date.now() - 5000) } });
    await a0.post(`/api/attempts/${t0.id}/focus-events`).send({ clientEventId: ev, type: "RETURNED" });
    // Student 1 has not been heard from for 45 seconds.
    await prisma.examAttempt.update({ where: { id: t1.id }, data: { lastSeenAt: new Date(Date.now() - 45_000) } });

    const live = await inv.get(`/api/invigilation/sessions/${fx.schedule.id}/live`);
    expect(live.status).toBe(200);
    expect(live.body.summary).toEqual({ total: 3, notStarted: 1, inProgress: 1, disconnected: 1, submitted: 0, terminated: 0 });
    const row = (id: string) => live.body.students.find((s: any) => s.student.id === id);
    expect(row(fx.students[0].id)).toMatchObject({ status: "IN_PROGRESS", answeredCount: 1, totalQuestions: 6, countedFocusLosses: 1, connection: "OK" });
    expect(row(fx.students[1].id)).toMatchObject({ status: "DISCONNECTED", connection: "LOST" });
    expect(row(fx.students[1].id).secondsSinceContact).toBeGreaterThanOrEqual(45);
    expect(row(fx.students[2].id)).toMatchObject({ status: "NOT_STARTED", attemptId: null });
    // The invigilator never receives questions or answers.
    expect(JSON.stringify(live.body)).not.toMatch(/isCorrect|selectedOptionId|textAnswer/);

    const log = await inv.get(`/api/invigilation/attempts/${t0.id}/focus-events`);
    expect(log.body.items).toHaveLength(1);
    expect(log.body.items[0]).toMatchObject({ isCounted: true });
    expect(log.body.items[0].durationMs).toBeGreaterThanOrEqual(5000);
  });

  it("only shows sessions to the invigilators assigned to them", async () => {
    const fx = await openExam({ students: 1 });
    const [, other] = await userAgent("INVIGILATOR");
    expect((await other.get(`/api/invigilation/sessions/${fx.schedule.id}/live`)).status).toBe(404);
    expect((await other.get("/api/invigilation/sessions")).body.items.map((s: any) => s.id)).not.toContain(fx.schedule.id);
    const mine = await loginAs(fx.invigilators[0]);
    expect((await mine.get("/api/invigilation/sessions")).body.items.map((s: any) => s.id)).toContain(fx.schedule.id);
    expect((await fx.studentAgents[0].get(`/api/invigilation/sessions/${fx.schedule.id}/live`)).status).toBe(403);
  });

  it("submits attempts past their deadline before showing the list", async () => {
    const fx = await openExam({ students: 1 });
    const t = (await fx.studentAgents[0].post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    const a = await prisma.examAttempt.findUniqueOrThrow({ where: { id: t.id } });
    await prisma.examAttempt.update({ where: { id: t.id }, data: { startedAt: new Date(Date.now() - 3_600_000), baseDeadline: new Date(Date.now() - 1000), deadline: new Date(Date.now() - 1000 + a.totalExtensionMinutes * 60_000) } });
    const live = await (await loginAs(fx.invigilators[0])).get(`/api/invigilation/sessions/${fx.schedule.id}/live`);
    expect(live.body.students[0]).toMatchObject({ status: "SUBMITTED", submissionType: "AUTO_DEADLINE" });
  });
});

describe("notes and time extensions", () => {
  it("records notes about the session or one student", async () => {
    const fx = await openExam({ students: 1 });
    const inv = await loginAs(fx.invigilators[0]);
    expect((await inv.post(`/api/invigilation/sessions/${fx.schedule.id}/notes`).send({ text: "Power cut in Lab A at 09:20" })).status).toBe(201);
    expect((await inv.post(`/api/invigilation/sessions/${fx.schedule.id}/notes`).send({ text: "Left the room briefly", studentId: fx.students[0].id })).status).toBe(201);
    expect((await inv.post(`/api/invigilation/sessions/${fx.schedule.id}/notes`).send({ text: "  " })).status).toBe(400);
    const notes = await inv.get(`/api/invigilation/sessions/${fx.schedule.id}/notes`);
    expect(notes.body.items).toHaveLength(2);
  });

  it("extends one student by up to 15 minutes in total, with a reason, and moves the deadline", async () => {
    const fx = await openExam({ students: 2 });
    const inv = await loginAs(fx.invigilators[0]);
    const t = (await fx.studentAgents[0].post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    const other = (await fx.studentAgents[1].post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    const before = new Date(t.deadline).getTime();

    expect((await inv.post(`/api/invigilation/attempts/${t.id}/extensions`).send({ minutes: 10 })).status).toBe(400);
    const first = await inv.post(`/api/invigilation/attempts/${t.id}/extensions`).send({ minutes: 10, reason: "Power cut" });
    expect(first.status).toBe(201);
    expect(first.body.totalExtensionMinutes).toBe(10);
    expect(new Date(first.body.deadline).getTime() - before).toBe(10 * 60_000);

    const tooMuch = await inv.post(`/api/invigilation/attempts/${t.id}/extensions`).send({ minutes: 6, reason: "More" });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error).toMatchObject({ code: "EXTENSION_LIMIT_EXCEEDED", details: { remainingMinutes: 5 } });
    expect((await inv.post(`/api/invigilation/attempts/${t.id}/extensions`).send({ minutes: 5, reason: "Still no power" })).body.totalExtensionMinutes).toBe(15);

    // The student sees the new remaining time; the other student is unaffected.
    const view = await fx.studentAgents[0].get(`/api/attempts/${t.id}`);
    expect(view.body.attempt.extensionMinutes).toBe(15);
    expect(view.body.attempt.remainingSeconds).toBeGreaterThan(74 * 60);
    expect((await fx.studentAgents[1].get(`/api/attempts/${other.id}`)).body.attempt.extensionMinutes).toBe(0);
    expect(await prisma.timeExtension.count({ where: { attemptId: t.id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { actionCode: "TIME_EXTENSION_GRANTED", entityId: t.id } })).toBe(2);

    // Only assigned invigilators can extend.
    const [, stranger] = await userAgent("INVIGILATOR");
    expect((await stranger.post(`/api/invigilation/attempts/${other.id}/extensions`).send({ minutes: 1, reason: "x" })).status).toBe(404);
    expect((await fx.lecturerAgent.post(`/api/invigilation/attempts/${other.id}/extensions`).send({ minutes: 1, reason: "x" })).status).toBe(403);
  });

  it("cannot extend an attempt that has already been submitted", async () => {
    const fx = await openExam({ students: 1 });
    const t = (await fx.studentAgents[0].post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    await fx.studentAgents[0].post(`/api/attempts/${t.id}/submit`);
    const res = await (await loginAs(fx.invigilators[0])).post(`/api/invigilation/attempts/${t.id}/extensions`).send({ minutes: 5, reason: "Late" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ATTEMPT_NOT_IN_PROGRESS");
  });
});
