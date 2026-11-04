/**
 * Audit log (baseline 6.2): who did what, to which record, and when.
 *
 * Rows are append-only (a database trigger blocks UPDATE and DELETE). Details
 * are stored as JSON; keys that could hold secrets (passwords, PINs, tokens)
 * are removed before saving, whatever the caller passes.
 */
import type { Request } from "express";
import type { Db } from "../db/prisma.ts";
import { clientIp } from "../lib/network.ts";

const SECRET_KEYS = /pass(word)?|pin|token|secret/i;

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([k]) => !SECRET_KEYS.test(k)).map(([k, v]) => [k, scrub(v)]),
    );
  }
  return value;
}

export interface AuditEntry {
  /** null for actions performed by the system (auto-submit, expiry). */
  actorId: string | null;
  /** Stable action code, e.g. RESULTS_PUBLISHED. */
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  /** Pass the request to record the client IP address. */
  req?: Request;
}

/** Writes one audit row (pass the transaction client to keep it atomic with the change). */
export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      actionCode: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      details: entry.details ? (scrub(entry.details) as object) : undefined,
      ipAddress: entry.req ? clientIp(entry.req) : null,
    },
  });
}
