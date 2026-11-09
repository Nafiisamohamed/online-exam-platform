/**
 * Students may take examinations from any device and any connection: university
 * Wi-Fi, home Wi-Fi, mobile data. Rooms are allocated for scheduling only and never
 * restrict where a student starts. All other eligibility rules still apply.
 *
 * Client addresses are simulated with X-Forwarded-For on an app that trusts one
 * proxy hop (as behind a reverse proxy), so the server really sees each address.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";
import { openExam } from "./exam-fixtures.ts";
import { PASSWORD, prisma, request, userAgent } from "./helpers.ts";

const behindProxy = createApp();
behindProxy.set("trust proxy", 1);

async function studentFrom(user: { email: string | null; studentNumber: string | null }) {
  const agent = request.agent(behindProxy);
  const res = await agent.post("/api/auth/login").send({ identifier: user.email ?? user.studentNumber, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return agent;
}

const ADDRESSES = [
  ["university network", "10.10.4.20"],
  ["home Wi-Fi", "203.0.113.5"],
  ["mobile data", "198.51.100.7"],
  ["IPv6 mobile data", "2001:db8::42"],
] as const;

describe("examinations can be taken from any network", () => {
  it("every eligible student starts, whatever the address, even with exam rooms (with network ranges) assigned", async () => {
    const exam = await openExam({ students: ADDRESSES.length, networkRanges: ["10.10.4.0/24"] });
    for (const [i, [, ip]] of ADDRESSES.entries()) {
      const agent = await studentFrom(exam.students[i]);
      const res = await agent.post(`/api/exams/${exam.examId}/attempts`).set("X-Forwarded-For", ip);
      expect(res.status, ip).toBe(201);
      const attempt = await prisma.examAttempt.findUniqueOrThrow({ where: { id: res.body.attempt.id } });
      expect(attempt.startIp).toBe(ip); // recorded for the record only
    }
  });

  it("a student who changes network keeps the same attempt (resume from another connection)", async () => {
    const exam = await openExam({ students: 1, networkRanges: ["10.20.1.0/24"] });
    const agent = await studentFrom(exam.students[0]);
    const first = await agent.post(`/api/exams/${exam.examId}/attempts`).set("X-Forwarded-For", "10.20.1.9");
    const again = await agent.post(`/api/exams/${exam.examId}/attempts`).set("X-Forwarded-For", "198.51.100.7");
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.resumed).toBe(true);
    expect(again.body.attempt.id).toBe(first.body.attempt.id);
  });

  it("the other eligibility rules are unchanged on any network", async () => {
    const notOpen = await openExam({ students: 1, openedMinutesAgo: -30, networkRanges: ["10.10.4.0/24"] });
    const early = await (await studentFrom(notOpen.students[0])).post(`/api/exams/${notOpen.examId}/attempts`).set("X-Forwarded-For", "10.10.4.20");
    expect(early.body.error.code).toBe("EXAM_NOT_OPEN_YET");
    const paid = await openExam({ students: 1, semesterFee: 400 });
    const unpaid = await (await studentFrom(paid.students[0])).post(`/api/exams/${paid.examId}/attempts`).set("X-Forwarded-For", "203.0.113.5");
    expect(unpaid.status).toBe(402);
    const [outsider] = await userAgent("STUDENT");
    const notEnrolled = await (await studentFrom(outsider)).post(`/api/exams/${paid.examId}/attempts`).set("X-Forwarded-For", "10.10.4.20");
    expect(notEnrolled.body.error.code).toBe("NOT_ENROLLED");
  });
});
