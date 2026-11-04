/** Simulated mobile-money payments for exam fees (section 7, D1, P7). */
import { describe, expect, it } from "vitest";
import { expireDuePayments } from "../../src/modules/payments/payments.service.ts";
import { openExam } from "./exam-fixtures.ts";
import { prisma, randomUUID, userAgent } from "./helpers.ts";

const start = (agent: any, examId: string, extra: object = {}) =>
  agent.post("/api/payments").send({ examId, provider: "EVC_PLUS", phone: "0619876500", idempotencyKey: randomUUID(), ...extra });

describe("simulated payments", () => {
  it("pays with the demo PIN, issues a DEMO receipt and SMS, and unlocks the exam", async () => {
    const fx = await openExam({ students: 1, feeAmount: 5 });
    const agent = fx.studentAgents[0];
    const created = await start(agent, fx.examId);
    expect(created.status).toBe(201);
    const p = created.body.payment;
    expect(p).toMatchObject({ status: "PENDING_CONFIRMATION", amount: 5, currency: "USD", merchantName: "Jaamacadda Demo", phone: "+252619876500", isSimulated: true, pinAttemptsLeft: 3 });
    expect(p.secondsUntilExpiry).toBeGreaterThan(290);

    // A PIN before the Yes step is refused.
    expect((await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "1234" })).body.error.code).toBe("PAYMENT_NOT_CONFIRMED");
    expect((await agent.post(`/api/payments/${p.id}/confirm`).send({ accept: true })).body.payment.status).toBe("PENDING_PIN");
    const wrong = await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "9999" });
    expect(wrong.body).toMatchObject({ result: "WRONG_PIN", payment: { status: "PENDING_PIN", pinAttemptsLeft: 2 } });
    const ok = await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "1234" });
    expect(ok.body.result).toBe("SUCCESS");
    expect(ok.body.payment.receiptNumber).toMatch(/^DEMO-EVC-\d{8}-[A-Z0-9]{6}$/);
    expect(JSON.stringify(ok.body)).not.toMatch(/"pin"/i);

    const sms = await prisma.smsOutbox.findFirstOrThrow({ where: { relatedId: p.id } });
    expect(sms).toMatchObject({ templateKey: "PAYMENT_SUCCESS", phone: "+252619876500" });
    expect(sms.body).toContain(ok.body.payment.receiptNumber);
    expect(sms.body).not.toContain("1234");
    const audits = await prisma.auditLog.findMany({ where: { entityId: p.id } });
    expect(JSON.stringify(audits)).not.toMatch(/"pin"/i);

    const receipt = await agent.get(`/api/payments/${p.id}/receipt.pdf?lang=so`);
    expect(receipt.headers["content-type"]).toBe("application/pdf");
    expect(receipt.body.subarray(0, 4).toString()).toBe("%PDF");

    // Paid: the exam can be started, and a second payment is refused.
    expect((await agent.post(`/api/exams/${fx.examId}/attempts`)).status).toBe(201);
    expect((await start(agent, fx.examId)).body.error.code).toBe("PAYMENT_ALREADY_PAID");
  });

  it("fails after three wrong PINs and allows a new payment afterwards", async () => {
    const fx = await openExam({ students: 1, feeAmount: 5 });
    const agent = fx.studentAgents[0];
    const p = (await start(agent, fx.examId, { provider: "ZAAD" })).body.payment;
    await agent.post(`/api/payments/${p.id}/confirm`).send({ accept: true });
    await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "0000" });
    await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "0000" });
    const third = await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "0000" });
    expect(third.body).toMatchObject({ result: "FAILED", payment: { status: "FAILED", failureReason: "PIN_ATTEMPTS_EXCEEDED", pinAttemptsLeft: 0 } });
    expect((await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "1234" })).body.error.code).toBe("PAYMENT_NOT_AWAITING_PIN");
    expect((await agent.post(`/api/exams/${fx.examId}/attempts`)).status).toBe(402);
    const retry = await start(agent, fx.examId, { provider: "ZAAD" });
    expect(retry.status).toBe(201);
    expect(retry.body.payment.id).not.toBe(p.id);
  });

  it("cancels on No or during PIN entry", async () => {
    const fx = await openExam({ students: 1, feeAmount: 5 });
    const agent = fx.studentAgents[0];
    const a = (await start(agent, fx.examId)).body.payment;
    expect((await agent.post(`/api/payments/${a.id}/confirm`).send({ accept: false })).body.payment.status).toBe("CANCELLED");
    const b = (await start(agent, fx.examId, { provider: "EDAHAB" })).body.payment;
    await agent.post(`/api/payments/${b.id}/confirm`).send({ accept: true });
    expect((await agent.post(`/api/payments/${b.id}/cancel`)).body.payment.status).toBe("CANCELLED");
    expect((await agent.post(`/api/payments/${b.id}/cancel`)).body.error.code).toBe("PAYMENT_NOT_OPEN");
  });

  it("ignores prices from the browser and returns the same payment for repeated requests", async () => {
    const fx = await openExam({ students: 1, feeAmount: 5 });
    const agent = fx.studentAgents[0];
    expect((await start(agent, fx.examId, { amount: 0.01 })).status).toBe(400);
    const key = randomUUID();
    const first = await start(agent, fx.examId, { idempotencyKey: key });
    const resent = await start(agent, fx.examId, { idempotencyKey: key });
    expect(resent.status).toBe(200);
    expect(resent.body).toMatchObject({ reused: true, payment: { id: first.body.payment.id } });
    // A new key while one payment is still open returns that open payment.
    const other = await start(agent, fx.examId);
    expect(other.body.payment.id).toBe(first.body.payment.id);
    expect(await prisma.payment.count({ where: { examId: fx.examId } })).toBe(1);
  });

  it("expires unfinished payments after 5 minutes; nothing is possible after that", async () => {
    const fx = await openExam({ students: 1, feeAmount: 5 });
    const agent = fx.studentAgents[0];
    const p = (await start(agent, fx.examId)).body.payment;
    // Make the payment 6 minutes old. Only the test database owner can do this: it briefly
    // switches off the guard trigger inside ONE transaction (DDL is transactional in
    // PostgreSQL, so no other session ever sees the trigger switched off).
    const { default: pg } = await import("pg");
    const owner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL!.split("?")[0] });
    await owner.connect();
    await owner.query("BEGIN");
    await owner.query("ALTER TABLE payments DISABLE TRIGGER payments_guard");
    await owner.query("UPDATE payments SET created_at = created_at - interval '6 minutes', expires_at = expires_at - interval '6 minutes' WHERE id = $1", [p.id]);
    await owner.query("ALTER TABLE payments ENABLE TRIGGER payments_guard");
    await owner.query("COMMIT");
    await owner.end();

    expect(await expireDuePayments()).toBeGreaterThanOrEqual(1);
    const after = await agent.get(`/api/payments/${p.id}`);
    expect(after.body.payment.status).toBe("EXPIRED");
    expect((await agent.post(`/api/payments/${p.id}/confirm`).send({ accept: true })).body.error.code).toBe("PAYMENT_EXPIRED");
  });

  it("keeps payments private and refuses free exams", async () => {
    const fx = await openExam({ students: 2, feeAmount: 5 });
    const p = (await start(fx.studentAgents[0], fx.examId)).body.payment;
    expect((await fx.studentAgents[1].get(`/api/payments/${p.id}`)).status).toBe(404);
    expect((await fx.studentAgents[1].post(`/api/payments/${p.id}/confirm`).send({ accept: true })).status).toBe(404);
    expect((await fx.studentAgents[1].get("/api/payments")).body.items).toHaveLength(0);
    const [, admin] = await userAgent("ADMIN");
    expect((await admin.get(`/api/payments/${p.id}`)).status).toBe(200);
    const free = await openExam({ students: 1 });
    expect((await start(free.studentAgents[0], free.examId)).body.error.code).toBe("EXAM_HAS_NO_FEE");
  });
});
