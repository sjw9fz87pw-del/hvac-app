import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessLocation } from "@/lib/auth/scope";
import { scheduleStatus, urgencyRank } from "@/lib/maintenance/engine";
import { Card, Stat, StatGrid, SectionTitle, List, Row, Divider, Pill, StatusPill, Button, Disclosure, EmptyState, formatDate, formatDateTime } from "@/components/ui/primitives";
import { GenerateVisit } from "./generate-visit";
import { ManageLocation } from "./manage-location";
import { IntervalEditor, type IntervalRow } from "@/components/ui/interval-editor";
import { UnitList, type UnitRow } from "./unit-list";

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
        include: {
          area: true,
          schedules: { include: { serviceType: true } },
          tagAssignments: { where: { unassignedAt: null } },
          photos: { where: { kind: "IDENTIFICATION" }, orderBy: { capturedAt: "desc" }, take: 1 },
        },
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

  // What each job's cadence is here, and whether that was decided at this
  // restaurant or inherited from the level above.
  const serviceTypes = await prisma.serviceType.findMany({
    where: { serviceCompanyId: actor.serviceCompanyId, active: true },
    select: { id: true, name: true, defaultIntervalDays: true },
    orderBy: { name: "asc" },
  });
  const locationPlans = await prisma.maintenancePlan.findMany({
    where: { scope: "LOCATION", locationId: location.id, active: true },
    select: { serviceTypeId: true, intervalDays: true },
  });
  const orgPlans = await prisma.maintenancePlan.findMany({
    where: { scope: "CUSTOMER", organizationId: location.organizationId, active: true },
    select: { serviceTypeId: true, intervalDays: true },
  });
  const intervalRows: IntervalRow[] = serviceTypes.map((type) => {
    const here = locationPlans.find((p) => p.serviceTypeId === type.id);
    const group = orgPlans.find((p) => p.serviceTypeId === type.id);
    return {
      serviceTypeId: type.id,
      name: type.name,
      effectiveDays: here?.intervalDays ?? group?.intervalDays ?? type.defaultIntervalDays,
      overridden: Boolean(here),
      inheritedFrom: group ? "GROUP" : "COMPANY",
    };
  });

  const withStatus = location.equipment.map((item) => {
    const statuses = item.schedules.map((s) => scheduleStatus({ nextDueAt: s.nextDueAt, paused: s.paused }));
    return { item, status: statuses.sort((a, b) => urgencyRank(a) - urgencyRank(b))[0] ?? "PAUSED" };
  });

  const overdue = withStatus.filter((e) => e.status === "OVERDUE").length;
  const due = withStatus.filter((e) => e.status === "DUE" || e.status === "SCHEDULE_NEEDED").length;
  const untagged = location.equipment.filter((e) => e.tagAssignments.length === 0).length;

  return (
    <main className="rise">

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, margin: "12px 0 18px" }}>
        <div>
          <h1 style={{ fontSize: 27 }}>{location.name}</h1>
          <div style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 3 }}>
            {location.organization.name}
            {location.addressLine1 ? ` · ${[location.addressLine1, location.city, location.state].filter(Boolean).join(", ")}` : ""}
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, width: 160, flexShrink: 0 }}>
          {actor.capabilities.has("equipment.create") ? (
            <Button href={`/admin/locations/${location.id}/units/new`} size="sm">Add units</Button>
          ) : null}
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
                  title={formatDateTime(visit.scheduledFor, location.timezone)}
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

      <SectionTitle>Units by area</SectionTitle>
      {location.equipment.length === 0 ? (
        <EmptyState
          title="No units yet"
          body="Add the equipment you know about in this restaurant. You can add more any time."
          action={
            actor.capabilities.has("equipment.create") ? (
              <div style={{ width: 170, marginInline: "auto" }}>
                <Button href={`/admin/locations/${location.id}/units/new`} size="sm">Add units</Button>
              </div>
            ) : null
          }
        />
      ) : (
        location.areas.map((area) => {
          const items = withStatus.filter((e) => e.item.areaId === area.id);
          if (items.length === 0) return null;
          const areaOverdue = items.filter((e) => e.status === "OVERDUE").length;
          const areaDue = items.filter((e) => e.status === "DUE" || e.status === "SCHEDULE_NEEDED").length;
          return (
            <Disclosure
              key={area.id}
              title={area.name}
              meta={`${items.length} unit${items.length === 1 ? "" : "s"}`}
              right={
                areaOverdue > 0 ? <Pill tone="bad">{areaOverdue} overdue</Pill>
                : areaDue > 0 ? <Pill tone="warn">{areaDue} due</Pill>
                : <Pill tone="good">On track</Pill>
              }
            >
              <UnitList
                canEdit={actor.capabilities.has("equipment.update")}
                units={items.map(({ item, status }): UnitRow => ({
                  id: item.id,
                  name: item.name,
                  assetId: item.internalAssetId,
                  model: item.model,
                  status,
                  pendingSetup: item.status === "PENDING_SETUP",
                  tagged: item.tagAssignments.length > 0,
                  condition: item.condition,
                  photoBlobKey: item.photos[0]?.blobKey ?? null,
                }))}
              />
            </Disclosure>
          );
        })
      )}
      {actor.capabilities.has("plan.manage") ? (
        <>
          <SectionTitle>How often work happens here</SectionTitle>
          <IntervalEditor scope="LOCATION" locationId={location.id} rows={intervalRows} />
        </>
      ) : null}

      {actor.capabilities.has("location.manage") ? (
        <ManageLocation
          id={location.id}
          name={location.name}
          active={location.active}
          equipment={location.equipment.length}
        />
      ) : null}
    </main>
  );
}
