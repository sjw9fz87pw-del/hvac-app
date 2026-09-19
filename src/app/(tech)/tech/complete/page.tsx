import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { tenantWhere } from "@/lib/auth/scope";
import { scheduleStatus, urgencyRank } from "@/lib/maintenance/engine";
import { PageHeader, List, Row, Divider, Pill, EmptyState } from "@/components/ui/primitives";

/** Pick the restaurant you just finished. */
export default async function CompletePage() {
  const actor = await requireCapability("service.complete");

  const locations = await prisma.restaurantLocation.findMany({
    where: { ...tenantWhere(actor, {}), active: true },
    include: {
      organization: { select: { name: true } },
      equipment: {
        where: { archivedAt: null, status: { not: "ARCHIVED" } },
        select: { schedules: { select: { nextDueAt: true, paused: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = locations.map((location) => {
    const statuses = location.equipment.map((item) => {
      const each = item.schedules.map((s) => scheduleStatus({ nextDueAt: s.nextDueAt, paused: s.paused }));
      return each.sort((a, b) => urgencyRank(a) - urgencyRank(b))[0] ?? "PAUSED";
    });
    return {
      location,
      units: location.equipment.length,
      due: statuses.filter((s) => s === "OVERDUE" || s === "DUE" || s === "SCHEDULE_NEEDED").length,
    };
  });

  return (
    <main className="rise">
      <PageHeader title="Mark serviced" subtitle="Record work you have just finished" />

      {rows.length === 0 ? (
        <EmptyState title="No restaurants" body="Nothing is assigned to you yet." />
      ) : (
        <List>
          {rows.map(({ location, units, due }, index) => (
            <div key={location.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/tech/complete/${location.id}`}
                title={location.name}
                subtitle={`${location.organization.name} · ${units} unit${units === 1 ? "" : "s"}`}
                right={due > 0 ? <Pill tone="warn">{due} due</Pill> : <Pill tone="good">Up to date</Pill>}
              />
            </div>
          ))}
        </List>
      )}

      <p style={{ color: "var(--ink-faint)", fontSize: 13, marginTop: 20, lineHeight: 1.55 }}>
        For a single unit with photos and a tag scan, open it from a visit instead.
        This screen is for recording a whole restaurant at once.
      </p>
    </main>
  );
}
