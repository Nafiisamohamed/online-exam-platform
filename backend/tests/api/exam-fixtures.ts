/**
 * Builds a ready-to-sit exam for the attempt, invigilation, grading and
 * payment tests: a lecturer with a question bank, enrolled students, a
 * published exam and an APPROVED schedule whose window is open now.
 * (The schedule is written directly, because the approval endpoint only
 * accepts windows that start in the future.)
 */
import { addQuestions, createCourse, createUser, enrol, loginAs, prisma, testAcademicYear, userAgent } from "./helpers.ts";

export interface OpenExamOptions {
  students?: number;
  examType?: "QUIZ" | "MIDTERM" | "FINAL";
  /** Minutes the window has been open already. */
  openedMinutesAgo?: number;
  windowMinutes?: number;
  durationMinutes?: number;
  feeAmount?: number;
  /** Phase 4: a semester fee for the course's year and semester; every student is registered for it. */
  semesterFee?: number;
  networkRanges?: string[];
  rules?: { questionType: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY"; difficulty: "EASY" | "MEDIUM" | "HARD"; marksPerQuestion: number; questionCount: number; poolSize: number }[];
  secondGrader?: boolean;
  allowAnswerReview?: boolean;
  invigilators?: number;
}

const DEFAULT_RULES: NonNullable<OpenExamOptions["rules"]> = [
  { questionType: "MCQ", difficulty: "EASY", marksPerQuestion: 1, questionCount: 3, poolSize: 8 },
  { questionType: "TRUE_FALSE", difficulty: "MEDIUM", marksPerQuestion: 1, questionCount: 1, poolSize: 3 },
  { questionType: "SHORT_ANSWER", difficulty: "MEDIUM", marksPerQuestion: 2, questionCount: 1, poolSize: 3 },
  { questionType: "ESSAY", difficulty: "HARD", marksPerQuestion: 10, questionCount: 1, poolSize: 3 },
];

export async function openExam(o: OpenExamOptions = {}) {
  const [lecturer, lecturerAgent] = await userAgent("LECTURER");
  const course = await createCourse(lecturer.id);
  const rules = o.rules ?? DEFAULT_RULES;
  for (const r of rules) await addQuestions(lecturerAgent, course.id, r.poolSize, { type: r.questionType, difficulty: r.difficulty, marks: r.marksPerQuestion });
  const secondGrader = o.secondGrader ? await createUser("LECTURER") : null;
  const created = await lecturerAgent.post("/api/exams").send({
    examType: o.examType ?? "QUIZ",
    courseId: course.id,
    title: "Fixture Exam",
    feeAmount: o.feeAmount ?? 0,
    feeCurrency: "USD",
    allowAnswerReview: o.allowAnswerReview ?? false,
    secondGraderId: secondGrader?.id,
    rules: rules.map(({ poolSize: _p, ...r }) => r),
  });
  if (created.status !== 201) throw new Error(`exam create failed ${JSON.stringify(created.body)}`);
  const examId: string = created.body.exam.id;
  await lecturerAgent.post(`/api/exams/${examId}/publish`);

  const opened = o.openedMinutesAgo ?? 5;
  const windowStart = new Date(Date.now() - opened * 60_000);
  const windowEnd = new Date(windowStart.getTime() + (o.windowMinutes ?? 120) * 60_000);
  const admin = await createUser("ADMIN");
  const invigilators = await Promise.all(Array.from({ length: o.invigilators ?? 1 }, () => createUser("INVIGILATOR")));
  const room = o.networkRanges ? await prisma.room.create({ data: { name: `Room ${examId}`, building: "Main", networkRanges: o.networkRanges } }) : null;
  const schedule = await prisma.examSchedule.create({
    data: {
      examId, requestedById: lecturer.id, decidedById: admin.id, decidedAt: new Date(), status: "APPROVED",
      windowStart, windowEnd, durationMinutes: o.durationMinutes ?? 60,
      rooms: room ? { create: [{ roomId: room.id }] } : undefined,
      invigilators: { create: invigilators.map((i) => ({ invigilatorId: i.id })) },
    },
  });

  const students = await Promise.all(Array.from({ length: o.students ?? 2 }, () => createUser("STUDENT")));
  await enrol(course.id, ...students.map((s) => s.id));
  const studentAgents = await Promise.all(students.map((s) => loginAs(s)));
  let semesterFeeId: string | null = null;
  if (o.semesterFee) {
    const year = await testAcademicYear();
    await prisma.course.update({ where: { id: course.id }, data: { academicYearId: year.id, semesterNumber: 1 } });
    for (const s of students) await prisma.studentRegistration.create({ data: { studentId: s.id, academicYearId: year.id, facultyId: course.facultyId, semesterNumber: 1 } });
    semesterFeeId = (await prisma.semesterFee.create({ data: { academicYearId: year.id, facultyId: course.facultyId, semesterNumber: 1, amount: o.semesterFee, currency: "USD" } })).id;
  }
  return { lecturer, lecturerAgent, course, examId, schedule, students, studentAgents, invigilators, secondGrader, semesterFeeId };
}

/** Correct option id and accepted answers of every question version in an attempt. */
export async function answerKey(attemptId: string) {
  const qs = await prisma.attemptQuestion.findMany({
    where: { attemptId },
    include: { questionVersion: { include: { options: true, acceptedAnswers: true } } },
    orderBy: { position: "asc" },
  });
  return qs.map((q) => ({
    attemptQuestionId: q.id,
    type: q.questionVersion.type,
    correctOptionId: q.questionVersion.options.find((o) => o.isCorrect)?.id ?? null,
    wrongOptionId: q.questionVersion.options.find((o) => !o.isCorrect)?.id ?? null,
    accepted: q.questionVersion.acceptedAnswers.map((a) => a.answerText),
  }));
}

/** Moves an attempt's deadline (base deadline and start too, keeping the database rules). */
export async function setDeadline(attemptId: string, deadline: Date) {
  const a = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const base = new Date(deadline.getTime() - a.totalExtensionMinutes * 60_000);
  const startedAt = new Date(Math.min(a.startedAt.getTime(), base.getTime() - 60_000));
  await prisma.examAttempt.update({ where: { id: attemptId }, data: { startedAt, baseDeadline: base, deadline } });
}
