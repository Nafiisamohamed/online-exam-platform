/** Read-only queries behind the analytics endpoints and dashboard charts. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";

/** Submitted attempts of an exam with their working grade and per-question marks. */
export function findSubmittedAttemptsWithMarks(examId: string, db: Db = prisma) {
  return db.examAttempt.findMany({
    where: { examId, status: { in: ["SUBMITTED", "TERMINATED"] } },
    include: {
      grade: true,
      questions: { include: { answer: { select: { marksAwarded: true, gradingStatus: true } }, questionVersion: { select: { type: true } } } },
    },
  });
}

/** Text, difficulty and topic of question versions (for labelling analytics rows). */
export function findVersionLabels(ids: string[], db: Db = prisma) {
  return db.questionVersion.findMany({
    where: { id: { in: ids } },
    select: { id: true, text: true, difficulty: true, versionNumber: true, questionId: true, topic: { select: { name: true } } },
  });
}

export function findCoursesForDashboard(where: Prisma.CourseWhereInput, db: Db = prisma) {
  return db.course.findMany({ where, select: { id: true, code: true, name: true, semester: true } });
}

/** Working grades, exam counts, attempt counts and tab-switch totals for the given courses. */
export function findCourseStatistics(courseIds: string[], db: Db = prisma) {
  return Promise.all([
    db.grade.findMany({
      where: { attempt: { status: { in: ["SUBMITTED", "TERMINATED"] }, exam: { courseId: { in: courseIds } } } },
      select: { percentage: true, totalScore: true, maxScore: true, attempt: { select: { exam: { select: { courseId: true } } } } },
    }),
    db.exam.groupBy({ by: ["status", "resultsStatus"], where: { courseId: { in: courseIds } }, _count: { _all: true } }),
    db.examAttempt.groupBy({ by: ["status", "submissionType"], where: { exam: { courseId: { in: courseIds } } }, _count: { _all: true } }),
    db.examAttempt.aggregate({ where: { exam: { courseId: { in: courseIds } } }, _sum: { countedFocusLosses: true }, _count: { _all: true } }),
  ]);
}

/** Admin-only totals: payments per provider and status, users per role, SMS per status. */
export function findAdminTotals(db: Db = prisma) {
  return Promise.all([
    db.payment.groupBy({ by: ["provider", "status"], _count: { _all: true }, _sum: { amount: true } }),
    db.user.groupBy({ by: ["roleId"], _count: { _all: true } }),
    db.smsOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
    db.role.findMany(),
  ]);
}
