/** Simulated mobile-money payments of semester fees (section 7, D1, P7; Phase 4). */
import { describe, expect, it } from "vitest";
import { expireDuePayments } from "../../src/modules/payments/payments.service.ts";
import { openExam } from "./exam-fixtures.ts";
import { prisma, randomUUID, userAgent } from "./helpers.ts";

const start = (agent: any, semesterFeeId: string, amount: number, extra: object = {}) =>
  agent.post("/api/payments").send({ semesterFeeId, amount, provider: "EVC_PLUS", phone: "0619876500", idempotencyKey: randomUUID(), ...extra });

async function pay(agent: any, feeId: string, amount: number) {
  const p = (await start(agent, feeId, amount)).body.payment;
  await agent.post(`/api/payments/${p.id}/confirm`).send({ accept: true });
  const ok = await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "1234" });
  expect(ok.body.result).toBe("SUCCESS");
  return ok.body.payment;
}

describe("simulated payments", () => {
  it("pays part of a semester fee with the demo PIN, issues a simulated receipt and SMS", async () => {
    const fx = await openExam({ students: 1, semesterFee: 400 });
    const agent = fx.studentAgents[0];
    const created = await start(agent, fx.semesterFeeId!, 150);
    expect(created.status).toBe(201);
    const p = created.body.payment;
    expect(p).toMatchObject({ status: "PENDING_CONFIRMATION", amount: 150, currency: "USD", merchantName: "Online Examination System", phone: "+252619876500", isSimulated: true, pinAttemptsLeft: 3 });
    expect(p.semesterFee).toMatchObject({ id: fx.semesterFeeId, semesterNumber: 1 });
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
    for (const lang of ["so", "en"]) {
      const receipt = await agent.get(`/api/payments/${p.id}/receipt.pdf?lang=${lang}`);
      expect(receipt.headers["content-type"]).toBe("application/pdf");
      expect(receipt.body.subarray(0, 4).toString()).toBe("%PDF");
    }

    const mine = await agent.get("/api/my/fees");
    expect(mine.body.semesters[0]).toMatchObject({ fee: { amount: 400 }, paid: 150, outstanding: 250, percentPaid: 38 });
    expect(mine.body.payments[0]).toMatchObject({ kind: "SEMESTER_FEE", amount: 150, status: "SUCCESS" });
    // More than the balance is refused; the rest can be paid; then the fee is settled.
    expect((await start(agent, fx.semesterFeeId!, 250.01)).body.error).toMatchObject({ code: "AMOUNT_EXCEEDS_BALANCE", details: { outstanding: 250 } });
    await pay(agent, fx.semesterFeeId!, 250);
    expect((await start(agent, fx.semesterFeeId!, 1)).body.error.code).toBe("FEE_ALREADY_PAID");
  });

  it("fails after three wrong PINs and allows a new payment afterwards", async () => {
    const fx = await openExam({ students: 1, semesterFee: 100 });
    const agent = fx.studentAgents[0];
    const p = (await start(agent, fx.semesterFeeId!, 100, { provider: "ZAAD" })).body.payment;
    await agent.post(`/api/payments/${p.id}/confirm`).send({ accept: true });
    await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "0000" });
    await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "0000" });
    const third = await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "0000" });
    expect(third.body).toMatchObject({ result: "FAILED", payment: { status: "FAILED", failureReason: "PIN_ATTEMPTS_EXCEEDED", pinAttemptsLeft: 0 } });
    expect((await agent.post(`/api/payments/${p.id}/pin`).send({ pin: "1234" })).body.error.code).toBe("PAYMENT_NOT_AWAITING_PIN");
    const retry = await start(agent, fx.semesterFeeId!, 100, { provider: "ZAAD" });
    expect(retry.status).toBe(201);
    expect(retry.body.payment.id).not.toBe(p.id);
  });

  it("cancels on No or during PIN entry", async () => {
    const fx = await openExam({ students: 1, semesterFee: 100 });
    const agent = fx.studentAgents[0];
    const a = (await start(agent, fx.semesterFeeId!, 50)).body.payment;
    expect((await agent.post(`/api/payments/${a.id}/confirm`).send({ accept: false })).body.payment.status).toBe("CANCELLED");
    const b = (await start(agent, fx.semesterFeeId!, 50, { provider: "EDAHAB" })).body.payment;
    await agent.post(`/api/payments/${b.id}/confirm`).send({ accept: true });
    expect((await agent.post(`/api/payments/${b.id}/cancel`)).body.payment.status).toBe("CANCELLED");
    expect((await agent.post(`/api/payments/${b.id}/cancel`)).body.error.code).toBe("PAYMENT_NOT_OPEN");
  });

  it("validates the amount and returns the same payment for repeated requests", async () => {
    const fx = await openExam({ students: 1, semesterFee: 100 });
    const agent = fx.studentAgents[0];
    expect((await start(agent, fx.semesterFeeId!, 0.001)).body.error.code).toBe("AMOUNT_INVALID");
    expect((await start(agent, fx.semesterFeeId!, -5)).status).toBe(400);
    const key = randomUUID();
    const first = await start(agent, fx.semesterFeeId!, 40, { idempotencyKey: key });
    const resent = await start(agent, fx.semesterFeeId!, 40, { idempotencyKey: key });
    expect(resent.status).toBe(200);
    expect(resent.body).toMatchObject({ reused: true, payment: { id: first.body.payment.id } });
    // A new key while one payment is still open returns that open payment.
    const other = await start(agent, fx.semesterFeeId!, 60);
    expect(other.body.payment.id).toBe(first.body.payment.id);
    expect(await prisma.payment.count({ where: { semesterFeeId: fx.semesterFeeId } })).toBe(1);
  });

  it("expires unfinished payments after 5 minutes; nothing is possible after that", async () => {
    const fx = await openExam({ students: 1, semesterFee: 100 });
    const agent = fx.studentAgents[0];
    const p = (await start(agent, fx.semesterFeeId!, 100)).body.payment;
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

  it("keeps payments private, and a student can only pay their own semester fee", async () => {
    const fx = await openExam({ students: 2, semesterFee: 100 });
    const p = (await start(fx.studentAgents[0], fx.semesterFeeId!, 10)).body.payment;
    expect((await fx.studentAgents[1].get(`/api/payments/${p.id}`)).status).toBe(404);
    expect((await fx.studentAgents[1].post(`/api/payments/${p.id}/confirm`).send({ accept: true })).status).toBe(404);
    expect((await fx.studentAgents[1].get("/api/payments")).body.items).toHaveLength(0);
    const [, admin] = await userAgent("ADMIN");
    expect((await admin.get(`/api/payments/${p.id}`)).status).toBe(200);
    // A student who is not registered for that faculty, year and semester cannot pay that fee.
    const other = await openExam({ students: 1 });
    expect((await start(other.studentAgents[0], fx.semesterFeeId!, 10)).body.error.code).toBe("FEE_NOT_FOUND");
    // The payments table keeps exactly one purpose per payment (exam fee history OR semester fee).
    await expect(prisma.payment.update({ where: { id: p.id }, data: { semesterFeeId: null } })).rejects.toThrow();
  });
});
