/** Essay grading, blind second grading, publication history and student results (4.11, 4.12, Demo 5). */
import { describe, expect, it } from "vitest";
import { answerKey, openExam } from "./exam-fixtures.ts";
import { loginAs, prisma } from "./helpers.ts";

/** Starts and submits attempts for all students, answering MCQ correctly, the short answer unmatched and the essay. */
async function sitAndSubmit(fx: Awaited<ReturnType<typeof openExam>>) {
  const attempts: string[] = [];
  for (const agent of fx.studentAgents) {
    const t = (await agent.post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    for (const k of await answerKey(t.id)) {
      const body = k.type === "ESSAY" ? { textAnswer: "Normalisation removes redundancy." } : k.type === "SHORT_ANSWER" ? { textAnswer: "SQL!" } : { selectedOptionId: k.correctOptionId };
      await agent.put(`/api/attempts/${t.id}/questions/${k.attemptQuestionId}/answer`).send(body);
    }
    await agent.post(`/api/attempts/${t.id}/submit`);
    attempts.push(t.id);
  }
  return attempts;
}

/** Marks every essay of the queue with the given total split over the rubric (two criteria of 5). */
async function markAllEssays(agent: any, examId: string, split: [number, number]) {
  const queue = await agent.get(`/api/exams/${examId}/grading`);
  for (const item of queue.body.items.filter((i: any) => i.type === "ESSAY")) {
    const detail = await agent.get(`/api/grading/answers/${item.answerId}`);
    const criteria = detail.body.answer.question.rubric.map((r: any, i: number) => ({ criterionId: r.id, marks: split[i] }));
    const res = await agent.put(`/api/grading/answers/${item.answerId}/essay`).send({ criteria, comment: "Good structure" });
    if (res.status !== 200) throw new Error(JSON.stringify(res.body));
  }
}

describe("grading and publishing (Demo 5)", () => {
  it("blocks publishing until essays and Needs-review answers are graded, then shows results only after publication", async () => {
    const fx = await openExam({ students: 2, allowAnswerReview: false });
    const [attemptA] = await sitAndSubmit(fx);
    const lec = fx.lecturerAgent;

    // Unpublished results are never visible to the student.
    expect((await fx.studentAgents[0].get(`/api/my/results/${fx.examId}`)).status).toBe(404);
    expect((await fx.studentAgents[0].get("/api/my/results")).body.items).toHaveLength(0);

    const queue = await lec.get(`/api/exams/${fx.examId}/grading`);
    expect(queue.body.counts).toMatchObject({ NEEDS_REVIEW: 2, PENDING_ESSAY: 2 });
    const blocked = await lec.post(`/api/exams/${fx.examId}/results/publish`).send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: "GRADING_INCOMPLETE", details: { ungraded: { NEEDS_REVIEW: 2, PENDING_ESSAY: 2 } } });

    // The essay is shown with its rubric beside the answer.
    const essayItem = queue.body.items.find((i: any) => i.type === "ESSAY" && i.attemptId === attemptA);
    const detail = await lec.get(`/api/grading/answers/${essayItem.answerId}`);
    expect(detail.body.answer.question.rubric).toHaveLength(2);
    expect(detail.body.answer.response.textAnswer).toBe("Normalisation removes redundancy.");
    const tooHigh = await lec.put(`/api/grading/answers/${essayItem.answerId}/essay`).send({ criteria: detail.body.answer.question.rubric.map((r: any) => ({ criterionId: r.id, marks: 9 })) });
    expect(tooHigh.body.error.code).toBe("CRITERION_MARKS_OUT_OF_RANGE");
    const partial = await lec.put(`/api/grading/answers/${essayItem.answerId}/essay`).send({ criteria: [{ criterionId: detail.body.answer.question.rubric[0].id, marks: 3 }] });
    expect(partial.body.error.code).toBe("RUBRIC_MARKS_REQUIRED");

    await markAllEssays(lec, fx.examId, [4, 3.5]);
    for (const item of queue.body.items.filter((i: any) => i.type === "SHORT_ANSWER")) {
      expect((await lec.put(`/api/grading/answers/${item.answerId}/marks`).send({ marks: 3 })).body.error.code).toBe("MARKS_OUT_OF_RANGE");
      expect((await lec.put(`/api/grading/answers/${item.answerId}/marks`).send({ marks: 1, comment: "Partly right" })).status).toBe(200);
    }

    const published = await lec.post(`/api/exams/${fx.examId}/results/publish`).send({});
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ publicationNumber: 1, attempts: 2, notifiedStudents: 2 });
    expect(await prisma.smsOutbox.count({ where: { relatedId: fx.examId, templateKey: "RESULTS_PUBLISHED" } })).toBe(2);

    // MCQ 3 + TF 1 + short 1 + essay 7.5 = 12.5 / 16
    const mine = await fx.studentAgents[0].get(`/api/my/results/${fx.examId}`);
    expect(mine.status).toBe(200);
    expect(mine.body.result).toMatchObject({ totalScore: 12.5, maxScore: 16, percentage: 78.13, letterGrade: "C", answerReviewAllowed: false, publicationNumber: 1 });
    expect(mine.body.result.questions.find((q: any) => q.type === "ESSAY")).toMatchObject({ awardedMarks: 7.5, feedback: "Good structure" });
    // No correct answers without permission.
    expect(JSON.stringify(mine.body)).not.toMatch(/isCorrect|acceptedAnswers/);

    // Grading is closed while published.
    const anyShort = queue.body.items.find((i: any) => i.type === "SHORT_ANSWER");
    expect((await lec.put(`/api/grading/answers/${anyShort.answerId}/marks`).send({ marks: 2 })).body.error.code).toBe("RESULTS_PUBLISHED");

    const slip = await fx.studentAgents[0].get(`/api/my/results/${fx.examId}/slip.pdf?lang=en`);
    expect(slip.status).toBe(200);
    expect(slip.headers["content-type"]).toBe("application/pdf");
    expect(slip.body.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("keeps every publication, needs a reason to republish and notifies only students whose result changed", async () => {
    const fx = await openExam({ students: 2, allowAnswerReview: true });
    const [attemptA, attemptB] = await sitAndSubmit(fx);
    const lec = fx.lecturerAgent;
    await markAllEssays(lec, fx.examId, [5, 5]);
    const queue = await lec.get(`/api/exams/${fx.examId}/grading?status=NEEDS_REVIEW`);
    for (const item of queue.body.items) await lec.put(`/api/grading/answers/${item.answerId}/marks`).send({ marks: 0 });
    await lec.post(`/api/exams/${fx.examId}/results/publish`).send({});

    // Reopen, regrade student A's short answer, republish.
    expect((await lec.post(`/api/exams/${fx.examId}/results/reopen`).send({})).status).toBe(400);
    expect((await lec.post(`/api/exams/${fx.examId}/results/reopen`).send({ reason: "Review request" })).body.resultsStatus).toBe("REOPENED");
    // While reopened the student still sees publication 1.
    expect((await fx.studentAgents[0].get(`/api/my/results/${fx.examId}`)).body.result.publicationNumber).toBe(1);
    const itemA = queue.body.items.find((i: any) => i.attemptId === attemptA);
    await lec.put(`/api/grading/answers/${itemA.answerId}/marks`).send({ marks: 2 });
    const noReason = await lec.post(`/api/exams/${fx.examId}/results/publish`).send({});
    expect(noReason.body.error.code).toBe("PUBLICATION_REASON_REQUIRED");
    const again = await lec.post(`/api/exams/${fx.examId}/results/publish`).send({ reason: "Short answer re-marked after review" });
    expect(again.body).toMatchObject({ publicationNumber: 2, notifiedStudents: 1 });

    const changedSms = await prisma.smsOutbox.findMany({ where: { relatedId: fx.examId, templateKey: "RESULTS_CHANGED" } });
    expect(changedSms.map((m) => m.recipientId)).toEqual([fx.students[0].id]);
    const revisions = await prisma.gradeRevision.findMany({ where: { attemptId: { in: [attemptA, attemptB] } }, orderBy: [{ attemptId: "asc" }, { revisionNumber: "asc" }] });
    expect(revisions).toHaveLength(4);
    const a = revisions.filter((r) => r.attemptId === attemptA).map((r) => Number(r.totalScore));
    expect(a[1] - a[0]).toBe(2);
    // History rows cannot be changed, even by the application role.
    await expect(prisma.gradeRevision.update({ where: { id: revisions[0].id }, data: { letterGrade: "A" } })).rejects.toThrow();

    // With review allowed, the student sees the correct answers.
    const mine = await fx.studentAgents[0].get(`/api/my/results/${fx.examId}`);
    expect(mine.body.result.publicationNumber).toBe(2);
    const mcq = mine.body.result.questions.find((q: any) => q.type === "MCQ");
    expect(mcq.options.filter((o: any) => o.isCorrect)).toHaveLength(1);
  });

  it("exports grades as CSV including absent students", async () => {
    const fx = await openExam({ students: 2 });
    const t = (await fx.studentAgents[0].post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
    await fx.studentAgents[0].post(`/api/attempts/${t.id}/submit`);
    const csv = await fx.lecturerAgent.get(`/api/exams/${fx.examId}/grades.csv?lang=en`);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("Student number,Student name,Status,Score");
    expect(csv.text).toContain(fx.students[1].studentNumber!);
    expect(csv.text).toContain("Absent");
    const so = await fx.lecturerAgent.get(`/api/exams/${fx.examId}/grades.csv?lang=so`);
    expect(so.text).toContain("Lambarka ardayga");
    expect((await fx.studentAgents[0].get(`/api/exams/${fx.examId}/grades.csv`)).status).toBe(403);
  });
});

describe("blind second grading (D7)", () => {
  it("hides each grader's marks from the other, averages close marks and flags a gap over 20%", async () => {
    const fx = await openExam({ students: 2, secondGrader: true });
    await sitAndSubmit(fx);
    const first = fx.lecturerAgent;
    const second = await loginAs(fx.secondGrader!);

    const secondQueue = await second.get(`/api/exams/${fx.examId}/grading`);
    expect(secondQueue.body.role).toBe("SECOND");
    expect(secondQueue.body.items).toHaveLength(2);
    expect(secondQueue.body.items.every((i: any) => i.type === "ESSAY" && i.student.anonymousCode && !i.student.fullName)).toBe(true);
    // The second grader cannot grade other answer types.
    const firstQueue = await first.get(`/api/exams/${fx.examId}/grading?status=NEEDS_REVIEW`);
    expect((await second.get(`/api/grading/answers/${firstQueue.body.items[0].answerId}`)).status).toBe(404);

    const [e1, e2] = secondQueue.body.items;
    await markAllEssays(first, fx.examId, [4, 4]); // FIRST: 8 / 10 for both
    let after = await first.get(`/api/grading/answers/${e1.answerId}`);
    expect(after.body.answer.gradingStatus).toBe("AWAITING_SECOND_GRADE");
    const blind = await second.get(`/api/grading/answers/${e1.answerId}`);
    expect(blind.body.answer.marks).toEqual([]);
    expect(blind.body.answer.student.fullName).toBeUndefined();

    const rubric = blind.body.answer.question.rubric;
    // Close: 7 vs 8 -> average 7.5.
    await second.put(`/api/grading/answers/${e1.answerId}/essay`).send({ criteria: [{ criterionId: rubric[0].id, marks: 3.5 }, { criterionId: rubric[1].id, marks: 3.5 }] });
    after = await first.get(`/api/grading/answers/${e1.answerId}`);
    expect(after.body.answer).toMatchObject({ gradingStatus: "GRADED", marksAwarded: 7.5 });
    expect(after.body.answer.marks).toHaveLength(2);

    // Far apart: 3 vs 8 (gap 5 > 2) -> DISCREPANCY, settled by the course lecturer.
    const r2 = (await second.get(`/api/grading/answers/${e2.answerId}`)).body.answer.question.rubric;
    await second.put(`/api/grading/answers/${e2.answerId}/essay`).send({ criteria: [{ criterionId: r2[0].id, marks: 1.5 }, { criterionId: r2[1].id, marks: 1.5 }] });
    after = await first.get(`/api/grading/answers/${e2.answerId}`);
    expect(after.body.answer.gradingStatus).toBe("DISCREPANCY");
    expect((await second.post(`/api/grading/answers/${e2.answerId}/resolve`).send({ marks: 6 })).status).toBe(404);
    const resolved = await first.post(`/api/grading/answers/${e2.answerId}/resolve`).send({ marks: 6 });
    expect(resolved.body.answer).toMatchObject({ gradingStatus: "GRADED", marksAwarded: 6 });
  });
});
