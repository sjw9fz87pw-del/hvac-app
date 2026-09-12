import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { tenantWhere } from "@/lib/auth/scope";
import { scheduleStatus, urgencyRank } from "@/lib/maintenance/engine";
import {
  PageHeader, List, Row, Divider, StatusPill, EmptyState, Button, Pill, photoThumb,
} from "@/components/ui/equipment-bits";

/** Equipment, grouped by area - the way someone walking the restaurant thinks about it. */
export default async function EquipmentPage({ searchParams }: { searchParams: Promise<{ areaId?: string; locationId?: string; status?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;

  const equipment = await prisma.equipment.findMany({
    where: {
      ...tenantWhere(actor, { locationId: params.locationId ?? null }),
      ...(params.areaId ? { areaId: params.areaId } : {}),
      archivedAt: null,
    },
    include: {
      area: true,
      location: { select: { name: true } },
      photos: { where: { kind: "IDENTIFICATION" }, take: 1 },
      schedules: { include: { serviceType: true } },
    },
    orderBy: [{ area: { sortOrder: "asc" } }, { name: "asc" }],
  });

  const groups = new Map<string, typeof equipment>();
  for (const item of equipment) {
    const key = item.area?.name ?? "Unassigned";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  function worstStatus(item: (typeof equipment)[number]): string {
    if (item.status === "PENDING_SETUP") return "PENDING_SETUP";
    const statuses = item.schedules.map((s) => scheduleStatus({ nextDueAt: s.nextDueAt, paused: s.paused }));
    if (statuses.length === 0) return "PAUSED";
    return statuses.sort((a, b) => urgencyRank(a) - urgencyRank(b))[0];
  }

  return (
    <main className="rise">
      <PageHeader
        title="Equipment"
        subtitle={`${equipment.length} asset${equipment.length === 1 ? "" : "s"} under management`}
        action={<div style={{ width: 130 }}><Button href="/equipment/new" size="sm">Add equipment</Button></div>}
      />

      {equipment.length === 0 ? (
        <EmptyState
          title="No equipment yet"
          body="Your equipment appears here once our team completes the initial survey, or you can add a unit yourself."
          action={<Button href="/equipment/new">Add equipment</Button>}
        />
      ) : (
        [...groups.entries()].map(([areaName, items]) => (
          <section key={areaName} style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-faint)", fontWeight: 660, margin: "22px 0 10px" }}>
              {areaName} · {items.length}
            </h2>
            <List>
              {items.map((item, index) => {
                const status = worstStatus(item);
                const next = item.schedules.map((s) => s.nextDueAt).sort((a, b) => a.getTime() - b.getTime())[0];
                return (
                  <div key={item.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row
                      href={`/equipment/${item.id}`}
                      leading={photoThumb(item.photos[0]?.blobKey ?? null, item.name)}
                      title={item.name}
                      subtitle={
                        <span>
                          {[item.manufacturer, item.model].filter(Boolean).join(" ") || item.equipmentType}
                          {next ? ` · next ${next.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                        </span>
                      }
                      right={<StatusPill status={status} />}
                    />
                  </div>
                );
              })}
            </List>
          </section>
        ))
      )}

      {equipment.some((e) => e.status === "PENDING_SETUP") ? (
        <div style={{ marginTop: 8 }}>
          <Pill tone="warn">Some equipment is awaiting service setup by our team</Pill>
        </div>
      ) : null}
    </main>
  );
}
