// Phase 5 checks: the invigilator screens' constants and texts must match the backend.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/i18n/i18n";
import { DISCONNECTED_AFTER_SECONDS, LIVE_STATUSES, MAX_EXTENSION_MINUTES } from "@/types/invigilator";

const BACKEND = join(__dirname, "../../../../backend/src");
const read = (p: string) => readFileSync(join(BACKEND, p), "utf8");

describe("invigilator rules mirror the backend", () => {
  const service = read("modules/invigilation/invigilation.service.ts");

  it("uses the backend's disconnected interval and extension limit", () => {
    expect(service).toContain(`DISCONNECTED_AFTER_SECONDS = ${DISCONNECTED_AFTER_SECONDS};`);
    expect(service).toContain(`MAX_TOTAL_EXTENSION_MINUTES = ${MAX_EXTENSION_MINUTES};`);
  });

  it("shows exactly the live statuses the backend can return", () => {
    const found = [...service.matchAll(/"(NOT_STARTED|IN_PROGRESS|SUBMITTED|DISCONNECTED|TERMINATED)" as const/g)].map((m) => m[1]);
    expect(new Set(found)).toEqual(new Set(LIVE_STATUSES));
  });

  it("has Somali and English text for every status", () => {
    for (const s of LIVE_STATUSES) {
      expect(dictionaries.en.invigilator.status[s]).toBeTruthy();
      expect(dictionaries.so.invigilator.status[s]).toBeTruthy();
    }
  });

  it("has Somali and English text for every error the invigilation module can return", () => {
    const found = new Set<string>();
    for (const m of service.matchAll(/(?:badRequest|conflict|notFound|unauthorized|forbidden)\("([A-Z_]+)"/g)) found.add(m[1]);
    expect(found.size).toBeGreaterThan(4);
    for (const code of found) {
      expect(dictionaries.en.errors, code).toHaveProperty(code);
      expect(dictionaries.so.errors, code).toHaveProperty(code);
    }
  });
});
