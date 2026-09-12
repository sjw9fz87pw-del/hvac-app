import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { organizationScope } from "@/lib/auth/scope";
import { ok, route } from "@/lib/api/respond";

/**
 * The NFC console's tag lists: recent, unassigned stock, revoked, or all,
 * always within the caller's tenant scope.
 */
export const GET = route(async (request: NextRequest) => {
  const actor = await requireCapability("tag.viewHistory");
  const params = request.nextUrl.searchParams;
  const filter = params.get("filter") ?? "recent";
  const scope = organizationScope(actor);

  const where = {
    ...(scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {}),
    ...(filter === "unassigned" ? { state: "UNASSIGNED" as const } : {}),
    ...(filter === "revoked" ? { state: "REVOKED" as const } : {}),
    ...(filter === "active" ? { state: "ACTIVE" as const } : {}),
  };

  const tags = await prisma.tag.findMany({
    where,
    include: {
      organization: { select: { name: true } },
      assignments: {
        where: { unassignedAt: null },
        include: { equipment: { select: { id: true, name: true, internalAssetId: true, location: { select: { name: true } } } } },
      },
      events: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Number(params.get("limit") ?? 100), 200),
  });

  return ok({
    tags: tags.map((t) => ({
      id: t.id,
      tokenId: t.tokenId,
      state: t.state,
      label: t.label,
      organizationName: t.organization?.name ?? null,
      equipment: t.assignments[0]?.equipment
        ? {
            id: t.assignments[0].equipment.id,
            name: t.assignments[0].equipment.name,
            internalAssetId: t.assignments[0].equipment.internalAssetId,
            locationName: t.assignments[0].equipment.location.name,
          }
        : null,
      writtenAt: t.writtenAt?.toISOString() ?? null,
      verifiedAt: t.verifiedAt?.toISOString() ?? null,
      revokedAt: t.revokedAt?.toISOString() ?? null,
      revokedReason: t.revokedReason,
      lastEvent: t.events[0] ? { type: t.events[0].type, at: t.events[0].createdAt.toISOString() } : null,
      updatedAt: t.updatedAt.toISOString(),
    })),
  });
});
