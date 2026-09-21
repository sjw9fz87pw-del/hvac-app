import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { recordAudit } from "@/lib/audit/log";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({
  equipmentIds: z.array(z.string().min(1)).min(1).max(200),
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR", "UNKNOWN"]),
});

/**
 * Set the condition on many units at once.
 *
 * Walking a kitchen and marking ten fridges the same is the actual job; doing
 * it one at a time is ten round trips and ten chances to lose your place.
 *
 * Every id is still checked individually against the actor's scope — a list is
 * not a way to reach past a tenant boundary — and anything outside it is
 * dropped rather than reported, so the response cannot be used to discover
 * which ids exist. Each unit keeps its own audit entry with what it was before.
 */
export const PATCH = route(async (request: NextRequest) => {
  const actor = await requireCapability("equipment.update");
  const input = schema.parse(await request.json());

  const found = await prisma.equipment.findMany({
    where: { id: { in: input.equipmentIds }, archivedAt: null },
    select: { id: true, organizationId: true, locationId: true, condition: true },
  });

  const allowed = found.filter((item) => canAccessAsset(actor, item));
  if (allowed.length === 0) return fail(404, "Not found");

  await prisma.$transaction(async (tx) => {
    await tx.equipment.updateMany({
      where: { id: { in: allowed.map((a) => a.id) } },
      data: { condition: input.condition },
    });
    for (const item of allowed) {
      if (item.condition === input.condition) continue;
      await recordAudit(
        {
          action: "asset.updated", entityType: "Equipment", entityId: item.id,
          actorId: actor.userId, organizationId: item.organizationId,
          before: { condition: item.condition }, after: { condition: input.condition },
        },
        tx,
      );
    }
  });

  return ok({ updated: allowed.length, condition: input.condition });
});
