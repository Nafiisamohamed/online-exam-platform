/**
 * Layered architecture (baseline 6.1): routes -> services -> repositories.
 * Only src/repositories and src/db may use Prisma Client; this test fails if
 * any other file imports the client or calls it.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(import.meta.dirname, "../../src");
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "generated" ? [] : files(p);
    return p.endsWith(".ts") ? [p] : [];
  });
const rel = (p: string) => path.relative(src, p).replace(/\\/g, "/");
const MODELS = "user|role|course|exam|examAttempt|answer|payment|question|questionVersion|questionOption|topic|grade|faculty|enrolment|smsOutbox|notification|auditLog|room|examSchedule|importBatch|resultPublication|gradeRevision|focusEvent|attemptQuestion|essayMark|essayCriterionMark|gradingScale|examRule|timeExtension|invigilatorNote|acceptedAnswer|rubricCriterion";
const PRISMA_CALL = new RegExp(`\\b(prisma|tx|db)\\.(\\$\\w+|(${MODELS})\\b)`);
const PRISMA_IMPORT = /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from/;

describe("layered architecture", () => {
  const all = files(src);

  it("keeps every Prisma call inside src/repositories and src/db", () => {
    const offenders = all
      .filter((f) => !rel(f).startsWith("repositories/") && !rel(f).startsWith("db/"))
      .filter((f) => {
        const code = fs.readFileSync(f, "utf8");
        return PRISMA_CALL.test(code) || PRISMA_IMPORT.test(code);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("lets route files call services only, never repositories", () => {
    const offenders = all.filter((f) => f.endsWith(".routes.ts") && /repositories\//.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(offenders).toEqual([]);
  });
});
