// Checks for the Phase 1 foundation: translations, navigation and small helpers.
import { describe, expect, it } from "vitest";
import { initials } from "@/components/ui/avatar";
import { BOOT_SCRIPT } from "@/lib/boot-script";
import { dictionaries, translate, type MessageKey } from "@/lib/i18n/i18n";
import { isActive, NAVIGATION } from "@/lib/navigation";
import { PREVIEW_ACCOUNTS } from "@/lib/preview/demo-accounts";
import { ROLES } from "@/types/account";

/** Every dotted key that points at a text. */
function keys(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("translations", () => {
  it("Somali and English have exactly the same keys", () => {
    expect(keys(dictionaries.so).sort()).toEqual(keys(dictionaries.en).sort());
  });

  it("no text is empty", () => {
    for (const dict of Object.values(dictionaries)) {
      for (const key of keys(dict)) expect(translate(dict, key as MessageKey).trim(), key).not.toBe("");
    }
  });

  it("both languages use the same {placeholders}", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of keys(dictionaries.en)) {
      const k = key as MessageKey;
      expect(vars(translate(dictionaries.so, k)), key).toEqual(vars(translate(dictionaries.en, k)));
    }
  });

  it("fills placeholders and falls back to the key", () => {
    expect(translate(dictionaries.en, "dashboard.greeting", { name: "Hodan" })).toBe("Welcome back, Hodan");
    expect(translate(dictionaries.en, "missing.key" as MessageKey)).toBe("missing.key");
  });
});

describe("navigation", () => {
  it("every role has a menu whose labels all translate", () => {
    for (const role of ROLES) {
      const sections = NAVIGATION[role];
      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        for (const key of [section.title, ...section.items.map((i) => i.label)]) {
          expect(translate(dictionaries.en, key)).not.toBe(key);
        }
      }
    }
  });

  it("links are unique within a role", () => {
    for (const role of ROLES) {
      const hrefs = NAVIGATION[role].flatMap((s) => s.items.map((i) => i.href));
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it("marks nested pages as active without matching look-alike paths", () => {
    expect(isActive("/exams", "/exams")).toBe(true);
    expect(isActive("/exams/12", "/exams")).toBe(true);
    expect(isActive("/exams-archive", "/exams")).toBe(false);
  });
});

describe("helpers", () => {
  it("initials skip titles and use first and last name", () => {
    expect(initials("Dr. Axmed Xirsi Samatar")).toBe("AS");
    expect(initials("Hodan")).toBe("H");
    expect(initials("  ")).toBe("?");
  });

  it("the head script is valid JavaScript", () => {
    expect(() => new Function(BOOT_SCRIPT)).not.toThrow();
  });

  it("there is a preview account for every role", () => {
    for (const role of ROLES) expect(PREVIEW_ACCOUNTS[role]?.role).toBe(role);
  });
});
