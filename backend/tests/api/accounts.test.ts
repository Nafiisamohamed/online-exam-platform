/**
 * Automatic account numbers (S-/T-/R-/I-YYYY-NNN), login by username or email, and
 * server-side sign-out. Numbers come from account_number_sequences inside the transaction that
 * creates the account, so they are sequential per role and year and never duplicated.
 */
import { describe, expect, it } from "vitest";
import { mogadishuYear } from "../../src/services/account-numbers.ts";
import { app, createUser, loginAs, PASSWORD, prisma, request, testUsername, uid, userAgent } from "./helpers.ts";

const numberOf = (username: string) => Number(username.split("-")[2]);

async function create(admin: Awaited<ReturnType<typeof userAgent>>[1], role: string, extra: Record<string, unknown> = {}) {
  const body = { role, fullName: `${role} ${uid()}`, phone: "+252615000000", ...(role === "STUDENT" ? {} : { email: `${uid().toLowerCase()}@uni.test` }), ...extra };
  const res = await admin.post("/api/users").send(body);
  expect(res.status).toBe(201);
  return res.body.user as { id: string; username: string; studentNumber: string | null; email: string | null };
}

describe("automatic account numbers", () => {
  it("gives each role its own prefix and the current Mogadishu year, and counts up by one", async () => {
    const [, admin] = await userAgent("ADMIN");
    const year = mogadishuYear();
    for (const [role, prefix] of [["STUDENT", "S"], ["LECTURER", "T"], ["ADMIN", "R"], ["INVIGILATOR", "I"]] as const) {
      const a = await create(admin, role);
      const b = await create(admin, role);
      expect(a.username).toMatch(new RegExp(`^${prefix}-${year}-\\d{3,}$`));
      expect(numberOf(b.username)).toBe(numberOf(a.username) + 1);
      if (role === "STUDENT") expect(a.studentNumber).toBe(a.username);
      else expect(a.studentNumber).toBeNull();
    }
  });

  it("never gives the same number twice when accounts are created at the same moment", async () => {
    const [, admin] = await userAgent("ADMIN");
    const users = await Promise.all(Array.from({ length: 12 }, () => create(admin, "STUDENT")));
    const numbers = users.map((u) => numberOf(u.username)).sort((x, y) => x - y);
    expect(new Set(numbers).size).toBe(12);
    // Consecutive: no number is lost or reused.
    expect(numbers.at(-1)! - numbers[0]).toBe(11);
  });

  it("continues after 999 with four digits (…-999, then …-1000)", async () => {
    const [, admin] = await userAgent("ADMIN");
    const year = mogadishuYear();
    // Move the invigilator counter of this year to at least 999 (only this test creates invigilators through the API this year).
    await prisma.$executeRaw`INSERT INTO account_number_sequences (role, year, last_value) VALUES ('INVIGILATOR', ${year}, 999)
      ON CONFLICT (role, year) DO UPDATE SET last_value = GREATEST(account_number_sequences.last_value, 999)`;
    const before = (await prisma.accountNumberSequence.findUniqueOrThrow({ where: { role_year: { role: "INVIGILATOR", year } } })).lastValue;
    const u = await create(admin, "INVIGILATOR");
    expect(u.username).toBe(`I-${year}-${before + 1}`);
    expect(numberOf(u.username)).toBeGreaterThanOrEqual(1000);
  });

  it("does not use up a number when the account is not created", async () => {
    const [, admin] = await userAgent("ADMIN");
    const email = `taken.${uid().toLowerCase()}@uni.test`;
    const first = await create(admin, "LECTURER", { email });
    expect((await admin.post("/api/users").send({ role: "LECTURER", fullName: "Again", phone: "+252615000000", email })).status).toBe(409);
    const next = await create(admin, "LECTURER");
    expect(numberOf(next.username)).toBe(numberOf(first.username) + 1);
  });

  it("is protected by the database: unique, in the right format, and a student's number is the username", async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "STUDENT" } });
    const base = { roleId: role.id, fullName: "Rule Check", phone: "+252615000000", passwordHash: "x" };
    const username = testUsername("STUDENT");
    await prisma.user.create({ data: { ...base, username, studentNumber: username } });
    await expect(prisma.user.create({ data: { ...base, username, studentNumber: null } })).rejects.toThrow(); // duplicate
    await expect(prisma.user.create({ data: { ...base, username: "DEMO-2026-0001", studentNumber: null } })).rejects.toThrow(); // format
    const other = testUsername("STUDENT");
    await expect(prisma.user.create({ data: { ...base, username: other, studentNumber: `${other}9` } })).rejects.toThrow(); // must match
  });
});

describe("login by username or email", () => {
  it("accepts the username (any letter case) and, for staff, the email", async () => {
    const lecturer = await createUser("LECTURER");
    for (const identifier of [lecturer.username, lecturer.username.toLowerCase(), lecturer.email!]) {
      const res = await request(app).post("/api/auth/login").send({ identifier, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe(lecturer.username);
    }
    const student = await createUser("STUDENT");
    expect((await request(app).post("/api/auth/login").send({ identifier: student.username, password: PASSWORD })).status).toBe(200);
    const wrong = await request(app).post("/api/auth/login").send({ identifier: `${lecturer.username}0`, password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("sign-out", () => {
  it("revokes the session on the server, so a copied cookie stops working", async () => {
    const user = await createUser("STUDENT");
    const agent = await loginAs(user);
    const login = await request(app).post("/api/auth/login").send({ identifier: user.username, password: PASSWORD });
    const copied = login.headers["set-cookie"][0].split(";")[0];
    expect((await request(app).get("/api/auth/me").set("Cookie", copied)).status).toBe(200);

    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(204);
    // Every session of the user ends (all devices), including the copy taken before sign-out.
    expect((await request(app).get("/api/auth/me").set("Cookie", copied)).status).toBe(401);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
    const entry = await prisma.auditLog.findFirst({ where: { actorId: user.id, actionCode: "LOGOUT" } });
    expect(entry).not.toBeNull();

    // Signing in again works normally.
    expect((await request(app).post("/api/auth/login").send({ identifier: user.username, password: PASSWORD })).status).toBe(200);
  });

  it("is harmless without a session", async () => {
    expect((await request(app).post("/api/auth/logout")).status).toBe(204);
    expect((await request(app).post("/api/auth/logout").set("Cookie", "oe_session=not-a-token")).status).toBe(204);
  });
});

describe("activity history (registrar)", () => {
  it("filters by person, role, action and date, and exports CSV in the chosen language", async () => {
    const [, admin] = await userAgent("ADMIN");
    const lecturer = await createUser("LECTURER", { fullName: `Activity Lecturer ${uid()}` });
    const since = new Date(Date.now() - 1000).toISOString();
    await loginAs(lecturer); // LOGIN_SUCCESS by the lecturer
    await request(app).post("/api/auth/login").send({ identifier: lecturer.username, password: "wrong-password-1" }); // LOGIN_FAILED (no actor)

    const byName = await admin.get("/api/audit-logs").query({ search: lecturer.fullName.toLowerCase(), from: since });
    expect(byName.status).toBe(200);
    expect(byName.body.items.length).toBeGreaterThanOrEqual(1);
    expect(byName.body.items.every((e: any) => e.actor?.id === lecturer.id)).toBe(true);
    expect(byName.body.items[0].actor).toMatchObject({ username: lecturer.username, role: { name: "LECTURER" } });

    const byUsername = await admin.get("/api/audit-logs").query({ search: lecturer.username, action: "LOGIN_SUCCESS" });
    expect(byUsername.body.items.map((e: any) => e.actionCode)).toEqual(["LOGIN_SUCCESS"]);
    const students = await admin.get("/api/audit-logs").query({ role: "STUDENT", search: lecturer.username });
    expect(students.body.total).toBe(0);
    const future = await admin.get("/api/audit-logs").query({ search: lecturer.username, from: new Date(Date.now() + 3_600_000).toISOString() });
    expect(future.body.total).toBe(0);

    const en = await admin.get("/api/audit-logs.csv").query({ search: lecturer.username, lang: "en" });
    expect(en.status).toBe(200);
    expect(en.headers["content-type"]).toContain("text/csv");
    expect(en.headers["content-disposition"]).toMatch(/activity-history-\d{4}-\d{2}-\d{2}\.csv/);
    expect(en.text.split("\n")[0]).toContain("Date and time (Mogadishu)");
    expect(en.text).toContain(`${lecturer.fullName},${lecturer.username},Lecturer,signed in`);

    const so = await admin.get("/api/audit-logs.csv").query({ search: lecturer.username, lang: "so" });
    expect(so.text.split("\n")[0]).toContain("Taariikhda iyo waqtiga (Muqdisho)");
    expect(so.text).toContain(`${lecturer.fullName},${lecturer.username},Macallin,`);
    expect(so.headers["content-disposition"]).toMatch(/taariikhda-hawlaha-/);
    expect(await prisma.auditLog.count({ where: { actionCode: "AUDIT_EXPORTED" } })).toBeGreaterThanOrEqual(2);

    const [, lec] = await userAgent("LECTURER");
    expect((await lec.get("/api/audit-logs")).status).toBe(403);
    expect((await lec.get("/api/audit-logs.csv")).status).toBe(403);
  });
});
