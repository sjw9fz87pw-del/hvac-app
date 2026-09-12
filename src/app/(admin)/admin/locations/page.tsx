import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { PageHeader, List, Row, Divider, Pill, EmptyState } from "@/components/ui/primitives";

export default async function LocationsPage() {
  const actor = await requireCapability("org.read");
  const scope = organizationScope(actor);

  const locations = await prisma.restaurantLocation.findMany({
    where: scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {},
    include: {
      organization: { select: { name: true } },
      _count: { select: { equipment: true, areas: true } },
    },
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <main className="rise">
      <PageHeader title="Locations" subtitle={`${locations.length} restaurant${locations.length === 1 ? "" : "s"}`} />
      {locations.length === 0 ? (
        <EmptyState title="No locations yet" />
      ) : (
        <List>
          {locations.map((location, index) => (
            <div key={location.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/admin/locations/${location.id}`}
                title={location.name}
                subtitle={`${location.organization.name} · ${location._count.equipment} assets · ${location._count.areas} areas`}
                right={location.active ? <Pill tone="good">Active</Pill> : <Pill>Inactive</Pill>}
              />
            </div>
          ))}
        </List>
      )}
    </main>
  );
}
