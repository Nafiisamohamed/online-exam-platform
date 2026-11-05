// Checks for the Phase 2 admin logic: form rules, exam stages, report figures and error messages.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError, query } from "@/lib/api/client";
import { errorText, importErrorText } from "@/lib/i18n/error-text";
import { dictionaries, translate, type MessageKey } from "@/lib/i18n/i18n";
import type { AdminDashboard, Course, ExamListItem } from "@/types/admin";
import { examState, splitApprovedSchedules } from "./exam-state";
import { accountsWithRole, hasScores, participation, submissionSummary, upcomingExams } from "./report-data";
import { checks, normalizeSomaliPhone } from "./validation";

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(dictionaries.en, key, vars);
const NOW = Date.parse("2026-11-05T09:00:00Z");
const hours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

function exam(partial: Partial<ExamListItem> = {}): ExamListItem {
  return {
    id: "e1", title: "Midterm", course: { id: "c1", code: "CS201", name: "Databases", semester: "2026-Fall" },
    status: "PUBLISHED", resultsStatus: "UNPUBLISHED", feeAmount: 0, feeCurrency: "USD", schedules: [], attempts: 0, isSecondGrader: false,
    ...partial,
  };
}
const schedule = (status: "REQUESTED" | "APPROVED", start: number, end: number) => ({ id: `s${start}`, status, windowStart: hours(start), windowEnd: hours(end), durationMinutes: 60 });

describe("form rules match the backend", () => {
  it("normalises Somali mobile numbers like backend/src/lib/phone.ts", () => {
    expect(normalizeSomaliPhone("0615123401")).toBe("+252615123401");
    expect(normalizeSomaliPhone("615123401")).toBe("+252615123401");
    expect(normalizeSomaliPhone("+252 61 512 3401")).toBe("+252615123401");
    expect(normalizeSomaliPhone("00252715123401")).toBe("+252715123401");
    expect(normalizeSomaliPhone("252615123401")).toBe("+252615123401");
    expect(normalizeSomaliPhone("+252515123401")).toBeNull(); // landline prefix
    expect(normalizeSomaliPhone("12345")).toBeNull();
  });

  it("checks codes, semesters and student numbers with the API's patterns", () => {
    expect(checks.code("CS-201")).toBeNull();
    expect(checks.code("C")).toBe("validation.code");
    expect(checks.semester("2026-Fall")).toBeNull();
    expect(checks.semester("Fall 2026")).toBe("validation.semester");
    expect(checks.studentNumber("DEMO-2026-0001")).toBeNull();
    expect(checks.studentNumber("ab")).toBe("validation.studentNumber");
    expect(checks.email("registrar@uni-demo.test")).toBeNull();
    expect(checks.email("not-an-email")).toBe("validation.email");
    expect(checks.required("  ")).toBe("validation.required");
  });

  it("builds query strings from the defined values only", () => {
    expect(query({ role: "STUDENT", search: "", active: false, page: 2, x: undefined })).toBe("?role=STUDENT&active=false&page=2");
    expect(query({})).toBe("");
  });
});

describe("exam stages", () => {
  it("follows the exam status and its schedule", () => {
    expect(examState(exam({ status: "DRAFT" }), NOW)).toBe("DRAFT");
    expect(examState(exam(), NOW)).toBe("NOT_SCHEDULED");
    expect(examState(exam({ schedules: [schedule("REQUESTED", 24, 26)] }), NOW)).toBe("AWAITING_APPROVAL");
    expect(examState(exam({ schedules: [schedule("APPROVED", 24, 26)] }), NOW)).toBe("UPCOMING");
    expect(examState(exam({ schedules: [schedule("APPROVED", -1, 1)] }), NOW)).toBe("OPEN");
    expect(examState(exam({ schedules: [schedule("APPROVED", -5, -3)] }), NOW)).toBe("COMPLETED");
  });

  it("prefers the approved schedule over a requested one", () => {
    expect(examState(exam({ schedules: [schedule("REQUESTED", 48, 50), schedule("APPROVED", -5, -3)] }), NOW)).toBe("COMPLETED");
  });

  it("lists upcoming exams soonest first", () => {
    const later = exam({ id: "later", schedules: [schedule("APPROVED", 72, 74)] });
    const sooner = exam({ id: "sooner", schedules: [schedule("APPROVED", 2, 4)] });
    const done = exam({ id: "done", schedules: [schedule("APPROVED", -4, -2)] });
    expect(upcomingExams([later, done, sooner], NOW).map((u) => u.exam.id)).toEqual(["sooner", "later"]);
  });

  it("splits schedules into upcoming, open, completed and awaiting approval", () => {
    const base = { exam: { id: "e", title: "", status: "PUBLISHED" as const, course: { id: "c", code: "", name: "" } }, rejectionReason: null, requestedBy: null, decidedBy: null, decidedAt: null, createdAt: hours(-100), rooms: [], invigilators: [] };
    const split = splitApprovedSchedules(
      [{ ...base, ...schedule("APPROVED", 1, 2) }, { ...base, ...schedule("APPROVED", -2, -1) }, { ...base, ...schedule("REQUESTED", 5, 6) }],
      NOW,
    );
    expect([split.upcoming.length, split.open.length, split.completed.length, split.awaitingApproval.length]).toEqual([1, 0, 1, 1]);
  });
});

describe("report figures never invent numbers", () => {
  const dashboard: AdminDashboard = {
    scope: "ALL", averageScoreByCourse: [], scoreDistribution: [{ from: 0, to: 9.99, count: 0 }], examsByStatus: [],
    attemptsBySubmission: [
      { status: "SUBMITTED", submissionType: "MANUAL", count: 6 },
      { status: "SUBMITTED", submissionType: "AUTO_DEADLINE", count: 2 },
      { status: "IN_PROGRESS", submissionType: null, count: 2 },
    ],
    tabSwitches: { attempts: 10, countedFocusLosses: 3 },
    usersByRole: [{ role: "STUDENT", count: 40 }],
  };

  it("tells a missing figure (null) from a real zero", () => {
    expect(accountsWithRole(dashboard, "STUDENT")).toBe(40);
    expect(accountsWithRole(dashboard, "INVIGILATOR")).toBe(0);
    expect(accountsWithRole({ ...dashboard, usersByRole: undefined }, "STUDENT")).toBeNull();
    expect(accountsWithRole(undefined, "STUDENT")).toBeNull();
    expect(hasScores(dashboard.scoreDistribution)).toBe(false);
  });

  it("summarises how attempts were submitted", () => {
    expect(submissionSummary(dashboard)).toEqual({ manual: 6, auto: 2, inProgress: 2, total: 10, completionRate: 80 });
    expect(submissionSummary({ ...dashboard, attemptsBySubmission: [] }).completionRate).toBeNull();
  });

  it("works out participation only for completed exams, with no rate when nobody is enrolled", () => {
    const course = (id: string, activeStudents: number) => [id, { id, activeStudents } as Course] as const;
    const courses = new Map([course("c1", 20), course("c2", 0)]);
    const done1 = exam({ id: "d1", attempts: 15, schedules: [schedule("APPROVED", -4, -2)] });
    const done2 = exam({ id: "d2", attempts: 0, course: { id: "c2", code: "X", name: "X", semester: "2026-Fall" }, schedules: [schedule("APPROVED", -4, -2)] });
    const future = exam({ id: "f", schedules: [schedule("APPROVED", 4, 6)] });
    const rows = participation([done1, done2, future], courses, NOW);
    expect(rows.map((r) => [r.exam.id, r.rate])).toEqual([["d1", 75], ["d2", null]]);
  });
});

describe("error messages", () => {
  it("translates API codes and fills their details", () => {
    expect(errorText(t, new ApiError(409, "COURSE_EXISTS", "x"))).toBe(dictionaries.en.errors.COURSE_EXISTS);
    expect(errorText(t, new ApiError(400, "CSV_MISSING_COLUMNS", "x", { missing: ["phone", "course_codes"] }))).toContain("phone, course_codes");
    expect(errorText(t, new ApiError(404, "SOMETHING_NEW", "x"))).toBe(dictionaries.en.errors.NOT_FOUND);
    expect(errorText(t, new ApiError(500, "SOMETHING_NEW", "x"))).toBe(dictionaries.en.errors.generic);
    expect(errorText(t, new Error("boom"))).toBe(dictionaries.en.errors.generic);
  });

  it("translates CSV row problems, including exam clashes", () => {
    expect(importErrorText(t, { code: "COURSE_NOT_FOUND", params: { code: "CS999" } })).toContain("CS999");
    expect(importErrorText(t, { code: "SCHEDULE_CONFLICT", params: { course: "CS201", exam: "Midterm", otherCourse: "CS105", otherExam: "Final" } })).toContain("CS105");
    expect(importErrorText(t, { code: "UNKNOWN_CODE" })).toBe("UNKNOWN_CODE");
  });

  it("has a Somali text for every handled API error code", () => {
    for (const code of Object.keys(dictionaries.en.errors)) {
      expect(translate(dictionaries.so, `errors.${code}` as MessageKey), code).not.toBe(`errors.${code}`);
    }
  });
});

describe("coverage of backend codes", () => {
  /** Every .ts file of the backend source (the backend is the source of truth). */
  function backendSources(dir = join(__dirname, "../../../../backend/src")): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === "generated" ? [] : backendSources(join(dir, e.name))) : e.name.endsWith(".ts") ? [readFileSync(join(dir, e.name), "utf8")] : [],
    );
  }

  it("translates every audit action the backend writes", () => {
    const codes = new Set<string>();
    for (const src of backendSources()) {
      for (const m of src.matchAll(/action: ([^,}\n]+)/g)) for (const c of m[1].matchAll(/"([A-Z]+_[A-Z_]+)"/g)) codes.add(c[1]);
    }
    expect(codes.size).toBeGreaterThan(30);
    for (const code of codes) {
      expect(dictionaries.en.admin.audit.actions, code).toHaveProperty(code);
      expect(dictionaries.so.admin.audit.actions, code).toHaveProperty(code);
    }
  });
});
