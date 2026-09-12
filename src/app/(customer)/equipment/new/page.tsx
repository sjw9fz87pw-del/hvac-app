import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { AddEquipmentForm } from "./form";

/**
 * Customer self-service equipment entry.
 *
 * A restaurant buys a new fridge and adds it here. It lands as "Needs service
 * setup" and notifies our team - the customer never programs a tag or picks a
 * maintenance interval, because that is a commitment on our side.
 */
export default async function AddEquipmentPage() {
  const actor = await requireActor();
  const scope = organizationScope(actor);

  const locations = await prisma.restaurantLocation.findMany({
    where: {
      active: true,
      ...(scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {}),
      ...(actor.locationIds ? { id: { in: [...actor.locationIds] } } : {}),
    },
    include: { areas: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <AddEquipmentForm
      locations={locations.map((l) => ({
        id: l.id, name: l.name,
        areas: l.areas.map((a) => ({ id: a.id, name: a.name })),
      }))}
    />
  );
}
