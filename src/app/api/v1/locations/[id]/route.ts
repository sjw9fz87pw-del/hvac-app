import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessLocation } from "@/lib/auth/scope";
import { recordAudit } from "@/lib/audit/log";
import { locationDeletionCheck, deleteLocation } from "@/lib/api/locations";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({
  action: z.enum(["archive", "restore", "rename"]),
  name: z.string().min(1).max(120).optional(),
});

async function reachable(actor: Awaited<ReturnType<typeof requireCapability>>, id: string) {
  const location = await prisma.restaurantLocation.findUnique({
    where: { id }, select: { id: true, name: true, organizationId: true, active: true },
  });
  if (!location) return null;
  return canAccessLocation(actor, location.id, location.organizationId) ? location : null;
}

/** Archive, restore or rename a restaurant. */
export const PATCH = route(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("location.manage");
  const { id } = await context.params;
  const input = schema.parse(await request.json());

  const location = await reachable(actor, id);
  if (!location) return fail(404, "Not found");

  if (input.action === "rename") {
    if (!input.name) return fail(422, "A name is required");
    await prisma.restaurantLocation.update({ where: { id }, data: { name: input.name.trim() } });
    await recordAudit({
      action: "location.updated", entityType: "RestaurantLocation", entityId: id,
      actorId: actor.userId, organizationId: location.organizationId,
      before: { name: location.name }, after: { name: input.name.trim() },
    });
    return ok({ id, name: input.name.trim() });
  }

  const active = input.action === "restore";
  await prisma.restaurantLocation.update({ where: { id }, data: { active } });
  await recordAudit({
    action: "location.updated", entityType: "RestaurantLocation", entityId: id,
    actorId: actor.userId, organizationId: location.organizationId,
    before: { active: location.active }, after: { active },
  });
  return ok({ id, active });
});

/**
 * Delete a restaurant outright.
 *
 * Only while nothing recorded has its name on it. A restaurant that has been
 * serviced, visited or had an issue raised keeps existing, because those rows
 * point at it; archiving takes it out of the way instead.
 */
export const DELETE = route(async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("location.manage");
  const { id } = await context.params;

  const location = await reachable(actor, id);
  if (!location) return fail(404, "Not found");

  const { blockers } = await locationDeletionCheck(id);
  if (blockers.length > 0) {
    return fail(409, `${location.name} has ${blockers.join(", ")} that must keep its name. Archive it instead.`, { blockers });
  }

  const result = await deleteLocation(id, { userId: actor.userId, serviceCompanyId: actor.serviceCompanyId });
  return ok({ id, deleted: true, equipment: result.equipment });
});
