/** Audit log rows (append-only; the database blocks UPDATE and DELETE). */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export function insertAuditLog(data: Prisma.AuditLogUncheckedCreateInput, db: Db = prisma) {
  return db.auditLog.create({ data });
}

const actorSelect = { id: true, fullName: true, email: true, username: true, studentNumber: true, role: { select: { name: true } } } as const;

/** One page of audit entries (newest first) with the acting user, plus the total. */
export function listAuditLogs(where: Prisma.AuditLogWhereInput, skip: number, take: number, db: Db = prisma) {
  return Promise.all([
    db.auditLog.findMany({
      where, orderBy: { createdAt: "desc" }, skip, take,
      include: { actor: { select: actorSelect } },
    }),
    db.auditLog.count({ where }),
  ]);
}

/** Up to `take` entries (newest first) for the Activity History export. */
export function findAuditLogsForExport(where: Prisma.AuditLogWhereInput, take: number, db: Db = prisma) {
  return db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take, include: { actor: { select: actorSelect } } });
}
