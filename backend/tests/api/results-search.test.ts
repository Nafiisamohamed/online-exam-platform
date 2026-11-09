/** Phase 5: the registrar's read-only results search, and that the registrar cannot publish, reopen or change marks. */
import { describe, expect, it } from "vitest";
import { openExam } from "./exam-fixtures.ts";
import { prisma, userAgent } from "./helpers.ts";

const MCQ_ONLY = [{ questionType: "MCQ" as const, difficulty: "EASY" as const, marksPerQuestion: 1, questionCount: 2, poolSize: 3 }];

describe("registrar results search", () => {
  it("finds results by every filter, read only", async () => {
    const fx = await openExam({ students: 2, rules: MCQ_ONLY, examType: "MIDTERM" });
    for (const agent of fx.studentAgents) {
      const attempt = (await agent.post(`/api/exams/${fx.examId}/attempts`)).body.attempt;
      expect((await agent.post(`/api/attempts/${attempt.id}/submit`)).status).toBe(200);
    }
    const [, admin] = await userAgent("ADMIN");
    const search = (q: Record<string, string | number>) => admin.get("/api/results-search").query(q);

    const byExam = await search({ examId: fx.examId });
    expect(byExam.status).toBe(200);
    expect(byExam.body.total).toBe(2);
    expect(byExam.body.items[0]).toMatchObject({ exam: { id: fx.examId, examType: "MIDTERM", resultsStatus: "UNPUBLISHED" }, course: { id: fx.course.id }, lastPublication: null, revisions: 0 });
    expect(byExam.body.items[0].grade).toMatchObject({ maxScore: 2 });

    const student = await prisma.user.findUniqueOrThrow({ where: { id: fx.students[0].id } });
    const byStudent = await search({ examId: fx.examId, search: student.username.toLowerCase() });
    expect(byStudent.body.items.map((r: any) => r.student.id)).toEqual([student.id]);
    expect((await search({ courseId: fx.course.id, facultyId: fx.course.facultyId, examType: "MIDTERM" })).body.total).toBe(2);
    expect((await search({ courseId: fx.course.id, examType: "QUIZ" })).body.total).toBe(0);
    expect((await search({ examId: fx.examId, publication: "PUBLISHED" })).body.total).toBe(0);

    // The registrar cannot publish, reopen or change marks: that stays with the lecturer.
    const answer = await prisma.answer.findFirstOrThrow({ where: { attempt: { examId: fx.examId } } });
    expect((await admin.post(`/api/exams/${fx.examId}/results/publish`).send({})).status).toBe(403);
    expect((await admin.post(`/api/exams/${fx.examId}/results/reopen`).send({ reason: "x" })).status).toBe(403);
    expect((await admin.put(`/api/grading/answers/${answer.id}/marks`).send({ marks: 0 })).status).toBe(403);

    expect((await fx.lecturerAgent.post(`/api/exams/${fx.examId}/results/publish`).send({})).status).toBe(200);
    const published = await search({ examId: fx.examId, publication: "PUBLISHED" });
    expect(published.body.total).toBe(2);
    expect(published.body.items[0]).toMatchObject({ lastPublication: { publicationNumber: 1 }, revisions: 1 });

    expect((await fx.lecturerAgent.get("/api/results-search")).status).toBe(403);
    expect((await fx.studentAgents[0].get("/api/results-search")).status).toBe(403);
    expect((await search({ semesterNumber: 9 })).status).toBe(400);
  });
});
