import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { recordAudit } from "@/lib/audit/log";
import { unpairTag } from "@/lib/nfc/service";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  reason: z.string().min(1).max(500),
  replacedByAssetId: z.string().nullish(),
  /** Return the tag to stock so it can be reused on the replacement unit. */
  releaseTag: z.boolean().default(true),
});

/**
 * Archive, never delete. Service history, tag history and issues all stay
 * attached to the machine; only its schedules stop generating work.
 */
export const POST = route(async (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("equipment.archive");
  const { id } = await ctx.params;
  const input = schema.parse(await request.json());

  const equipment = await prisma.equipment.findUnique({ where: { id } });
  if (!equipment || !canAccessAsset(actor, equipment)) throw new AuthError(404, "Not found");
  if (equipment.archivedAt) return ok({ id, status: equipment.status, alreadyArchived: true });

  if (input.releaseTag) {
    const paired = await prisma.tagAssignment.findFirst({ where: { equipmentId: id, unassignedAt: null } });
    if (paired) await unpairTag({ equipmentId: id, actor, reason: `Asset archived: ${input.reason}` });
  }

  const archived = await prisma.$transaction(async (tx) => {
    // Pause schedules rather than delete them: the record of what was scheduled
    // is part of the asset's history.
    await tx.maintenanceSchedule.updateMany({ where: { equipmentId: id }, data: { paused: true, status: "PAUSED" } });
    await tx.visitTask.updateMany({
      where: { equipmentId: id, status: { in: ["PENDING", "IN_PROGRESS"] } },
      data: { status: "SKIPPED", skipReason: "Equipment archived" },
    });

    const result = await tx.equipment.update({
      where: { id },
      data: {
        status: "ARCHIVED", archivedAt: new Date(), archivedReason: input.reason,
        replacedByAssetId: input.replacedByAssetId ?? null,
      },
    });
    await recordAudit(
      {
        action: "asset.archived", entityType: "Equipment", entityId: id,
        actorId: actor.userId, organizationId: equipment.organizationId,
        detail: { reason: input.reason, replacedByAssetId: input.replacedByAssetId ?? null },
      },
      tx,
    );
    return result;
  });

  return ok({ id: archived.id, status: archived.status, archivedAt: archived.archivedAt });
});
