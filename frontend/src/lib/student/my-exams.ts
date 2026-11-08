/**
 * Grouping of the student's exams by the server's own `state`
 * (attempts.service listMyExams): nothing here decides whether an exam may start.
 */
import type { MyExam } from "@/types/student";

const byStart = (a: MyExam, b: MyExam) => (a.schedule?.windowStart ?? "").localeCompare(b.schedule?.windowStart ?? "");

export function groupMyExams(exams: MyExam[]) {
  return {
    /** Open now, or started and not yet submitted. */
    active: exams.filter((e) => e.state === "OPEN" || e.state === "IN_PROGRESS").sort(byStart),
    upcoming: exams.filter((e) => e.state === "UPCOMING").sort(byStart),
    /** Submitted, or the window closed. */
    done: exams.filter((e) => e.state === "SUBMITTED" || e.state === "TERMINATED" || e.state === "CLOSED").sort((a, b) => byStart(b, a)),
  };
}
