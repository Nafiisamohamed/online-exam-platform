/**
 * Examination rooms (section 4.5): name, building, capacity (may be unknown) and an active flag.
 * Room names are unique; inactive rooms cannot be chosen for new schedules. The old network
 * ranges are kept as they are but no longer restrict anything.
 */
import type { Request } from "express";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { transaction } from "../../db/prisma.ts";
import * as roomsRepo from "../../repositories/schedules.repository.ts";
import { conflict, notFound } from "../../lib/errors.ts";
import { audit } from "../../services/audit.ts";

/** All rooms, by name. */
export function listRooms(q: { active?: boolean } = {}) {
  return roomsRepo.listRooms(q);
}

function nameTaken(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict("ROOM_NAME_TAKEN", "A room with this name exists");
  throw error;
}

/** @throws 409 ROOM_NAME_TAKEN */
export async function createRoom(data: { name: string; building: string; networkRanges?: string[]; capacity?: number | null; isActive?: boolean }, actorId: string, req: Request) {
  try {
    return await transaction(async (tx) => {
      const r = await roomsRepo.insertRoom({ networkRanges: [], ...data }, tx);
      await audit(tx, { actorId, action: "ROOM_CREATED", entityType: "room", entityId: r.id, details: { name: r.name }, req });
      return r;
    });
  } catch (error) {
    nameTaken(error);
  }
}

/** @throws 404 ROOM_NOT_FOUND, 409 ROOM_NAME_TAKEN */
export async function updateRoom(id: string, data: { name?: string; building?: string; networkRanges?: string[]; capacity?: number | null; isActive?: boolean }, actorId: string, req: Request) {
  if (!(await roomsRepo.findRoom(id))) throw notFound("ROOM_NOT_FOUND");
  try {
    return await transaction(async (tx) => {
      const r = await roomsRepo.updateRoom(id, data, tx);
      await audit(tx, { actorId, action: "ROOM_UPDATED", entityType: "room", entityId: id, details: { fields: Object.keys(data) }, req });
      return r;
    });
  } catch (error) {
    nameTaken(error);
  }
}
