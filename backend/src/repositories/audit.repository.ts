/** Audit log rows (append-only; the database blocks UPDATE and DELETE). */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export function insertAuditLog(data: Prisma.AuditLogUncheckedCreateInput, db: Db = prisma) {
  return db.auditLog.create({ data });
}

/** One page of audit entries (newest first) with the acting user, plus the total. */
export function listAuditLogs(where: Prisma.AuditLogWhereInput, skip: number, take: number, db: Db = prisma) {
  return Promise.all([
    db.auditLog.findMany({
      where, orderBy: { createdAt: "desc" }, skip, take,
      include: { actor: { select: { id: true, fullName: true, email: true, studentNumber: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
}
