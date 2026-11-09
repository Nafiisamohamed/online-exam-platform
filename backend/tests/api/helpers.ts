/**
 * Helpers for the API tests.
 *
 * The API tests call the real Express app (supertest, no network port) with
 * the real database rules: the test database, migrated from scratch, used as
 * the restricted exam_app role (see tests/setup-env.mjs). Rows they create
 * are committed and removed by the reset at the start of the next run, so
 * every builder uses unique names and codes.
 */
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../src/app.ts";
import { prisma } from "../../src/db/prisma.ts";
import { hashPassword } from "../../src/lib/passwords.ts";
import type { RoleName } from "../../src/generated/prisma/enums.ts";

if (/supabase\.(com|co)/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("API tests must never run against Supabase");
}

export const app = createApp();
export { prisma };

let seq = 0;
/** A short unique suffix for codes and names. */
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase();

export const PASSWORD = "Passw0rd-test";
let cachedHash: string | null = null;

const PREFIX: Record<RoleName, string> = { STUDENT: "S", LECTURER: "T", ADMIN: "R", INVIGILATOR: "I" };
let numberSeq = 0;
/**
 * A unique test username in the real format. Year 2099 keeps fixtures apart from the numbers the
 * server generates for the current year, so tests that check generated numbers are not disturbed.
 */
export const testUsername = (role: RoleName) => `${PREFIX[role]}-2099-${Date.now()}${(numberSeq++).toString().padStart(3, "0")}`;

/** Creates a user with password PASSWORD. Everyone gets a username; students' student number is it, staff get an email. */
export async function createUser(role: RoleName, extra: Partial<{ fullName: string; phone: string; mustChangePassword: boolean; tempPasswordExpiresAt: Date; isActive: boolean; preferredLanguage: "so" | "en" }> = {}) {
  cachedHash ??= await hashPassword(PASSWORD);
  const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const id = uid();
  const username = testUsername(role);
  return prisma.user.create({
    data: {
      roleId: r.id,
      username,
      studentNumber: role === "STUDENT" ? username : null,
      email: role === "STUDENT" ? null : `${role.toLowerCase()}.${id.toLowerCase()}@test.local`,
      fullName: extra.fullName ?? `${role} ${id}`,
      phone: extra.phone ?? "+252615000000",
      passwordHash: cachedHash,
      mustChangePassword: extra.mustChangePassword ?? false,
      tempPasswordExpiresAt: extra.tempPasswordExpiresAt ?? null,
      isActive: extra.isActive ?? true,
      preferredLanguage: extra.preferredLanguage ?? "so",
    },
  });
}

/**
 * An academic year for tests (2100/2101 … 2899/2900), created or reused by name. Sharing a year
 * between tests is harmless; only its id is used.
 */
export async function testAcademicYear(start = 2100 + Math.floor(Math.random() * 800)) {
  const name = `${start}/${start + 1}`;
  return prisma.academicYear.upsert({
    where: { name }, update: {},
    create: { name, startDate: new Date(`${start}-09-01`), endDate: new Date(`${start + 1}-07-31`) },
  });
}

/** Assigns a lecturer to a faculty (needed before they can teach a course there). */
export async function assignToFaculty(facultyId: string, lecturerId: string) {
  return prisma.facultyLecturer.upsert({ where: { facultyId_lecturerId: { facultyId, lecturerId } }, update: {}, create: { facultyId, lecturerId } });
}

/** Logs in and returns a supertest agent that keeps the session cookie. */
export async function loginAs(user: { email: string | null; studentNumber: string | null }, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ identifier: user.email ?? user.studentNumber, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

/** Creates a user of the role and returns [user, logged-in agent]. */
export async function userAgent(role: RoleName) {
  const user = await createUser(role);
  return [user, await loginAs(user)] as const;
}

export { request, randomUUID };

/** Creates a faculty + course taught by the lecturer (semester 2026-Fall). */
export async function createCourse(lecturerId: string) {
  const id = uid();
  const faculty = await prisma.faculty.create({ data: { code: `F${id}`, name: `Faculty ${id}` } });
  return prisma.course.create({ data: { facultyId: faculty.id, code: `C${id}`, name: `Course ${id}`, semester: "2026-Fall", lecturerId } });
}

/** Enrols students (ACTIVE) in a course. */
export async function enrol(courseId: string, ...studentIds: string[]) {
  await prisma.enrolment.createMany({ data: studentIds.map((studentId) => ({ studentId, courseId })) });
}

type Q = { type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY"; difficulty?: "EASY" | "MEDIUM" | "HARD"; marks?: number; topic?: string; text?: string };

/** Request body for a valid question of the given type. */
export function questionBody(q: Q) {
  const marks = q.marks ?? (q.type === "ESSAY" ? 10 : 2);
  const base = { type: q.type, text: q.text ?? `${q.type} question ${uid()}?`, marks, difficulty: q.difficulty ?? "EASY", topic: q.topic ?? "General" };
  if (q.type === "MCQ") return { ...base, options: [{ text: "Alpha", isCorrect: true }, { text: "Beta", isCorrect: false }, { text: "Gamma", isCorrect: false }, { text: "Delta", isCorrect: false }] };
  if (q.type === "TRUE_FALSE") return { ...base, options: [{ text: "True", isCorrect: false }, { text: "False", isCorrect: true }] };
  if (q.type === "SHORT_ANSWER") return { ...base, acceptedAnswers: ["Structured Query Language", "S.Q.L."] };
  return { ...base, rubric: [{ description: "Content", maxMarks: marks / 2 }, { description: "Clarity", maxMarks: marks / 2 }] };
}

/** Creates questions through the API as the lecturer. Returns the created questions. */
export async function addQuestions(agent: ReturnType<typeof request.agent>, courseId: string, count: number, q: Q) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const res = await agent.post(`/api/courses/${courseId}/questions`).send(questionBody(q));
    if (res.status !== 201) throw new Error(`question create failed: ${JSON.stringify(res.body)}`);
    out.push(res.body.question);
  }
  return out;
}
