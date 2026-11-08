/**
 * Tab-switch limit (project policy): the third counted tab switch terminates the
 * attempt on the server. Saved answers are kept and auto-graded; the attempt can
 * no longer be changed, submitted or resumed; the lecturer sees it as TERMINATED
 * (never ABSENT) and can review and grade the saved answers.
 */
import { describe, expect, it } from "vitest";
import { answerKey, openExam } from "./exam-fixtures.ts";
import { prisma, randomUUID, userAgent } from "./helpers.ts";

type Agent = Awaited<ReturnType<typeof openExam>>["studentAgents"][number];

/** One focus loss of `ms` milliseconds, as the browser reports it (LOST, then RETURNED). */
async function away(agent: Agent, attemptId: string, ms: number) {
  const id = randomUUID();
  await agent.post(`/api/attempts/${attemptId}/focus-events`).send({ clientEventId: id, type: "LOST" });
  await prisma.focusEvent.update({ where: { attemptId_clientEventId: { attemptId, clientEventId: id } }, data: { lostAt: new Date(Date.now() - ms) } });
  return { id, res: await agent.post(`/api/attempts/${attemptId}/focus-events`).send({ clientEventId: id, type: "RETURNED" }) };
}

describe("tab-switch limit: 0, 1 or 2 counted switches still allow submission", () => {
  for (const switches of [0, 1, 2]) {
    it(`${switches} counted switch(es): the student continues and submits normally`, async () => {
      const { examId, studentAgents } = await openExam({ students: 1 });
      const agent = studentAgents[0];
      const attempt = (await agent.post(`/api/exams/${examId}/attempts`)).body.attempt;
      for (let i = 0; i < switches; i++) expect((await away(agent, attempt.id, 2000)).res.body.terminated).toBe(false);
      const done = await agent.post(`/api/attempts/${attempt.id}/submit`);
      expect(done.status).toBe(200);
      const row = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      expect(row).toMatchObject({ status: "SUBMITTED", submissionType: "MANUAL", countedFocusLosses: switches });
    });
  }
});

describe("tab-switch limit: the third counted switch terminates the attempt", () => {
  it("terminates on the server, keeps and grades the saved answers, and locks the attempt", async () => {
    const { examId, studentAgents } = await openExam({ students: 1 });
    const agent = studentAgents[0];
    const attempt = (await agent.post(`/api/exams/${examId}/attempts`)).body.attempt;
    const key = await answerKey(attempt.id);
    const mcq = key.find((k) => k.type === "MCQ")!;
    const essay = key.find((k) => k.type === "ESSAY")!;
    await agent.put(`/api/attempts/${attempt.id}/questions/${mcq.attemptQuestionId}/answer`).send({ selectedOptionId: mcq.correctOptionId });
    await agent.put(`/api/attempts/${attempt.id}/questions/${essay.attemptQuestionId}/answer`).send({ textAnswer: "Assets equal liabilities plus equity." });

    await away(agent, attempt.id, 2000);
    await away(agent, attempt.id, 2000);
    const third = await away(agent, attempt.id, 2000);
    expect(third.res.status).toBe(200);
    expect(third.res.body).toMatchObject({ countedFocusLosses: 3, terminated: true, status: "TERMINATED" });

    const row = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attempt.id }, include: { grade: true } });
    expect(row).toMatchObject({ status: "TERMINATED", submissionType: "TERMINATED_TAB_LIMIT", countedFocusLosses: 3 });
    expect(row.submittedAt).not.toBeNull(); // the termination time
    expect(row.grade).not.toBeNull(); // auto-graded like a submission; essays wait for the lecturer
    const answers = await prisma.answer.findMany({ where: { attemptId: attempt.id } });
    expect(answers.find((x) => x.attemptQuestionId === mcq.attemptQuestionId)).toMatchObject({ gradingStatus: "AUTO_CORRECT" });
    expect(answers.find((x) => x.attemptQuestionId === essay.attemptQuestionId)).toMatchObject({ textAnswer: "Assets equal liabilities plus equity.", gradingStatus: "PENDING_ESSAY" });
    expect(await prisma.auditLog.count({ where: { actionCode: "ATTEMPT_TERMINATED", entityId: attempt.id } })).toBe(1);

    // nothing more can change
    const save = await agent.put(`/api/attempts/${attempt.id}/questions/${mcq.attemptQuestionId}/answer`).send({ selectedOptionId: mcq.wrongOptionId });
    expect(save.status).toBe(409);
    expect(save.body.error.code).toBe("ATTEMPT_TERMINATED");
    const flag = await agent.put(`/api/attempts/${attempt.id}/questions/${mcq.attemptQuestionId}/flag`).send({ flagged: true });
    expect(flag.body.error.code).toBe("ATTEMPT_TERMINATED");
    const submit = await agent.post(`/api/attempts/${attempt.id}/submit`);
    expect(submit.status).toBe(409);
    expect(submit.body.error.code).toBe("ATTEMPT_TERMINATED");
    const more = await agent.post(`/api/attempts/${attempt.id}/focus-events`).send({ clientEventId: randomUUID(), type: "LOST" });
    expect(more.body.error.code).toBe("ATTEMPT_TERMINATED");
    expect((await prisma.answer.findFirstOrThrow({ where: { attemptQuestionId: mcq.attemptQuestionId } })).selectedOptionId).toBe(mcq.correctOptionId);

    // refreshing or starting again cannot resume it, and no second attempt is created
    const again = await agent.post(`/api/exams/${examId}/attempts`);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ resumed: true, attempt: { id: attempt.id, status: "TERMINATED", questions: [] } });
    expect((await agent.get(`/api/attempts/${attempt.id}`)).body.attempt).toMatchObject({ status: "TERMINATED", questions: [] });
    expect((await agent.post(`/api/attempts/${attempt.id}/heartbeat`)).body.status).toBe("TERMINATED");
    expect(await prisma.examAttempt.count({ where: { examId } })).toBe(1);
    const mine = (await agent.get("/api/my/exams")).body.items.find((e: { id: string }) => e.id === examId);
    expect(mine.state).toBe("TERMINATED");
  });

  it("is safe against duplicate and concurrent events: terminated exactly once, at 3", async () => {
    const { examId, studentAgents } = await openExam({ students: 1 });
    const agent = studentAgents[0];
    const attempt = (await agent.post(`/api/exams/${examId}/attempts`)).body.attempt;
    await away(agent, attempt.id, 2000);
    await away(agent, attempt.id, 2000);
    // two pending losses, both returned at the same moment (two tabs / repeated events)
    const ids = [randomUUID(), randomUUID()];
    for (const id of ids) {
      await agent.post(`/api/attempts/${attempt.id}/focus-events`).send({ clientEventId: id, type: "LOST" });
      await prisma.focusEvent.update({ where: { attemptId_clientEventId: { attemptId: attempt.id, clientEventId: id } }, data: { lostAt: new Date(Date.now() - 2000) } });
    }
    const results = await Promise.all([...ids, ids[0]].map((id) => agent.post(`/api/attempts/${attempt.id}/focus-events`).send({ clientEventId: id, type: "RETURNED" })));
    expect(results.every((r) => r.status === 200 || r.body.error?.code === "ATTEMPT_TERMINATED")).toBe(true);
    const row = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(row.status).toBe("TERMINATED");
    expect(row.countedFocusLosses).toBe(3);
    expect(await prisma.auditLog.count({ where: { actionCode: "ATTEMPT_TERMINATED", entityId: attempt.id } })).toBe(1);
  });
});

describe("lecturer results, grading and invigilation with a terminated attempt", () => {
  it("shows TERMINATED with the details (never ABSENT), keeps ABSENT for a non-starter, and lets the lecturer grade", async () => {
    const fx = await openExam({ students: 3 });
    const [terminated, submitted, absent] = fx.studentAgents;
    const t = (await terminated.post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    const key = await answerKey(t.id);
    const mcq = key.find((k) => k.type === "MCQ")!;
    await terminated.put(`/api/attempts/${t.id}/questions/${mcq.attemptQuestionId}/answer`).send({ selectedOptionId: mcq.correctOptionId });
    const essay = key.find((k) => k.type === "ESSAY")!;
    await terminated.put(`/api/attempts/${t.id}/questions/${essay.attemptQuestionId}/answer`).send({ textAnswer: "Saved before termination." });
    for (let i = 0; i < 3; i++) await away(terminated, t.id, 2000);
    const s = (await submitted.post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    await submitted.post(`/api/attempts/${s.id}/submit`);
    void absent;

    const res = await fx.lecturerAgent.get(`/api/exams/${fx.examId}/results`);
    expect(res.status).toBe(200);
    const row = (id: string) => res.body.students.find((x: { student: { id: string } }) => x.student.id === id);
    expect(row(fx.students[0].id)).toMatchObject({ status: "TERMINATED", countedFocusLosses: 3, terminationReason: "TAB_SWITCH_LIMIT", answeredCount: 2 });
    expect(row(fx.students[0].id).terminatedAt).toBeTruthy();
    expect(row(fx.students[1].id)).toMatchObject({ status: "SUBMITTED", terminatedAt: null });
    expect(row(fx.students[2].id).status).toBe("ABSENT");
    expect(res.body.blockers.submitted).toBe(2); // both closed attempts count as having results

    // the saved essay waits in the grading queue, and the lecturer can grade it
    const queue = await fx.lecturerAgent.get(`/api/exams/${fx.examId}/grading`);
    expect(queue.status).toBe(200);
    const item = queue.body.items.find((x: { attemptId?: string; attempt?: { id: string } }) => (x.attemptId ?? x.attempt?.id) === t.id);
    expect(item, JSON.stringify(queue.body.items[0] ?? {})).toBeTruthy();
    expect(item.gradingStatus).toBe("PENDING_ESSAY");
    const opened = await fx.lecturerAgent.get(`/api/grading/answers/${item.answerId}`);
    expect(opened.status).toBe(200);
    expect(JSON.stringify(opened.body)).toContain("Saved before termination.");

    // the lecturer opens the terminated attempt and reviews every saved answer (read-only)
    const review = await fx.lecturerAgent.get(`/api/exams/${fx.examId}/attempts/${t.id}/answers`);
    expect(review.status).toBe(200);
    expect(review.body.attempt).toMatchObject({ status: "TERMINATED", countedFocusLosses: 3, terminationReason: "TAB_SWITCH_LIMIT" });
    expect(review.body.attempt.terminatedAt).toBeTruthy();
    const answered = review.body.questions.filter((q: { answered: boolean }) => q.answered);
    expect(answered).toHaveLength(2);
    expect(answered.find((q: { type: string }) => q.type === "MCQ")).toMatchObject({ gradingStatus: "AUTO_CORRECT" });
    expect(answered.find((q: { type: string }) => q.type === "ESSAY")).toMatchObject({ textAnswer: "Saved before termination.", gradingStatus: "PENDING_ESSAY" });
    const [, otherLecturer] = await userAgent("LECTURER");
    expect((await otherLecturer.get(`/api/exams/${fx.examId}/attempts/${t.id}/answers`)).status).toBe(404);
    expect((await terminated.get(`/api/exams/${fx.examId}/attempts/${t.id}/answers`)).status).toBe(403);

    // the invigilator sees it as terminated
    const [, inv] = [fx.invigilators[0], await (await import("./helpers.ts")).loginAs(fx.invigilators[0])];
    const live = await inv.get(`/api/invigilation/sessions/${fx.schedule.id}/live`);
    expect(live.body.students.find((x: { student: { id: string } }) => x.student.id === fx.students[0].id).status).toBe("TERMINATED");
    expect(live.body.summary.terminated).toBe(1);

    // other students cannot see it
    const [, other] = await userAgent("STUDENT");
    expect((await other.get(`/api/attempts/${t.id}`)).status).toBe(404);
  });
});
