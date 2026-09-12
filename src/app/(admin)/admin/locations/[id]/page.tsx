import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessLocation } from "@/lib/auth/scope";
import { scheduleStatus, urgencyRank } from "@/lib/maintenance/engine";
import { Card, Stat, StatGrid, SectionTitle, List, Row, Divider, Pill, StatusPill, Button, formatDate } from "@/components/ui/primitives";
import { GenerateVisit } from "./generate-visit";

export default async function LocationDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCapability("org.read");
  const { id } = await params;

  const location = await prisma.restaurantLocation.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      areas: { orderBy: { sortOrder: "asc" } },
      equipment: {
        where: { archivedAt: null },
        include: { area: true, schedules: { include: { serviceType: true } }, tagAssignments: { where: { unassignedAt: null } } },
        orderBy: [{ area: { sortOrder: "asc" } }, { name: "asc" }],
      },
      visits: {
        where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
        include: { technician: { select: { name: true } }, tasks: { select: { id: true } } },
        orderBy: { scheduledFor: "asc" }, take: 5,
      },
    },
  });

  if (!location || !canAccessLocation(actor, location.id, location.organizationId)) notFound();

  const withStatus = location.equipment.map((item) => {
    const statuses = item.schedules.map((s) => scheduleStatus({ nextDueAt: s.nextDueAt, paused: s.paused }));
    return { item, status: statuses.sort((a, b) => urgencyRank(a) - urgencyRank(b))[0] ?? "PAUSED" };
  });

  const overdue = withStatus.filter((e) => e.status === "OVERDUE").length;
  const due = withStatus.filter((e) => e.status === "DUE" || e.status === "SCHEDULE_NEEDED").length;
  const untagged = location.equipment.filter((e) => e.tagAssignments.length === 0).length;

  return (
    <main className="rise">
      <a href="/admin/locations" style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 600 }}>← Locations</a>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, margin: "12px 0 18px" }}>
        <div>
          <h1 style={{ fontSize: 27 }}>{location.name}</h1>
          <div style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 3 }}>
            {location.organization.name}
            {location.addressLine1 ? ` · ${[location.addressLine1, location.city, location.state].filter(Boolean).join(", ")}` : ""}
          </div>
        </div>
        <div style={{ width: 180 }}>
          <Button href={`/tech/inventory?locationId=${location.id}`} size="sm" variant="secondary">Rapid inventory</Button>
        </div>
      </div>

      <StatGrid min={150}>
        <Stat label="Assets" value={location.equipment.length} />
        <Stat label="Due" value={due} tone={due > 0 ? "warn" : "good"} />
        <Stat label="Overdue" value={overdue} tone={overdue > 0 ? "bad" : "good"} />
        <Stat label="Untagged" value={untagged} tone={untagged > 0 ? "warn" : "good"} />
      </StatGrid>

      {location.accessNotes ? (
        <Card style={{ marginTop: 14, background: "var(--info-soft)", borderColor: "transparent" }}>
          <Pill tone="info">Internal access notes</Pill>
          <p style={{ fontSize: 14.5, marginTop: 8 }}>{location.accessNotes}</p>
        </Card>
      ) : null}

      <SectionTitle>Upcoming visits</SectionTitle>
      {location.visits.length === 0 ? (
        <GenerateVisit locationId={location.id} dueCount={due + overdue} />
      ) : (
        <>
          <List>
            {location.visits.map((visit, index) => (
              <div key={visit.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  href={`/tech/visits/${visit.id}`}
                  title={formatDate(visit.scheduledFor)}
                  subtitle={`${visit.tasks.length} units · ${visit.technician?.name ?? "Unassigned"}`}
                  right={<StatusPill status={visit.status} />}
                />
              </div>
            ))}
          </List>
          <div style={{ marginTop: 12 }}>
            <GenerateVisit locationId={location.id} dueCount={due + overdue} />
          </div>
        </>
      )}

      <SectionTitle>Equipment by area</SectionTitle>
      {location.areas.map((area) => {
        const items = withStatus.filter((e) => e.item.areaId === area.id);
        if (items.length === 0) return null;
        return (
          <section key={area.id} style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-faint)", fontWeight: 660, margin: "0 0 8px" }}>
              {area.name} · {items.length}
            </h3>
            <List>
              {items.map(({ item, status }, index) => (
                <div key={item.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    href={`/admin/equipment/${item.id}`}
                    title={item.name}
                    subtitle={`${item.internalAssetId}${item.model ? ` · ${item.model}` : ""}`}
                    right={
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {item.tagAssignments.length === 0 ? <Pill tone="warn">No tag</Pill> : null}
                        <StatusPill status={item.status === "PENDING_SETUP" ? "PENDING_SETUP" : status} />
                      </div>
                    }
                  />
                </div>
              ))}
            </List>
          </section>
        );
      })}
    </main>
  );
}
