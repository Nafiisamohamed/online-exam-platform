/**
 * Examination rooms and their campus network ranges (section 4.5). See docs/api.md#rooms.
 *
 * GET   /api/rooms       ADMIN, LECTURER (lecturers pick rooms in schedule requests)
 * POST  /api/rooms       ADMIN  { name, building, networkRanges: ["10.10.4.0/24"] }
 * PATCH /api/rooms/:id   ADMIN
 *
 * A student can start an exam only from an address inside one of the ranges
 * of the schedule's rooms (a schedule without rooms allows any address).
 */
import { Router } from "express";
import { z } from "zod";
import { isUniqueViolation } from "../../db/db-errors.ts";
import { prisma, transaction } from "../../db/prisma.ts";
import { conflict, notFound } from "../../lib/errors.ts";
import { isValidCidr } from "../../lib/network.ts";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, trimmed, validate } from "../../middleware/validate.ts";
import { audit } from "../../services/audit.ts";

export const roomsRouter = Router();

const ranges = z
  .array(z.string().trim().refine(isValidCidr, "must be a network range such as 10.10.4.0/24"))
  .min(1, "add at least one network range")
  .max(20);

roomsRouter.use(authenticate());

roomsRouter.get("/", requireRole("ADMIN", "LECTURER"), async (_req, res) => {
  res.json({ items: await prisma.room.findMany({ orderBy: { name: "asc" } }) });
});

/** Response 201: { room }. Errors: 400 VALIDATION_ERROR (bad range), 409 ROOM_NAME_TAKEN. */
roomsRouter.post("/", requireRole("ADMIN"), validate({ body: z.object({ name: trimmed(100), building: trimmed(200), networkRanges: ranges }) }), async (req, res) => {
  try {
    const room = await transaction(async (tx) => {
      const r = await tx.room.create({ data: req.valid.body });
      await audit(tx, { actorId: currentUser(req).id, action: "ROOM_CREATED", entityType: "room", entityId: r.id, details: { name: r.name }, req });
      return r;
    });
    res.status(201).json({ room });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("ROOM_NAME_TAKEN", "A room with this name exists");
    throw error;
  }
});

roomsRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  validate({
    params: idParams,
    body: z.object({ name: trimmed(100).optional(), building: trimmed(200).optional(), networkRanges: ranges.optional() }).refine((v) => Object.keys(v).length > 0, "send at least one field"),
  }),
  async (req, res) => {
    if (!(await prisma.room.findUnique({ where: { id: req.valid.params.id } }))) throw notFound("ROOM_NOT_FOUND");
    try {
      const room = await transaction(async (tx) => {
        const r = await tx.room.update({ where: { id: req.valid.params.id }, data: req.valid.body });
        await audit(tx, { actorId: currentUser(req).id, action: "ROOM_UPDATED", entityType: "room", entityId: r.id, details: { fields: Object.keys(req.valid.body) }, req });
        return r;
      });
      res.json({ room });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("ROOM_NAME_TAKEN", "A room with this name exists");
      throw error;
    }
  },
);
