import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { tenantWhere, canSeeInternalNotes } from "@/lib/auth/scope";
import { createEquipmentSchema } from "@/lib/api/validation";
import { createEquipment, notifyCustomerAddedEquipment } from "@/lib/api/equipment";
import { toCustomerEquipment } from "@/lib/api/serializers";
import { withIdempotency } from "@/lib/sync/idempotency";
import { ok, route } from "@/lib/api/respond";

export const GET = route(async (request: NextRequest) => {
  const actor = await requireCapability("equipment.read");
  const params = request.nextUrl.searchParams;

  // The client may narrow, never widen: tenantWhere validates these ids against
  // the actor's session-derived scope and 404s anything outside it.
  const where = {
    ...tenantWhere(actor, {
      organizationId: params.get("organizationId"),
      locationId: params.get("locationId"),
    }),
    ...(params.get("areaId") ? { areaId: params.get("areaId")! } : {}),
    ...(params.get("includeArchived") === "true" ? {} : { archivedAt: null }),
  };

  const equipment = await prisma.equipment.findMany({
    where,
    include: {
      area: true, location: true, photos: { orderBy: { createdAt: "asc" } },
      schedules: { include: { serviceType: true } },
      tagAssignments: { where: { unassignedAt: null } },
    },
    orderBy: [{ area: { sortOrder: "asc" } }, { name: "asc" }],
    take: Math.min(Number(params.get("limit") ?? 200), 500),
  });

  const internal = canSeeInternalNotes(actor);
  return ok({
    equipment: equipment.map((e) => ({
      ...toCustomerEquipment(e),
      ...(internal ? { technicianNotes: e.technicianNotes, createdBySource: e.createdBySource } : {}),
    })),
  });
});

export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("equipment.create");
  const body = await request.json();
  const input = createEquipmentSchema.parse(body);

  const outcome = await withIdempotency(
    { actorId: actor.userId, key: request.headers.get("idempotency-key"), endpoint: "POST /equipment", body },
    async () => {
      const { equipment, customerAdded } = await createEquipment(input, actor);
      if (customerAdded) await notifyCustomerAddedEquipment(equipment.id);
      return {
        status: 201,
        body: {
          id: equipment.id,
          internalAssetId: equipment.internalAssetId,
          status: equipment.status,
          needsSetup: customerAdded,
        },
      };
    },
  );

  return ok(outcome.body, outcome.status);
});

