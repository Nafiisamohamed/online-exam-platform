/** CSV import batches (preview and history). */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export function insertImportBatch(data: Prisma.ImportBatchUncheckedCreateInput, db: Db = prisma) {
  return db.importBatch.create({ data });
}

export function findImportBatch(id: string, db: Db = prisma) {
  return db.importBatch.findUnique({ where: { id }, include: { course: true } });
}

/** Locks the batch row (FOR UPDATE) and returns its status, so two confirms cannot run at once. */
export async function lockImportBatch(id: string, db: Db) {
  const rows = await db.$queryRaw<{ status: string }[]>`SELECT status::text FROM import_batches WHERE id = ${id}::uuid FOR UPDATE`;
  return rows[0]?.status ?? null;
}

export function markImportConfirmed(
  id: string,
  counts: { totalRows: number; validRows: number; invalidRows: number; duplicateRows?: number },
  rowResults: object,
  db: Db = prisma,
) {
  return db.importBatch.update({ where: { id }, data: { status: "CONFIRMED", ...counts, rowResults } });
}
