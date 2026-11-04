/** Result publications and grade revisions (append-only), and the data the results views read. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { GradingStatus } from "../generated/prisma/enums.ts";

/** Counts that decide whether results can be published: in-progress attempts, unfinished grading per status, submitted attempts. */
export function findPublicationCounts(examId: string, unfinished: GradingStatus[], db: Db = prisma) {
  return Promise.all([
    db.examAttempt.count({ where: { examId, status: "IN_PROGRESS" } }),
    db.answer.groupBy({
      by: ["gradingStatus"],
      where: { attempt: { examId, status: "SUBMITTED" }, gradingStatus: { in: unfinished } },
      _count: { _all: true },
    }),
    db.examAttempt.count({ where: { examId, status: "SUBMITTED" } }),
  ]);
}

export async function nextPublicationNumber(examId: string, db: Db = prisma) {
  const last = await db.resultPublication.aggregate({ where: { examId }, _max: { publicationNumber: true } });
  return (last._max.publicationNumber ?? 0) + 1;
}

export function insertPublication(data: { examId: string; publicationNumber: number; publishedById: string; reason: string | null }, db: Db = prisma) {
  return db.resultPublication.create({ data });
}

/** Submitted attempts with student, question marks and the latest revision, for publishing. */
export function findAttemptsToPublish(examId: string, db: Db = prisma) {
  return db.examAttempt.findMany({
    where: { examId, status: "SUBMITTED" },
    include: {
      student: { select: { id: true, phone: true, preferredLanguage: true, isActive: true } },
      questions: { include: { answer: { select: { marksAwarded: true, gradingStatus: true } } }, orderBy: { position: "asc" } },
      gradeRevisions: { orderBy: { revisionNumber: "desc" }, take: 1 },
    },
  });
}

export function insertRevision(data: Prisma.GradeRevisionUncheckedCreateInput, db: Db = prisma) {
  return db.gradeRevision.create({ data });
}

/** Everything the staff results table needs, in parallel. */
export function findExamResultsData(examId: string, courseId: string, db: Db = prisma) {
  return Promise.all([
    db.examAttempt.findMany({
      where: { examId },
      include: { student: { select: { id: true, studentNumber: true, fullName: true } }, grade: true, gradeRevisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
    }),
    db.user.findMany({
      where: { enrolments: { some: { courseId } } },
      select: { id: true, studentNumber: true, fullName: true, enrolments: { where: { courseId }, select: { status: true } } },
    }),
    db.resultPublication.findMany({ where: { examId }, orderBy: { publicationNumber: "asc" }, include: { publishedBy: { select: { fullName: true } } } }),
  ]);
}

/** All grade revisions of a student's attempts (newest revision first per attempt). */
export function findStudentRevisions(studentId: string, db: Db = prisma) {
  return db.gradeRevision.findMany({
    where: { attempt: { studentId } },
    include: { publication: true, attempt: { select: { examId: true, exam: { select: { title: true, course: { select: { code: true, name: true } } } } } } },
    orderBy: [{ attemptId: "asc" }, { revisionNumber: "desc" }],
  });
}

/** The student's attempt with its latest revision, questions, answers and first-grader comments. */
export function findStudentResult(examId: string, studentId: string, db: Db = prisma) {
  return db.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
    include: {
      exam: { select: { title: true, allowAnswerReview: true, course: { select: { code: true, name: true } } } },
      gradeRevisions: { orderBy: { revisionNumber: "desc" }, take: 1, include: { publication: true } },
      questions: {
        orderBy: { position: "asc" },
        include: {
          answer: { include: { essayMarks: { where: { graderRole: "FIRST" }, select: { comment: true } } } },
          questionVersion: { include: { options: true, acceptedAnswers: true } },
        },
      },
    },
  });
}
