import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { canAccessOrganization } from "@/lib/auth/scope";
import { ok, route } from "@/lib/api/respond";

/** Complete tag history: every event and every pairing, including closed ones. */
export const GET = route(async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("tag.viewHistory");
  const { id } = await ctx.params;

  const tag = await prisma.tag.findUnique({
    where: { id },
    include: {
      events: { orderBy: { createdAt: "desc" }, take: 200 },
      assignments: {
        include: { equipment: { select: { id: true, name: true, internalAssetId: true } } },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
  if (!tag) throw new AuthError(404, "Not found");
  if (tag.organizationId && !canAccessOrganization(actor, tag.organizationId)) throw new AuthError(404, "Not found");

  return ok({
    tag: { id: tag.id, tokenId: tag.tokenId, state: tag.state, label: tag.label },
    assignments: tag.assignments.map((a) => ({
      equipmentId: a.equipmentId,
      equipmentName: a.equipment.name,
      internalAssetId: a.equipment.internalAssetId,
      assignedAt: a.assignedAt.toISOString(),
      unassignedAt: a.unassignedAt?.toISOString() ?? null,
      reason: a.unassignReason,
    })),
    events: tag.events.map((e) => ({
      id: e.id, type: e.type, detail: e.detail,
      actorId: e.actorId, createdAt: e.createdAt.toISOString(),
    })),
  });
});
