/**
 * Language settings (6.8): Somali by default, English available, nothing else (3 tests).
 */
import { describe, expect, it } from "vitest";
import { expectDbError, useRollbackDb } from "../helpers/db.mjs";
import { createUser } from "../helpers/fixtures.mjs";

describe("language settings", () => {
  const db = useRollbackDb();

  it("gives new users Somali by default", async () => {
    const user = await createUser(db, "STUDENT");
    expect(user.preferred_language).toBe("so");
  });

  it("lets a user switch to English", async () => {
    const user = await createUser(db, "STUDENT");
    const row = await db.one(`UPDATE users SET preferred_language = 'en' WHERE id = $1 RETURNING preferred_language`, [user.id]);
    expect(row.preferred_language).toBe("en");
  });

  it("rejects an unsupported language", async () => {
    const user = await createUser(db, "STUDENT");
    await expectDbError(db, () => db.q(`UPDATE users SET preferred_language = 'fr' WHERE id = $1`, [user.id]), "22P02");
  });
});
