/** Question bank, versioning, images and CSV question import (4.2, 4.3). */
import { describe, expect, it } from "vitest";
import { addQuestions, createCourse, prisma, questionBody, userAgent } from "./helpers.ts";

async function lecturerWithCourse() {
  const [lecturer, agent] = await userAgent("LECTURER");
  const course = await createCourse(lecturer.id);
  return { lecturer, agent, course };
}

describe("question bank", () => {
  it("creates all four question types and checks the rules for each", async () => {
    const { agent, course } = await lecturerWithCourse();
    for (const type of ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"] as const) {
      const res = await agent.post(`/api/courses/${course.id}/questions`).send(questionBody({ type }));
      expect(res.status, type).toBe(201);
      expect(res.body.question.current.versionNumber).toBe(1);
    }
    const bad = await agent.post(`/api/courses/${course.id}/questions`).send({
      ...questionBody({ type: "MCQ" }),
      options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: true }, { text: "C", isCorrect: false }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.errors.map((e: any) => e.code)).toEqual(expect.arrayContaining(["MCQ_OPTION_COUNT", "MCQ_NEEDS_ONE_CORRECT"]));
    const essay = await agent.post(`/api/courses/${course.id}/questions`).send({ ...questionBody({ type: "ESSAY", marks: 10 }), rubric: [{ description: "Only", maxMarks: 4 }] });
    expect(essay.body.error.details.errors[0]).toMatchObject({ code: "RUBRIC_TOTAL_MISMATCH" });
    const short = await agent.post(`/api/courses/${course.id}/questions`).send({ ...questionBody({ type: "SHORT_ANSWER" }), acceptedAnswers: [] });
    expect(short.body.error.details.errors[0].code).toBe("SHORT_ANSWER_NEEDS_ACCEPTED");
  });

  it("refuses duplicate text in the same course, ignoring case and extra spaces", async () => {
    const { agent, course } = await lecturerWithCourse();
    await agent.post(`/api/courses/${course.id}/questions`).send(questionBody({ type: "MCQ", text: "What is a primary key?" }));
    const dup = await agent.post(`/api/courses/${course.id}/questions`).send(questionBody({ type: "MCQ", text: "  what IS a   primary key? " }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_QUESTION");
  });

  it("only lets the course lecturer see or change the question bank", async () => {
    const { agent, course } = await lecturerWithCourse();
    const [q] = await addQuestions(agent, course.id, 1, { type: "MCQ" });
    const [, other] = await userAgent("LECTURER");
    expect((await other.get(`/api/courses/${course.id}/questions`)).status).toBe(404);
    expect((await other.get(`/api/questions/${q.id}`)).status).toBe(404);
    expect((await other.put(`/api/questions/${q.id}`).send(questionBody({ type: "MCQ" }))).status).toBe(404);
    const [, student] = await userAgent("STUDENT");
    expect((await student.get(`/api/questions/${q.id}`)).status).toBe(403);
    const [, admin] = await userAgent("ADMIN");
    expect((await admin.get(`/api/courses/${course.id}/questions`)).status).toBe(403);
  });

  it("edits an unused question in place, but creates a new version once it has been used", async () => {
    const { agent, course } = await lecturerWithCourse();
    const [q] = await addQuestions(agent, course.id, 1, { type: "MCQ" });
    const edit1 = await agent.put(`/api/questions/${q.id}`).send({ ...questionBody({ type: "MCQ" }), text: "Edited before use?" });
    expect(edit1.body.newVersionCreated).toBe(false);
    expect(edit1.body.question.current.versionNumber).toBe(1);

    // Mark version 1 as used by an exam attempt (the database trigger normally does this).
    const v1 = edit1.body.question.current.id;
    await prisma.questionVersion.update({ where: { id: v1 }, data: { isLocked: true, lockedAt: new Date() } });

    const edit2 = await agent.put(`/api/questions/${q.id}`).send({ ...questionBody({ type: "MCQ" }), text: "Edited after use?" });
    expect(edit2.status).toBe(200);
    expect(edit2.body.newVersionCreated).toBe(true);
    expect(edit2.body.question.current.versionNumber).toBe(2);
    expect(edit2.body.question.versions).toHaveLength(2);
    const old = await agent.get(`/api/questions/${q.id}/versions/${v1}`);
    expect(old.body.version.text).toBe("Edited before use?");
  });

  it("archives questions and summarises the bank for building exams", async () => {
    const { agent, course } = await lecturerWithCourse();
    const qs = await addQuestions(agent, course.id, 3, { type: "MCQ", difficulty: "HARD", marks: 3 });
    await agent.post(`/api/questions/${qs[0].id}/archive`);
    const summary = await agent.get(`/api/courses/${course.id}/question-summary`);
    expect(summary.body.items).toEqual([{ type: "MCQ", difficulty: "HARD", marks: 3, count: 2 }]);
    const list = await agent.get(`/api/courses/${course.id}/questions?difficulty=HARD`);
    expect(list.body.total).toBe(2);
  });

  it("accepts real images only", async () => {
    const { agent } = await lecturerWithCourse();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const ok = await agent.post("/api/question-images").attach("image", png, "diagram.png");
    expect(ok.status).toBe(201);
    expect((await agent.get(ok.body.imageUrl)).status).toBe(200);
    const fake = await agent.post("/api/question-images").attach("image", Buffer.from("<script>alert(1)</script>"), "evil.png");
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe("IMAGE_TYPE_NOT_ALLOWED");
  });
});

describe("CSV question import", () => {
  it("previews valid, invalid and duplicate rows, then saves only the valid ones", async () => {
    const { agent, course } = await lecturerWithCourse();
    await agent.post(`/api/courses/${course.id}/questions`).send(questionBody({ type: "MCQ", text: "Already in the bank?" }));
    const header = "type,text,difficulty,marks,topic,option_1,option_2,option_3,option_4,option_5,correct_option,accepted_answers,rubric";
    const csv = [
      header,
      "MCQ,Which key identifies a row?,EASY,2,Keys,Primary,Foreign,Candidate,Super,,1,,",
      "TRUE_FALSE,SQL is case sensitive for keywords.,EASY,1,SQL,,,,,,False,,",
      "SHORT_ANSWER,Expand DBMS.,MEDIUM,2,Basics,,,,,,,Database Management System,",
      '"ESSAY","Explain joins, with examples.",HARD,10,SQL,,,,,,,,Definition:4|Examples:6',
      "MCQ,Two correct options?,EASY,2,Keys,A,B,C,D,,9,,",
      "ESSAY,Bad rubric,HARD,10,SQL,,,,,,,,Only:3",
      "MCQ,  which key IDENTIFIES a row? ,EASY,2,Keys,Primary,Foreign,Candidate,Super,,1,,",
      "MCQ,Already in the bank?,EASY,2,Keys,A,B,C,D,,1,,",
      "QUIZ,Unknown type,EASY,2,Keys,,,,,,,,",
    ].join("\n");
    const preview = await agent.post(`/api/courses/${course.id}/question-imports`).attach("file", Buffer.from(csv), "bank.csv");
    expect(preview.status).toBe(201);
    expect(preview.body.batch).toMatchObject({ totalRows: 9, validRows: 4, invalidRows: 3, duplicateRows: 2 });
    const row = (n: number) => preview.body.rows.find((r: any) => r.row === n);
    expect(row(6).errors.map((e: any) => e.code)).toContain("CORRECT_OPTION_INVALID");
    expect(row(7).errors[0].code).toBe("RUBRIC_TOTAL_MISMATCH");
    expect(row(8)).toMatchObject({ status: "DUPLICATE", errors: [{ code: "DUPLICATE_QUESTION", params: { existingRow: 2 } }] });
    expect(row(9)).toMatchObject({ status: "DUPLICATE", errors: [{ params: { existing: "BANK" } }] });
    expect(row(10).errors.map((e: any) => e.code)).toContain("TYPE_INVALID");
    expect(await prisma.question.count({ where: { courseId: course.id } })).toBe(1);

    const confirm = await agent.post(`/api/imports/${preview.body.batch.id}/confirm`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.savedRows).toBe(4);
    expect(await prisma.question.count({ where: { courseId: course.id } })).toBe(5);
    expect((await agent.post(`/api/imports/${preview.body.batch.id}/confirm`)).status).toBe(409);

    const [, other] = await userAgent("LECTURER");
    expect((await other.get(`/api/imports/${preview.body.batch.id}`)).status).toBe(404);
  });

  it("serves the template", async () => {
    const { agent } = await lecturerWithCourse();
    const res = await agent.get("/api/imports/templates/questions.csv");
    expect(res.status).toBe(200);
    expect(res.text).toContain("type,text,difficulty,marks,topic");
  });
});
