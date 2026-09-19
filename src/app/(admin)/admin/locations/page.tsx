import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { scheduleStatus, urgencyRank } from "@/lib/maintenance/engine";
import { PageHeader, EmptyState, Button } from "@/components/ui/primitives";
import { DEFAULT_GROUP_SLUG } from "@/lib/setup/initial-data";
import { RestaurantList, type RestaurantRow, type GroupBlock } from "./restaurant-list";

export default async function LocationsPage() {
  const actor = await requireCapability("org.read");
  const scope = organizationScope(actor);

  const locations = await prisma.restaurantLocation.findMany({
    // Archived restaurants are deliberately out of sight; the restaurant's own
    // page is where they are brought back.
    where: {
      active: true,
      ...(scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {}),
    },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      equipment: {
        where: { archivedAt: null },
        select: { schedules: { select: { nextDueAt: true, paused: true } } },
      },
    },
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
  });

  const rows: RestaurantRow[] = locations.map((location) => {
    const statuses = location.equipment.map((item) => {
      const each = item.schedules.map((s) => scheduleStatus({ nextDueAt: s.nextDueAt, paused: s.paused }));
      return each.sort((a, b) => urgencyRank(a) - urgencyRank(b))[0] ?? "PAUSED";
    });
    return {
      id: location.id,
      name: location.name,
      groupId: location.organization.id,
      groupName: location.organization.name,
      groupSlug: location.organization.slug,
      units: location.equipment.length,
      place: [location.city, location.state].filter(Boolean).join(", ") || null,
      overdue: statuses.filter((s) => s === "OVERDUE").length,
      due: statuses.filter((s) => s === "DUE" || s === "SCHEDULE_NEEDED").length,
    };
  });

  const byGroup = new Map<string, RestaurantRow[]>();
  for (const row of rows) {
    byGroup.set(row.groupId, [...(byGroup.get(row.groupId) ?? []), row]);
  }

  const groups: GroupBlock[] = [];
  const loose: RestaurantRow[] = [];

  // Two things are not worth drawing as a group. A group holding one restaurant
  // is just a restaurant. And the container created at setup is where things
  // sit before anyone has grouped anything — a default, not a decision — so its
  // members stay in the flat list however many there are.
  for (const [groupId, members] of byGroup) {
    if (members.length > 1 && members[0].groupSlug !== DEFAULT_GROUP_SLUG) {
      groups.push({ id: groupId, name: members[0].groupName, restaurants: members });
    } else {
      loose.push(...members);
    }
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  loose.sort((a, b) => a.name.localeCompare(b.name));

  const addButton = actor.capabilities.has("location.manage") ? (
    <div style={{ width: 150 }}>
      <Button href="/admin/locations/new" size="sm">Add restaurant</Button>
    </div>
  ) : null;

  return (
    <main className="rise">
      <PageHeader
        title="Restaurants"
        subtitle={`${rows.length} restaurant${rows.length === 1 ? "" : "s"}${groups.length > 0 ? ` · ${groups.length} group${groups.length === 1 ? "" : "s"}` : ""}`}
        action={addButton}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No restaurants yet"
          body="Add the first one, then add its units."
          action={addButton}
        />
      ) : (
        <RestaurantList
          groups={groups}
          loose={loose}
          canGroup={actor.capabilities.has("org.manage")}
        />
      )}
    </main>
  );
}
