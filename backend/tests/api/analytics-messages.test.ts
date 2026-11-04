/** Analytics from real queries (4.13, 6.7), notifications, SMS outbox and audit log (7, 6.2). */
import { describe, expect, it } from "vitest";
import { deliverQueuedSms } from "../../src/services/messaging.ts";
import { answerKey, openExam } from "./exam-fixtures.ts";
import { createUser, loginAs, prisma, userAgent } from "./helpers.ts";

describe("analytics", () => {
  it("calculates exam statistics and per-question analytics from submitted attempts", async () => {
    const fx = await openExam({
      students: 6,
      rules: [{ questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 2, poolSize: 2 }],
    });
    // Student i answers i of... the first 3 students get both right, the rest both wrong.
    for (const [i, agent] of fx.studentAgents.entries()) {
      const t = (await agent.post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
      for (const k of await answerKey(t.id)) {
        await agent.put(`/api/attempts/${t.id}/questions/${k.attemptQuestionId}/answer`).send({ selectedOptionId: i < 3 ? k.correctOptionId : k.wrongOptionId });
      }
      await agent.post(`/api/attempts/${t.id}/submit`);
    }
    const res = await fx.lecturerAgent.get(`/api/exams/${fx.examId}/analytics`);
    expect(res.status).toBe(200);
    expect(res.body.statistics).toMatchObject({ students: 6, average: 50, highest: 100, lowest: 0 });
    expect(res.body.statistics.distribution[9].count).toBe(3);
    expect(res.body.statistics.distribution[0].count).toBe(3);
    expect(res.body.questions).toHaveLength(2);
    for (const q of res.body.questions) expect(q).toMatchObject({ answered: 6, difficultyIndex: 50, discrimination: 1, flags: [] });

    const [, other] = await userAgent("LECTURER");
    expect((await other.get(`/api/exams/${fx.examId}/analytics`)).status).toBe(404);
    expect((await fx.studentAgents[0].get(`/api/exams/${fx.examId}/analytics`)).status).toBe(403);
  });

  it("serves dashboard chart data scoped to the user", async () => {
    const fx = await openExam({ students: 1 });
    const t = (await fx.studentAgents[0].post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    await fx.studentAgents[0].post(`/api/attempts/${t.id}/submit`);
    const lec = await fx.lecturerAgent.get("/api/analytics/dashboard");
    expect(lec.body.scope).toBe("OWN_COURSES");
    expect(lec.body.averageScoreByCourse).toEqual([expect.objectContaining({ courseId: fx.course.id, attempts: 1 })]);
    expect(lec.body.scoreDistribution).toHaveLength(10);
    expect(lec.body.paymentsByProvider).toBeUndefined();
    const [, admin] = await userAgent("ADMIN");
    const all = await admin.get("/api/analytics/dashboard");
    expect(all.body.scope).toBe("ALL");
    expect(all.body.averageScoreByCourse.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(all.body.paymentsByProvider)).toBe(true);
    expect(all.body.usersByRole.find((r: any) => r.role === "STUDENT").count).toBeGreaterThanOrEqual(1);
  });
});

describe("notifications, SMS outbox and audit log", () => {
  it("translates notifications into the reader's current language", async () => {
    const student = await createUser("STUDENT");
    await prisma.notification.create({ data: { userId: student.id, templateKey: "RESULTS_PUBLISHED", params: { course: "CS201", exam: "Midterm" } } });
    const agent = await loginAs(student);
    const so = await agent.get("/api/notifications");
    expect(so.body.items[0]).toMatchObject({ title: "Natiijada waa la daabacay", body: "Natiijada Midterm waa diyaar." });
    await agent.patch("/api/auth/language").send({ language: "en" });
    const en = await agent.get("/api/notifications");
    expect(en.body.items[0].title).toBe("Results published");
    expect((await agent.get("/api/notifications/unread-count")).body.unread).toBe(1);
    expect((await agent.post(`/api/notifications/${en.body.items[0].id}/read`)).status).toBe(200);
    expect((await agent.get("/api/notifications/unread-count")).body.unread).toBe(0);
    const [, other] = await userAgent("STUDENT");
    expect((await other.post(`/api/notifications/${en.body.items[0].id}/read`)).status).toBe(404);
  });

  it("moves simulated SMS through QUEUED, SENT and DELIVERED, and fails invalid numbers", async () => {
    const [, admin] = await userAgent("ADMIN");
    const good = await admin.post("/api/users").send({ role: "STUDENT", fullName: "Sahra Good", phone: "+252615000001", studentNumber: `SMS-G-${Date.now()}` });
    const goodSms = await prisma.smsOutbox.findFirstOrThrow({ where: { recipientId: good.body.user.id } });
    const bad = await createUser("STUDENT", { phone: "+25261" });
    await prisma.smsOutbox.create({ data: { recipientId: bad.id, phone: "+25261", language: "so", templateKey: "RESULTS_PUBLISHED", params: { course: "X" }, body: "[DEMO] test", senderId: "JAAMACADDA-DEMO" } });
    expect(goodSms.status).toBe("QUEUED");
    await deliverQueuedSms();
    expect((await prisma.smsOutbox.findUniqueOrThrow({ where: { id: goodSms.id } })).status).toBe("SENT");
    expect((await prisma.smsOutbox.findFirstOrThrow({ where: { recipientId: bad.id } })).status).toBe("FAILED");
    await prisma.smsOutbox.update({ where: { id: goodSms.id }, data: { sentAt: new Date(Date.now() - 10_000) } });
    await deliverQueuedSms();
    expect((await prisma.smsOutbox.findUniqueOrThrow({ where: { id: goodSms.id } })).status).toBe("DELIVERED");

    const outbox = await admin.get(`/api/sms-outbox?recipientId=${good.body.user.id}`);
    expect(outbox.body).toMatchObject({ total: 1, simulated: true });
    expect(outbox.body.items[0].body.startsWith("[DEMO]")).toBe(true);
    const [, student] = await userAgent("STUDENT");
    expect((await student.get("/api/sms-outbox")).status).toBe(403);
  });

  it("lets only the admin read the audit log", async () => {
    const [adminUser, admin] = await userAgent("ADMIN");
    const res = await admin.get(`/api/audit-logs?actorId=${adminUser.id}&action=LOGIN_SUCCESS`);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ actionCode: "LOGIN_SUCCESS", actor: { id: adminUser.id } });
    expect(res.body.items[0].ipAddress).toBeTruthy();
    const [, lecturer] = await userAgent("LECTURER");
    expect((await lecturer.get("/api/audit-logs")).status).toBe(403);
    // The log is append-only, even for the application's database role.
    await expect(prisma.auditLog.updateMany({ where: { actorId: adminUser.id }, data: { actionCode: "X" } })).rejects.toThrow();
  });
});
