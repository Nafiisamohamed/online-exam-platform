/** Login, sessions, temporary passwords and role checks (baseline 6.2, Q1). */
import { describe, expect, it } from "vitest";
import { app, createUser, loginAs, PASSWORD, prisma, request } from "./helpers.ts";

describe("authentication", () => {
  it("health check reports the database and server time", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("ok");
    expect(new Date(res.body.serverTime).getTime()).toBeGreaterThan(0);
  });

  it("logs staff in by email and students by student number, with an HTTP-only cookie", async () => {
    const lecturer = await createUser("LECTURER");
    const res = await request(app).post("/api/auth/login").send({ identifier: lecturer.email!.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: lecturer.id, role: "LECTURER" });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/oe_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    const student = await createUser("STUDENT");
    const agent = await loginAs({ email: null, studentNumber: student.studentNumber!.toLowerCase() });
    const me = await agent.get("/api/auth/me");
    expect(me.body.user.studentNumber).toBe(student.studentNumber);
  });

  it("gives the same error for a wrong password, an unknown user and a deactivated account", async () => {
    const user = await createUser("STUDENT");
    const inactive = await createUser("STUDENT", { isActive: false });
    for (const body of [
      { identifier: user.studentNumber, password: "wrong-password1" },
      { identifier: "NOBODY-123", password: PASSWORD },
      { identifier: inactive.studentNumber, password: PASSWORD },
    ]) {
      const res = await request(app).post("/api/auth/login").send(body);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    }
    const failed = await prisma.auditLog.count({ where: { actionCode: "LOGIN_FAILED", entityId: user.id } });
    expect(failed).toBe(1);
  });

  it("rejects requests without a session and with a forged cookie", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    const res = await request(app).get("/api/auth/me").set("Cookie", "oe_session=forged.token.value");
    expect(res.status).toBe(401);
  });

  it("validates input on the server", async () => {
    const res = await request(app).post("/api/auth/login").send({ identifier: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("forces a temporary password to be changed, then ends the old session", async () => {
    const user = await createUser("STUDENT", { mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() + 86_400_000) });
    const agent = await loginAs(user);
    expect((await agent.get("/api/auth/me")).body.user.mustChangePassword).toBe(true);
    const blocked = await agent.get("/api/notifications");
    expect([403, 404]).toContain(blocked.status);

    const weak = await agent.post("/api/auth/change-password").send({ currentPassword: PASSWORD, newPassword: "short" });
    expect(weak.status).toBe(400);
    const changed = await agent.post("/api/auth/change-password").send({ currentPassword: PASSWORD, newPassword: "NewPassw0rd!" });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    // The agent got a new cookie and keeps working; the old password no longer works.
    expect((await agent.get("/api/auth/me")).status).toBe(200);
    const old = await request(app).post("/api/auth/login").send({ identifier: user.studentNumber, password: PASSWORD });
    expect(old.status).toBe(401);
  });

  it("refuses an expired temporary password", async () => {
    const user = await createUser("STUDENT", { mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() - 1000) });
    const res = await request(app).post("/api/auth/login").send({ identifier: user.studentNumber, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TEMP_PASSWORD_EXPIRED");
  });

  it("ends existing sessions when the account is deactivated", async () => {
    const user = await createUser("LECTURER");
    const agent = await loginAs(user);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("switches the language between Somali and English", async () => {
    const user = await createUser("STUDENT");
    const agent = await loginAs(user);
    expect((await agent.get("/api/auth/me")).body.user.preferredLanguage).toBe("so");
    const res = await agent.patch("/api/auth/language").send({ language: "en" });
    expect(res.body.user.preferredLanguage).toBe("en");
    expect((await agent.patch("/api/auth/language").send({ language: "fr" })).status).toBe(400);
  });

  it("logout clears the cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(String(res.headers["set-cookie"])).toMatch(/oe_session=;/);
  });
});
