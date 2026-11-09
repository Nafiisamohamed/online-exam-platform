// Checks for the Phase 4 student logic: the server-synced exam clock, exam grouping and backend error coverage.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dictionaries } from "@/lib/i18n/i18n";
import type { MyExam } from "@/types/student";
import { formatClock, newUuid, remainingAt, syncPoint, timerLevel, untilParts } from "./exam-clock";
import { groupMyExams } from "./my-exams";

describe("exam clock follows the server, not the device", () => {
  afterEach(() => vi.useRealTimers());

  it("counts down from the server's remainingSeconds with a monotonic clock", () => {
    const sync = syncPoint(600, 1000); // the server said 600 s at performance.now() = 1000 ms
    expect(remainingAt(sync, 1000)).toBe(600);
    expect(remainingAt(sync, 1000 + 59_500)).toBe(541);
    expect(remainingAt(sync, 1000 + 600_000)).toBe(0);
    expect(remainingAt(sync, 1000 + 900_000)).toBe(0); // never negative
  });

  it("is not affected by changing the device date", () => {
    const sync = syncPoint(300, 5000);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z")); // a student moves their clock years ahead
    expect(remainingAt(sync, 5000 + 10_000)).toBe(290);
  });

  it("takes a new server value (e.g. an invigilator extension) as the new truth", () => {
    let sync = syncPoint(120, 0);
    expect(remainingAt(sync, 60_000)).toBe(60);
    sync = syncPoint(60 + 5 * 60, 60_000); // heartbeat after a 5-minute extension
    expect(remainingAt(sync, 60_000)).toBe(360);
  });

  it("formats the clock and follows the server's warning points", () => {
    expect(formatClock(3909)).toBe("1:05:09");
    expect(formatClock(724)).toBe("12:04");
    expect(formatClock(42)).toBe("0:42");
    expect([timerLevel(601), timerLevel(600), timerLevel(60)]).toEqual(["normal", "ten", "one"]);
  });

  it("counts down to a window opening in server time", () => {
    const now = Date.parse("2026-11-06T09:00:00Z");
    expect(untilParts("2026-11-06T10:05:09Z", now)).toMatchObject({ hours: 1, minutes: 5, seconds: 9, total: 3909 });
    expect(untilParts("2026-11-06T08:00:00Z", now).total).toBe(0);
  });

  it("makes v4 UUIDs, also on plain-http pages without crypto.randomUUID", () => {
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newUuid()).toMatch(v4);
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 50 }, newUuid));
      expect([...ids].every((id) => v4.test(id)) && ids.size === 50).toBe(true);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});

describe("exam grouping uses the server's states only", () => {
  const exam = (id: string, state: MyExam["state"], start: string): MyExam => ({
    id, title: id, examType: "QUIZ", eligibility: { eligible: true, reason: "NO_OFFERING", examType: "QUIZ", requiredPercent: 30, fee: null, paid: 0, outstanding: 0, requiredAmount: 0, stillToPay: 0 }, instructions: "", course: { id: "c", code: "C", name: "C" }, totalQuestions: 1, totalMarks: 1,
    schedule: { id: `s${id}`, windowStart: start, windowEnd: start, durationMinutes: 30 },
    fee: { amount: 0, currency: "USD", required: false, paid: true, receiptNumber: null }, attempt: null, resultsPublished: false, state, canStart: state === "OPEN",
  });

  it("splits open / in progress, upcoming and completed", () => {
    const g = groupMyExams([
      exam("late", "UPCOMING", "2026-12-02T09:00:00Z"),
      exam("soon", "UPCOMING", "2026-11-20T09:00:00Z"),
      exam("now", "OPEN", "2026-11-06T08:00:00Z"),
      exam("mine", "IN_PROGRESS", "2026-11-06T07:00:00Z"),
      exam("done", "SUBMITTED", "2026-10-01T09:00:00Z"),
      exam("missed", "CLOSED", "2026-10-15T09:00:00Z"),
    ]);
    expect(g.active.map((e) => e.id)).toEqual(["mine", "now"]);
    expect(g.upcoming.map((e) => e.id)).toEqual(["soon", "late"]);
    expect(g.done.map((e) => e.id)).toEqual(["missed", "done"]);
  });
});

describe("coverage of backend codes", () => {
  const BACKEND = join(__dirname, "../../../../backend/src");
  it("has Somali and English text for every error of the attempts and payments modules", () => {
    const found = new Set<string>();
    for (const dir of ["modules/attempts", "modules/payments", "services"]) {
      for (const f of readdirSync(join(BACKEND, dir)).filter((n) => n.endsWith(".ts"))) {
        const src = readFileSync(join(BACKEND, dir, f), "utf8");
        for (const m of src.matchAll(/(?:badRequest|conflict|notFound|unauthorized|forbidden)\("([A-Z_]+)"/g)) found.add(m[1]);
        for (const m of src.matchAll(/new AppError\(\d+, "([A-Z_]+)"/g)) found.add(m[1]);
      }
    }
    expect(found.size).toBeGreaterThan(15);
    for (const code of found) {
      expect(dictionaries.en.errors, code).toHaveProperty(code);
      expect(dictionaries.so.errors, code).toHaveProperty(code);
    }
  });
});
