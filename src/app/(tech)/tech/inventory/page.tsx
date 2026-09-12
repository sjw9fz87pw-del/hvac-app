import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { RapidInventory } from "./rapid";

/**
 * Rapid Inventory Mode.
 *
 * A restaurant survey means dozens of units in one walk-through. Everything the
 * technician needs is on one screen: area, photo, type, optional model/serial,
 * frequency, create, tag, verify, next. No navigation between units.
 */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ locationId?: string }> }) {
  const actor = await requireCapability("equipment.create");
  const { locationId } = await searchParams;
  const scope = organizationScope(actor);

  const locations = await prisma.restaurantLocation.findMany({
    where: { active: true, ...(scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {}) },
    include: { areas: { orderBy: { sortOrder: "asc" } }, organization: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
    take: 100,
  });

  const serviceTypes = await prisma.serviceType.findMany({
    where: { serviceCompanyId: actor.serviceCompanyId, active: true },
    orderBy: { name: "asc" },
  });

  const selected = locations.find((l) => l.id === locationId) ?? locations[0];
  const existingCount = selected
    ? await prisma.equipment.count({ where: { locationId: selected.id, archivedAt: null } })
    : 0;

  return (
    <RapidInventory
      locations={locations.map((l) => ({
        id: l.id, name: l.name, organizationId: l.organization.id, organizationName: l.organization.name,
        areas: l.areas.map((a) => ({ id: a.id, name: a.name })),
      }))}
      selectedLocationId={selected?.id ?? null}
      existingCount={existingCount}
      serviceTypes={serviceTypes.map((s) => ({
        id: s.id, name: s.name, category: s.category, defaultIntervalDays: s.defaultIntervalDays,
      }))}
      nfcCapable
    />
  );
}
