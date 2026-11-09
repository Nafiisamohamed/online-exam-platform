/** Phase 4: semester fees, exam eligibility (Quiz 30%, Midterm 50%, Final 100%), registrar fee status and reminders. */
import { describe, expect, it } from "vitest";
import { openExam } from "./exam-fixtures.ts";
import { prisma, randomUUID, testAcademicYear, userAgent } from "./helpers.ts";

async function pay(agent: any, feeId: string, amount: number) {
  const p = (await agent.post("/api/payments").send({ semesterFeeId: feeId, amount, provider: "EVC_PLUS", phone: "0619876500", idempotencyKey: randomUUID() })).body.payment;
  await agent.post(`/api/payments/${p.id}/confirm`).send({ accept: true });
  expect((await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "1234" })).body.result).toBe("SUCCESS");
}

describe("semester fee management", () => {
  it("lets the registrar set one fee per faculty, year and semester, and change it with history", async () => {
    const [, admin] = await userAgent("ADMIN");
    const year = await testAcademicYear();
    const f = await admin.post("/api/faculties").send({ code: `FF${Date.now().toString(36)}`.slice(0, 18), name: "Demo Faculty (test)" });
    const body = { academicYearId: year.id, facultyId: f.body.faculty.id, semesterNumber: 2, amount: 300 };
    const created = await admin.post("/api/semester-fees").send(body);
    expect(created.status).toBe(201);
    expect(created.body.fee).toMatchObject({ amount: 300, currency: "USD", semesterNumber: 2 });
    expect((await admin.post("/api/semester-fees").send(body)).body.error.code).toBe("FEE_EXISTS");
    expect((await admin.post("/api/semester-fees").send({ ...body, semesterNumber: 3, amount: 0 })).status).toBe(400);
    const changed = await admin.patch(`/api/semester-fees/${created.body.fee.id}`).send({ amount: 290 });
    expect(changed.body.fee.amount).toBe(290);
    const log = await prisma.auditLog.findFirst({ where: { entityId: created.body.fee.id, actionCode: "SEMESTER_FEE_UPDATED" } });
    expect(log?.details).toMatchObject({ previous: { amount: 300 }, now: { amount: 290 } });
    expect((await admin.get("/api/semester-fees").query({ academicYearId: year.id })).body.items.some((x: any) => x.id === created.body.fee.id)).toBe(true);
    const [, lecturer] = await userAgent("LECTURER");
    expect((await lecturer.post("/api/semester-fees").send({ ...body, semesterNumber: 4 })).status).toBe(403);
  });
});

describe("exam eligibility from the semester fee", () => {
  for (const [examType, percent] of [["QUIZ", 30], ["MIDTERM", 50], ["FINAL", 100]] as const) {
    it(`${examType}: needs ${percent}% of the semester fee paid`, async () => {
      const fx = await openExam({ students: 1, semesterFee: 200, examType });
      const agent = fx.studentAgents[0];
      const needed = (200 * percent) / 100;
      const before = await agent.post(`/api/exams/${fx.examId}/attempts`);
      expect(before.body.error).toMatchObject({ code: "FEE_REQUIREMENT_NOT_MET", details: { requiredPercent: percent, requiredAmount: needed, stillToPay: needed } });
      if (needed > 1) {
        await pay(agent, fx.semesterFeeId!, needed - 1); // one dollar short
        expect((await agent.post(`/api/exams/${fx.examId}/attempts`)).body.error.details.stillToPay).toBe(1);
        await pay(agent, fx.semesterFeeId!, 1);
      } else await pay(agent, fx.semesterFeeId!, needed);
      const card = (await agent.get("/api/my/exams")).body.items.find((e: any) => e.id === fx.examId);
      expect(card).toMatchObject({ canStart: true, eligibility: { eligible: true, reason: "PAID_ENOUGH" } });
      expect((await agent.post(`/api/exams/${fx.examId}/attempts`)).status).toBe(201);
    });
  }

  it("does not block a student when no fee is configured, and tells the registrars", async () => {
    const fx = await openExam({ students: 1, semesterFee: 100, examType: "FINAL" });
    // Remove the fee from the picture: move the course to a semester without a fee.
    await prisma.course.update({ where: { id: fx.course.id }, data: { semesterNumber: 7 } });
    await prisma.studentRegistration.create({ data: { studentId: fx.students[0].id, academicYearId: (await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } })).academicYearId!, facultyId: fx.course.facultyId, semesterNumber: 7 } });
    const [admin] = await userAgent("ADMIN");
    const card = (await fx.studentAgents[0].get("/api/my/exams")).body.items.find((e: any) => e.id === fx.examId);
    expect(card.eligibility).toMatchObject({ eligible: true, reason: "NO_FEE" });
    expect((await fx.studentAgents[0].post(`/api/exams/${fx.examId}/attempts`)).status).toBe(201);
    expect(await prisma.notification.count({ where: { userId: admin.id, templateKey: "FEE_NOT_CONFIGURED" } })).toBe(1);
  });

  it("does not block older courses without an academic year, nor unregistered students", async () => {
    const fx = await openExam({ students: 1, examType: "FINAL" });
    const card = (await fx.studentAgents[0].get("/api/my/exams")).body.items.find((e: any) => e.id === fx.examId);
    expect(card.eligibility).toMatchObject({ eligible: true, reason: "NO_OFFERING" });
    expect((await fx.studentAgents[0].post(`/api/exams/${fx.examId}/attempts`)).status).toBe(201);
  });
});

describe("registrar fee status and reminders", () => {
  it("lists paid, partly paid and unpaid students, and reminds those who owe", async () => {
    const fx = await openExam({ students: 3, semesterFee: 100 });
    const [, admin] = await userAgent("ADMIN");
    await pay(fx.studentAgents[0], fx.semesterFeeId!, 100);
    await pay(fx.studentAgents[1], fx.semesterFeeId!, 40);
    const yearId = (await prisma.semesterFee.findUniqueOrThrow({ where: { id: fx.semesterFeeId! } })).academicYearId;
    const q = { academicYearId: yearId, facultyId: fx.course.facultyId, semesterNumber: 1 };
    const all = await admin.get("/api/fee-status").query(q);
    expect(all.body.counts).toMatchObject({ PAID: 1, PARTIAL: 1, UNPAID: 1 });
    const byStudent = Object.fromEntries(all.body.items.map((r: any) => [r.student.id, r]));
    expect(byStudent[fx.students[1].id]).toMatchObject({ status: "PARTIAL", paid: 40, outstanding: 60 });
    expect((await admin.get("/api/fee-status").query({ ...q, status: "UNPAID" })).body.items.map((r: any) => r.student.id)).toEqual([fx.students[2].id]);
    const reminded = await admin.post("/api/fee-reminders").send(q);
    expect(reminded.body.reminded).toBe(2);
    expect(await prisma.smsOutbox.count({ where: { templateKey: "PAYMENT_REMINDER", recipientId: { in: [fx.students[1].id, fx.students[2].id] } } })).toBe(2);
    expect(await prisma.smsOutbox.count({ where: { templateKey: "PAYMENT_REMINDER", recipientId: fx.students[0].id } })).toBe(0);
    expect(await prisma.notification.count({ where: { templateKey: "PAYMENT_REMINDER", userId: fx.students[2].id } })).toBe(1);
    expect((await fx.studentAgents[0].get("/api/fee-status").query(q)).status).toBe(403);
  });
});
