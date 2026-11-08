/**
 * The core technical challenge (section 3): the three official completion
 * conditions, tested end to end through the API and the real database.
 */
import { describe, expect, it } from "vitest";
import { autoSubmitExpired } from "../../src/services/submission.ts";
import { answerKey, openExam, setDeadline } from "./exam-fixtures.ts";
import { prisma, randomUUID, userAgent } from "./helpers.ts";

const signature = (questions: any[]) => questions.map((q) => `${q.type}:${q.marks}`).sort();

describe("completion condition 1: different question sets with equal difficulty", () => {
  it("gives two students different questions with the same type, difficulty and marks mix", async () => {
    const { examId, studentAgents } = await openExam();
    const a = await studentAgents[0].post(`/api/exams/${examId}/attempts`);
    const b = await studentAgents[1].post(`/api/exams/${examId}/attempts`);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const qa = a.body.attempt.questions;
    const qb = b.body.attempt.questions;
    expect(qa).toHaveLength(6);
    expect(signature(qa)).toEqual(signature(qb));
    expect(a.body.attempt.totalMarks).toBe(16);
    expect(b.body.attempt.totalMarks).toBe(16);

    const versions = async (attemptId: string) =>
      (await prisma.attemptQuestion.findMany({ where: { attemptId }, include: { questionVersion: true } })).map((q) => q.questionVersion);
    const va = await versions(a.body.attempt.id);
    const vb = await versions(b.body.attempt.id);
    const mix = (v: typeof va) => v.map((x) => `${x.type}/${x.difficulty}/${x.marks}`).sort();
    expect(mix(va)).toEqual(mix(vb));
    // Different question sets: pools are larger than the rules, and least-used questions are drawn first.
    const shared = va.filter((x) => vb.some((y) => y.id === x.id));
    expect(shared).toHaveLength(0);
    // Every drawn version is now locked (same transaction as the selection).
    expect([...va, ...vb].every((v) => v.isLocked)).toBe(true);
  });
});

describe("completion condition 3: reload resumes with saved answers and the correct remaining time", () => {
  it("returns the same questions, answers, flags and server-calculated time after a reload", async () => {
    const { examId, studentAgents } = await openExam({ students: 1 });
    const agent = studentAgents[0];
    const start = await agent.post(`/api/exams/${examId}/attempts`);
    const attempt = start.body.attempt;
    const key = await answerKey(attempt.id);
    const mcq = key.find((k) => k.type === "MCQ")!;
    const essay = key.find((k) => k.type === "ESSAY")!;

    expect((await agent.put(`/api/attempts/${attempt.id}/questions/${mcq.attemptQuestionId}/answer`).send({ selectedOptionId: mcq.wrongOptionId })).status).toBe(200);
    // Changing an answer before the deadline is allowed.
    const changed = await agent.put(`/api/attempts/${attempt.id}/questions/${mcq.attemptQuestionId}/answer`).send({ selectedOptionId: mcq.correctOptionId });
    expect(changed.body).toEqual({ saved: true, savedAt: expect.any(String), remainingSeconds: expect.any(Number) });
    await agent.put(`/api/attempts/${attempt.id}/questions/${essay.attemptQuestionId}/answer`).send({ textAnswer: "My essay answer" });
    await agent.put(`/api/attempts/${attempt.id}/questions/${essay.attemptQuestionId}/flag`).send({ flagged: true });

    // Reload (GET) and "start again" both return the same attempt; no new exam is generated.
    const reload = await agent.get(`/api/attempts/${attempt.id}`);
    const again = await agent.post(`/api/exams/${examId}/attempts`);
    expect(again.status).toBe(200);
    expect(again.body.resumed).toBe(true);
    expect(again.body.attempt.id).toBe(attempt.id);
    for (const view of [reload.body.attempt, again.body.attempt]) {
      expect(view.questions.map((q: any) => q.id)).toEqual(attempt.questions.map((q: any) => q.id));
      expect(view.questions.map((q: any) => q.options.map((o: any) => o.id))).toEqual(attempt.questions.map((q: any) => q.options.map((o: any) => o.id)));
      const m = view.questions.find((q: any) => q.id === mcq.attemptQuestionId);
      expect(m.answer.selectedOptionId).toBe(mcq.correctOptionId);
      const e = view.questions.find((q: any) => q.id === essay.attemptQuestionId);
      expect(e).toMatchObject({ isFlagged: true, isAnswered: true, answer: { textAnswer: "My essay answer" } });
      expect(view.answeredCount).toBe(2);
      // Remaining time comes from the server deadline (60 minutes from start).
      const expected = Math.ceil((new Date(view.deadline).getTime() - new Date(view.serverTime).getTime()) / 1000);
      expect(Math.abs(view.remainingSeconds - expected)).toBeLessThanOrEqual(1);
      expect(view.remainingSeconds).toBeGreaterThan(59 * 60 - 30);
      expect(view.remainingSeconds).toBeLessThanOrEqual(60 * 60);
    }
    expect(await prisma.attemptQuestion.count({ where: { attemptId: attempt.id } })).toBe(6);
    expect(await prisma.examAttempt.count({ where: { examId, studentId: (await prisma.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).studentId } })).toBe(1);
  });

  it("caps the deadline at the window end when the student starts late", async () => {
    const { examId, studentAgents } = await openExam({ students: 1, openedMinutesAgo: 100, windowMinutes: 120, durationMinutes: 60 });
    const res = await studentAgents[0].post(`/api/exams/${examId}/attempts`);
    expect(res.body.attempt.remainingSeconds).toBeLessThanOrEqual(20 * 60);
    expect(res.body.attempt.remainingSeconds).toBeGreaterThan(19 * 60);
  });
});

describe("completion condition 2: answers after the server deadline are rejected", () => {
  it("accepts a save before the deadline, rejects it after, and auto-submits the saved answers", async () => {
    const { examId, studentAgents } = await openExam({ students: 1 });
    const agent = studentAgents[0];
    const attempt = (await agent.post(`/api/exams/${examId}/attempts`)).body.attempt;
    const key = await answerKey(attempt.id);
    const mcq = key.find((k) => k.type === "MCQ")!;
    const short = key.find((k) => k.type === "SHORT_ANSWER")!;

    const deadline = new Date(Date.now() + 1500);
    await setDeadline(attempt.id, deadline);
    expect((await agent.put(`/api/attempts/${attempt.id}/questions/${mcq.attemptQuestionId}/answer`).send({ selectedOptionId: mcq.correctOptionId })).status).toBe(200);

    await new Promise((r) => setTimeout(r, 2000));
    const late = await agent.put(`/api/attempts/${attempt.id}/questions/${short.attemptQuestionId}/answer`).send({ textAnswer: "too late" });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("ATTEMPT_DEADLINE_PASSED");

    const row = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(row).toMatchObject({ status: "SUBMITTED", submissionType: "AUTO_DEADLINE" });
    expect(row.submittedAt!.getTime()).toBe(row.deadline.getTime());
    const answers = await prisma.answer.findMany({ where: { attemptId: attempt.id } });
    expect(answers).toHaveLength(6);
    expect(answers.find((a) => a.attemptQuestionId === mcq.attemptQuestionId)!.gradingStatus).toBe("AUTO_CORRECT");
    expect(answers.find((a) => a.attemptQuestionId === short.attemptQuestionId)).toMatchObject({ textAnswer: null, gradingStatus: "NOT_ANSWERED" });

    // Any further save is rejected as already submitted.
    const after = await agent.put(`/api/attempts/${attempt.id}/questions/${mcq.attemptQuestionId}/answer`).send({ selectedOptionId: mcq.wrongOptionId });
    expect(after.body.error.code).toBe("ATTEMPT_ALREADY_SUBMITTED");
  });

  it("the database itself rejects a late answer even if the service check were skipped", async () => {
    const { examId, studentAgents } = await openExam({ students: 1 });
    const attempt = (await studentAgents[0].post(`/api/exams/${examId}/attempts`)).body.attempt;
    const q = (await answerKey(attempt.id)).find((k) => k.type === "MCQ")!;
    await setDeadline(attempt.id, new Date(Date.now() - 1000));
    const aq = await prisma.attemptQuestion.findUniqueOrThrow({ where: { id: q.attemptQuestionId } });
    await expect(
      prisma.answer.create({ data: { attemptId: attempt.id, attemptQuestionId: aq.id, questionVersionId: aq.questionVersionId, selectedOptionId: q.correctOptionId } }),
    ).rejects.toThrow(/ATTEMPT_DEADLINE_PASSED/);
  });

  it("the background job submits attempts of disconnected students at their deadline", async () => {
    const { examId, studentAgents } = await openExam({ students: 1 });
    const attempt = (await studentAgents[0].post(`/api/exams/${examId}/attempts`)).body.attempt;
    await setDeadline(attempt.id, new Date(Date.now() - 5000));
    expect(await autoSubmitExpired()).toBeGreaterThanOrEqual(1);
    const row = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(row.status).toBe("SUBMITTED");
    expect(row.submissionType).toBe("AUTO_DEADLINE");
    expect(await prisma.grade.count({ where: { attemptId: attempt.id } })).toBe(1);
  });
});

describe("attempt security", () => {
  it("never sends correct answers to students, and save responses reveal nothing", async () => {
    const { examId, studentAgents } = await openExam({ students: 1 });
    const start = await studentAgents[0].post(`/api/exams/${examId}/attempts`);
    const text = JSON.stringify(start.body);
    for (const secret of ["isCorrect", "acceptedAnswers", "rubric", "gradingStatus", "marksAwarded", "difficulty", "Structured Query Language"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("keeps attempts private and checks that options belong to the question", async () => {
    const { examId, studentAgents } = await openExam({ students: 2 });
    const a = (await studentAgents[0].post(`/api/exams/${examId}/attempts`)).body.attempt;
    const b = (await studentAgents[1].post(`/api/exams/${examId}/attempts`)).body.attempt;
    expect((await studentAgents[1].get(`/api/attempts/${a.id}`)).status).toBe(404);
    const keyA = await answerKey(a.id);
    const keyB = await answerKey(b.id);
    const mcqA = keyA.find((k) => k.type === "MCQ")!;
    expect((await studentAgents[1].put(`/api/attempts/${a.id}/questions/${mcqA.attemptQuestionId}/answer`).send({ selectedOptionId: mcqA.correctOptionId })).status).toBe(404);
    // An option from another question (of another student) is refused.
    const mcqB = keyB.find((k) => k.type === "MCQ")!;
    const wrong = await studentAgents[0].put(`/api/attempts/${a.id}/questions/${mcqA.attemptQuestionId}/answer`).send({ selectedOptionId: mcqB.correctOptionId });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("OPTION_NOT_IN_QUESTION");
    const [, lecturer] = await userAgent("LECTURER");
    expect((await lecturer.get(`/api/attempts/${a.id}`)).status).toBe(403);
  });

  it("only lets enrolled students start inside the window, after paying (from any network)", async () => {
    const notOpen = await openExam({ students: 1, openedMinutesAgo: -30 });
    expect((await notOpen.studentAgents[0].post(`/api/exams/${notOpen.examId}/attempts`)).body.error.code).toBe("EXAM_NOT_OPEN_YET");
    const closed = await openExam({ students: 1, openedMinutesAgo: 200, windowMinutes: 120 });
    expect((await closed.studentAgents[0].post(`/api/exams/${closed.examId}/attempts`)).body.error.code).toBe("EXAM_WINDOW_CLOSED");
    // A room with network ranges never blocks a student (see any-network.test.ts for many addresses).
    const room = await openExam({ students: 1, networkRanges: ["10.10.4.0/24"] });
    expect((await room.studentAgents[0].post(`/api/exams/${room.examId}/attempts`)).status).toBe(201);
    const paid = await openExam({ students: 1, feeAmount: 5 });
    const unpaid = await paid.studentAgents[0].post(`/api/exams/${paid.examId}/attempts`);
    expect(unpaid.status).toBe(402);
    expect(unpaid.body.error).toMatchObject({ code: "PAYMENT_REQUIRED", details: { amount: 5, currency: "USD" } });
    const [, outsider] = await userAgent("STUDENT");
    expect((await outsider.post(`/api/exams/${paid.examId}/attempts`)).body.error.code).toBe("NOT_ENROLLED");
  });
});

describe("tab-switch detection (4.8)", () => {
  it("logs every focus loss, counts only those of 1 second or more, and warns after 3", async () => {
    const { examId, studentAgents } = await openExam({ students: 1 });
    const agent = studentAgents[0];
    const attempt = (await agent.post(`/api/exams/${examId}/attempts`)).body.attempt;
    const lose = async (ms: number) => {
      const id = randomUUID();
      await agent.post(`/api/attempts/${attempt.id}/focus-events`).send({ clientEventId: id, type: "LOST" });
      // Simulate how long the student was away by moving the server-recorded loss time back.
      await prisma.focusEvent.update({ where: { attemptId_clientEventId: { attemptId: attempt.id, clientEventId: id } }, data: { lostAt: new Date(Date.now() - ms) } });
      const res = await agent.post(`/api/attempts/${attempt.id}/focus-events`).send({ clientEventId: id, type: "RETURNED" });
      // A retried RETURNED is harmless.
      await agent.post(`/api/attempts/${attempt.id}/focus-events`).send({ clientEventId: id, type: "RETURNED" });
      return res.body;
    };
    expect(await lose(300)).toEqual({ countedFocusLosses: 0, focusWarning: false });
    expect((await lose(4000)).countedFocusLosses).toBe(1);
    expect((await lose(2500)).countedFocusLosses).toBe(2);
    expect(await lose(1200)).toEqual({ countedFocusLosses: 3, focusWarning: true });
    const events = await prisma.focusEvent.findMany({ where: { attemptId: attempt.id }, orderBy: { lostAt: "asc" } });
    expect(events).toHaveLength(4);
    expect(events.filter((e) => e.isCounted)).toHaveLength(3);
    expect(events.every((e) => e.durationMs !== null && e.returnedAt)).toBe(true);
    const view = await agent.get(`/api/attempts/${attempt.id}`);
    expect(view.body.attempt.focusWarning).toBe(true);
  });
});

describe("submission and automatic grading (4.10)", () => {
  it("auto-grades MCQ, True/False and matching short answers, and marks the rest for review", async () => {
    const { examId, studentAgents } = await openExam({ students: 1 });
    const agent = studentAgents[0];
    const attempt = (await agent.post(`/api/exams/${examId}/attempts`)).body.attempt;
    const key = await answerKey(attempt.id);
    const mcqs = key.filter((k) => k.type === "MCQ");
    const tf = key.find((k) => k.type === "TRUE_FALSE")!;
    const short = key.find((k) => k.type === "SHORT_ANSWER")!;
    const essay = key.find((k) => k.type === "ESSAY")!;
    const save = (k: (typeof key)[number], body: object) => agent.put(`/api/attempts/${attempt.id}/questions/${k.attemptQuestionId}/answer`).send(body);
    await save(mcqs[0], { selectedOptionId: mcqs[0].correctOptionId });
    await save(mcqs[1], { selectedOptionId: mcqs[1].wrongOptionId });
    await save(tf, { selectedOptionId: tf.correctOptionId });
    // Case and extra spaces are ignored; punctuation is kept.
    await save(short, { textAnswer: "  structured   QUERY language " });
    await save(essay, { textAnswer: "An essay." });

    const submitted = await agent.post(`/api/attempts/${attempt.id}/submit`);
    expect(submitted.body.attempt).toMatchObject({ status: "SUBMITTED", submissionType: "MANUAL", questions: [] });
    // Submitting twice is safe.
    expect((await agent.post(`/api/attempts/${attempt.id}/submit`)).status).toBe(200);

    const answers = await prisma.answer.findMany({ where: { attemptId: attempt.id } });
    const status = (k: (typeof key)[number]) => answers.find((a) => a.attemptQuestionId === k.attemptQuestionId)!;
    expect(status(mcqs[0])).toMatchObject({ gradingStatus: "AUTO_CORRECT" });
    expect(Number(status(mcqs[0]).marksAwarded)).toBe(1);
    expect(status(mcqs[1])).toMatchObject({ gradingStatus: "AUTO_INCORRECT" });
    expect(status(mcqs[2])).toMatchObject({ gradingStatus: "NOT_ANSWERED" });
    expect(status(tf)).toMatchObject({ gradingStatus: "AUTO_CORRECT" });
    expect(status(short)).toMatchObject({ gradingStatus: "AUTO_CORRECT" });
    expect(status(essay)).toMatchObject({ gradingStatus: "PENDING_ESSAY", marksAwarded: null });
    const grade = await prisma.grade.findUniqueOrThrow({ where: { attemptId: attempt.id } });
    expect(Number(grade.totalScore)).toBe(4);
    expect(Number(grade.maxScore)).toBe(16);
  });

  it("marks an unmatched short answer as Needs review, not wrong", async () => {
    const { examId, studentAgents } = await openExam({ students: 1 });
    const agent = studentAgents[0];
    const attempt = (await agent.post(`/api/exams/${examId}/attempts`)).body.attempt;
    const short = (await answerKey(attempt.id)).find((k) => k.type === "SHORT_ANSWER")!;
    await agent.put(`/api/attempts/${attempt.id}/questions/${short.attemptQuestionId}/answer`).send({ textAnswer: "Structured Query Language." });
    await agent.post(`/api/attempts/${attempt.id}/submit`);
    const a = await prisma.answer.findUniqueOrThrow({ where: { attemptQuestionId: short.attemptQuestionId } });
    expect(a.gradingStatus).toBe("NEEDS_REVIEW");
    expect(a.marksAwarded).toBeNull();
  });

  it("lists the student's exams with window, fee and attempt state", async () => {
    const { examId, studentAgents } = await openExam({ students: 1, feeAmount: 5 });
    const list = await studentAgents[0].get("/api/my/exams");
    const item = list.body.items.find((e: any) => e.id === examId);
    expect(item).toMatchObject({ state: "OPEN", canStart: false, fee: { amount: 5, currency: "USD", required: true, paid: false } });
  });
});
