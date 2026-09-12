import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { createScheduleFor } from "@/lib/api/equipment";
import { recordAudit } from "@/lib/audit/log";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  maintenance: z.array(z.object({
    serviceTypeId: z.string().min(1),
    intervalDays: z.number().int().min(1).max(3650).nullish(),
  })).min(1),
});

/**
 * Verifying a customer-added asset: our side confirms it and sets the schedule,
 * which is the point at which PENDING_SETUP becomes a real maintenance
 * commitment. Customers cannot do this themselves.
 */
export const POST = route(async (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("equipment.verify");
  const { id } = await ctx.params;
  const input = schema.parse(await request.json());

  const equipment = await prisma.equipment.findUnique({ where: { id } });
  if (!equipment || !canAccessAsset(actor, equipment)) throw new AuthError(404, "Not found");

  const updated = await prisma.$transaction(async (tx) => {
    for (const entry of input.maintenance) {
      await createScheduleFor(tx, id, entry.serviceTypeId, entry.intervalDays ?? null, actor.userId);
    }
    const result = await tx.equipment.update({
      where: { id },
      data: { status: "ACTIVE", verifiedAt: new Date(), verifiedById: actor.userId },
    });
    await recordAudit(
      {
        action: "asset.verified", entityType: "Equipment", entityId: id,
        actorId: actor.userId, organizationId: equipment.organizationId,
        before: { status: equipment.status }, after: { status: "ACTIVE" },
      },
      tx,
    );
    return result;
  });

  return ok({ id: updated.id, status: updated.status });
});
