import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { scheduleStatus, urgencyRank } from "@/lib/maintenance/engine";
import { PageHeader, List, Row, Divider, Pill, EmptyState, Button } from "@/components/ui/primitives";

export default async function LocationsPage() {
  const actor = await requireCapability("org.read");
  const scope = organizationScope(actor);
  const canAdd = actor.capabilities.has("location.manage");

  const locations = await prisma.restaurantLocation.findMany({
    where: scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {},
    include: {
      organization: { select: { name: true } },
      equipment: {
        where: { archivedAt: null },
        select: { schedules: { select: { nextDueAt: true, paused: true } } },
      },
    },
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
  });

  const rows = locations.map((location) => {
    const statuses = location.equipment.map((item) => {
      const each = item.schedules.map((s) => scheduleStatus({ nextDueAt: s.nextDueAt, paused: s.paused }));
      return each.sort((a, b) => urgencyRank(a) - urgencyRank(b))[0] ?? "PAUSED";
    });
    return {
      location,
      units: location.equipment.length,
      overdue: statuses.filter((s) => s === "OVERDUE").length,
      due: statuses.filter((s) => s === "DUE" || s === "SCHEDULE_NEEDED").length,
    };
  });

  const addButton = canAdd ? (
    <div style={{ width: 150 }}>
      <Button href="/admin/locations/new" size="sm">Add restaurant</Button>
    </div>
  ) : null;

  return (
    <main className="rise">
      <PageHeader
        title="Restaurants"
        subtitle={`${locations.length} restaurant${locations.length === 1 ? "" : "s"}`}
        action={addButton}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No restaurants yet"
          body="Add the first one, then add its units."
          action={addButton}
        />
      ) : (
        <List>
          {rows.map(({ location, units, overdue, due }, index) => (
            <div key={location.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/admin/locations/${location.id}`}
                title={location.name}
                subtitle={[
                  `${units} unit${units === 1 ? "" : "s"}`,
                  [location.city, location.state].filter(Boolean).join(", ") || null,
                ].filter(Boolean).join(" · ")}
                right={
                  overdue > 0 ? <Pill tone="bad">{overdue} overdue</Pill>
                  : due > 0 ? <Pill tone="warn">{due} due</Pill>
                  : units === 0 ? <Pill>No units</Pill>
                  : <Pill tone="good">On track</Pill>
                }
              />
            </div>
          ))}
        </List>
      )}
    </main>
  );
}
