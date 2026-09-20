import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { setIntervalOverride, setNextDue, setPaused, recomputeSchedule } from "@/lib/maintenance/planning";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({
  /** Days between services for this one unit. Null clears the override. */
  intervalDays: z.number().int().min(1).max(3650).nullable().optional(),
  /** A one-off move of the next visit, without touching the cadence. */
  nextDueAt: z.string().optional(),
  paused: z.boolean().optional(),
});

/** Edit one unit's schedule: how often, when next, or pause it. */
export const PATCH = route(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("schedule.manage");
  const { id } = await context.params;
  const input = schema.parse(await request.json());

  const schedule = await prisma.maintenanceSchedule.findUnique({
    where: { id },
    include: { equipment: { select: { id: true, organizationId: true, locationId: true } } },
  });
  // Out of scope reads as missing, like every other by-id handler.
  if (!schedule || !canAccessAsset(actor, schedule.equipment)) return fail(404, "Not found");

  if (input.intervalDays !== undefined) {
    await setIntervalOverride(
      { scope: "ASSET", serviceTypeId: schedule.serviceTypeId, equipmentId: schedule.equipmentId },
      input.intervalDays,
      { userId: actor.userId },
    );
  }

  if (input.paused !== undefined) {
    await setPaused(id, input.paused, { userId: actor.userId });
  }

  // Applied last, so a deliberate date is not then overwritten by a
  // recomputation from the interval in the same request.
  if (input.nextDueAt !== undefined) {
    const at = new Date(input.nextDueAt);
    if (Number.isNaN(at.getTime())) return fail(422, "nextDueAt must be a date");
    await setNextDue(id, at, { userId: actor.userId });
  }

  const fresh = await prisma.maintenanceSchedule.findUniqueOrThrow({
    where: { id },
    select: { id: true, intervalDays: true, intervalSource: true, nextDueAt: true, status: true, paused: true },
  });
  return ok(fresh);
});
