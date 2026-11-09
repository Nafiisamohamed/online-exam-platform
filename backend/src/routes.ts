/**
 * Mounts every module's router under /api. The full endpoint list with
 * requests and responses is in docs/api.md.
 */
import { Router } from "express";
import { databaseReachable } from "./db/prisma.ts";
import { now } from "./db/clock.ts";
import { academicRouter } from "./modules/academic/academic.routes.ts";
import { feesRouter } from "./modules/fees/fees.routes.ts";
import { analyticsRouter } from "./modules/analytics/analytics.routes.ts";
import { attemptsRouter } from "./modules/attempts/attempts.routes.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";
import { coursesRouter, facultiesRouter } from "./modules/courses/courses.routes.ts";
import { examsRouter, schedulesRouter } from "./modules/exams/exams.routes.ts";
import { gradingRouter } from "./modules/grading/grading.routes.ts";
import { gradingScaleRouter } from "./modules/grading-scale/grading-scale.routes.ts";
import { importsRouter } from "./modules/imports/imports.routes.ts";
import { invigilationRouter } from "./modules/invigilation/invigilation.routes.ts";
import { messagesRouter } from "./modules/messages/messages.routes.ts";
import { paymentsRouter } from "./modules/payments/payments.routes.ts";
import { questionsRouter } from "./modules/questions/questions.routes.ts";
import { roomsRouter } from "./modules/rooms/rooms.routes.ts";
import { staffRouter, usersRouter } from "./modules/users/users.routes.ts";

export const apiRouter = Router();

/**
 * GET /api/health - no login needed.
 * Response 200: { status: "ok", database: "ok", serverTime } or 503 when the database is unreachable.
 * serverTime lets the frontend show the server clock (4.7).
 */
apiRouter.get("/health", async (_req, res) => {
  const ok = await databaseReachable();
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "error", database: ok ? "ok" : "unreachable", serverTime: now().toISOString() });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/staff", staffRouter);
// Academic years, faculty lecturers (/faculties/:id/lecturers), registrations, /my/academic, /my/faculties.
apiRouter.use(academicRouter);
// Semester fees, fee status and reminders, /my/fees.
apiRouter.use(feesRouter);
// Question bank routes include /courses/:courseId/... and /imports/templates/...,
// so they are mounted before the course and import routers.
apiRouter.use(questionsRouter);
apiRouter.use("/faculties", facultiesRouter);
apiRouter.use("/courses", coursesRouter);
apiRouter.use("/rooms", roomsRouter);
apiRouter.use("/grading-scale", gradingScaleRouter);
apiRouter.use("/imports", importsRouter);
// Student routes include /exams/:examId/attempts, so they come before the staff exam router.
apiRouter.use(attemptsRouter);
apiRouter.use(gradingRouter);
apiRouter.use(analyticsRouter);
apiRouter.use("/exams", examsRouter);
apiRouter.use("/schedules", schedulesRouter);
apiRouter.use("/invigilation", invigilationRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use(messagesRouter);
