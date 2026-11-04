/**
 * Examination rooms and their campus network ranges (section 4.5).
 * Room names are unique; network ranges are validated CIDR ranges (also checked by the database).
 */
import type { Request } from "express";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { prisma, transaction } from "../../db/prisma.ts";
import { conflict, notFound } from "../../lib/errors.ts";
import { audit } from "../../services/audit.ts";

export function listRooms() {
  return prisma.room.findMany({ orderBy: { name: "asc" } });
}

function nameTaken(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict("ROOM_NAME_TAKEN", "A room with this name exists");
  throw error;
}

/** @throws 409 ROOM_NAME_TAKEN */
export async function createRoom(data: { name: string; building: string; networkRanges: string[] }, actorId: string, req: Request) {
  try {
    return await transaction(async (tx) => {
      const r = await tx.room.create({ data });
      await audit(tx, { actorId, action: "ROOM_CREATED", entityType: "room", entityId: r.id, details: { name: r.name }, req });
      return r;
    });
  } catch (error) {
    nameTaken(error);
  }
}

/** @throws 404 ROOM_NOT_FOUND, 409 ROOM_NAME_TAKEN */
export async function updateRoom(id: string, data: { name?: string; building?: string; networkRanges?: string[] }, actorId: string, req: Request) {
  if (!(await prisma.room.findUnique({ where: { id } }))) throw notFound("ROOM_NOT_FOUND");
  try {
    return await transaction(async (tx) => {
      const r = await tx.room.update({ where: { id }, data });
      await audit(tx, { actorId, action: "ROOM_UPDATED", entityType: "room", entityId: id, details: { fields: Object.keys(data) }, req });
      return r;
    });
  } catch (error) {
    nameTaken(error);
  }
}
