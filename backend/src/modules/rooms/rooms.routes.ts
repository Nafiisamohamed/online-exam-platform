/**
 * Examination rooms (section 4.5): allocated to schedules and checked for clashes.
 * A room may list network ranges for information only; they never restrict access.
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
import { isValidCidr } from "../../lib/network.ts";
import { authenticate, currentUser, requireRole } from "../../middleware/auth.ts";
import { idParams, trimmed, validate } from "../../middleware/validate.ts";
import * as rooms from "./rooms.service.ts";

export const roomsRouter = Router();

const ranges = z
  .array(z.string().trim().refine(isValidCidr, "must be a network range such as 10.10.4.0/24"))
  .max(20);

roomsRouter.use(authenticate());

const capacity = z.number().int().min(1).max(5000).nullable();

/** Query: active=true|false. Lecturers choose from active rooms. */
roomsRouter.get("/", requireRole("ADMIN", "LECTURER"), validate({ query: z.object({ active: z.enum(["true", "false"]).transform((v) => v === "true").optional() }) }), async (req, res) => {
  res.json({ items: await rooms.listRooms(req.valid.query) });
});

/** Response 201: { room }. Errors: 400 VALIDATION_ERROR (bad range), 409 ROOM_NAME_TAKEN. */
roomsRouter.post("/", requireRole("ADMIN"), validate({ body: z.object({ name: trimmed(100), building: trimmed(200), capacity: capacity.optional(), isActive: z.boolean().optional(), networkRanges: ranges.default([]) }) }), async (req, res) => {
  res.status(201).json({ room: await rooms.createRoom(req.valid.body, currentUser(req).id, req) });
});

roomsRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  validate({
    params: idParams,
    body: z.object({ name: trimmed(100).optional(), building: trimmed(200).optional(), capacity: capacity.optional(), isActive: z.boolean().optional(), networkRanges: ranges.optional() }).refine((v) => Object.keys(v).length > 0, "send at least one field"),
  }),
  async (req, res) => {
    res.json({ room: await rooms.updateRoom(req.valid.params.id, req.valid.body, currentUser(req).id, req) });
  },
);
