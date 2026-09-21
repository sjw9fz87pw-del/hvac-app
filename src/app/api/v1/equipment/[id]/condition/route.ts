import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { recordAudit } from "@/lib/audit/log";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR", "UNKNOWN"]),
  note: z.string().max(2000).optional(),
});

/**
 * Record what condition a unit is in.
 *
 * The audit trail keeps what it was before as well as what it became — "this
 * went from good to poor in a month" is the useful fact, and a field that only
 * ever holds the latest value cannot tell you that.
 */
export const PATCH = route(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("equipment.update");
  const { id } = await context.params;
  const input = schema.parse(await request.json());

  const equipment = await prisma.equipment.findUnique({
    where: { id },
    select: { id: true, organizationId: true, locationId: true, condition: true },
  });
  if (!equipment || !canAccessAsset(actor, equipment)) return fail(404, "Not found");

  await prisma.equipment.update({
    where: { id },
    data: {
      condition: input.condition,
      // A customer can never write internal notes, whatever they post.
      ...(input.note && actor.internal ? { technicianNotes: input.note } : {}),
    },
  });

  await recordAudit({
    action: "asset.updated", entityType: "Equipment", entityId: id,
    actorId: actor.userId, organizationId: equipment.organizationId,
    before: { condition: equipment.condition }, after: { condition: input.condition },
  });

  return ok({ id, condition: input.condition });
});
