import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { Card, SectionTitle, StatusPill, Pill, List, Row, Divider, Button, formatDate, formatDateTime, formatDay } from "@/components/ui/primitives";
import { auditLabel, humanize } from "@/components/ui/labels";
import { VerifyEquipment } from "./verify";
import { EditSchedule } from "./edit-schedule";
import { EditCondition } from "./edit-condition";
import { PairTag } from "./pair-tag";
import { AddJob, type JobOption } from "@/components/ui/add-job";
import { resolveInterval, type PlanScope } from "@/lib/maintenance/engine";
import { RemoveUnit } from "./remove-unit";

/** The internal view of an asset: passport, tag state, audit trail, verification. */
export default async function AdminEquipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCapability("equipment.read");
  const { id } = await params;

  const equipment = await prisma.equipment.findUnique({
    where: { id },
    include: {
      area: true, location: true, organization: true,
      schedules: { where: { serviceType: { active: true } }, include: { serviceType: true } },
      tagAssignments: { include: { tag: true }, orderBy: { assignedAt: "desc" } },
      serviceRecords: { include: { serviceType: true, technician: true }, orderBy: { performedAt: "desc" }, take: 20 },
      issues: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!equipment || !canAccessAsset(actor, equipment)) notFound();

  const serviceTypes = await prisma.serviceType.findMany({
    where: { serviceCompanyId: actor.serviceCompanyId, active: true },
    orderBy: { name: "asc" },
  });

  // Jobs this unit does not have yet, each at the interval it would get here:
  // the restaurant's or group's setting if there is one, else the company's.
  const plansHere = await prisma.maintenancePlan.findMany({
    where: {
      active: true,
      OR: [
        { scope: "SYSTEM", category: equipment.category },
        { scope: "CUSTOMER", organizationId: equipment.organizationId },
        { scope: "LOCATION", locationId: equipment.locationId },
      ],
    },
    select: { serviceTypeId: true, scope: true, intervalDays: true, active: true },
  });
  const onUnit = new Set(equipment.schedules.map((s) => s.serviceTypeId));
  const addableJobs: JobOption[] = serviceTypes
    .filter((type) => !onUnit.has(type.id))
    .map((type) => ({
      id: type.id,
      name: type.name,
      effectiveDays: resolveInterval(
        plansHere.filter((p) => p.serviceTypeId === type.id).map((p) => ({ ...p, scope: p.scope as PlanScope })),
        type.defaultIntervalDays,
      ).intervalDays,
    }));

  const audit = await prisma.auditEvent.findMany({
    where: { entityType: "Equipment", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const currentTag = equipment.tagAssignments.find((a) => a.unassignedAt === null);

  return (
    <main className="rise">

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0 6px", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 23 }}>{equipment.name}</h1>
        <StatusPill status={equipment.status} />
        {equipment.createdBySource === "CUSTOMER" ? <Pill tone="info">Customer-added</Pill> : null}
      </div>
      <div style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 18 }}>
        {equipment.organization.name} · {equipment.location.name}
        {equipment.area ? ` · ${equipment.area.name}` : ""} · {equipment.internalAssetId}
      </div>

      {equipment.status === "PENDING_SETUP" && actor.capabilities.has("equipment.verify") ? (
        <div style={{ marginBottom: 16 }}>
          <VerifyEquipment
            equipmentId={equipment.id}
            equipmentName={equipment.name}
            serviceTypes={serviceTypes.map((s) => ({ id: s.id, name: s.name, defaultIntervalDays: s.defaultIntervalDays }))}
          />
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Card>
          <div style={{ fontWeight: 640, marginBottom: 10 }}>Details</div>
          <Field label="Type" value={equipment.equipmentType} />
          <Field label="Manufacturer" value={equipment.manufacturer} />
          <Field label="Model" value={equipment.model} />
          <Field label="Serial" value={equipment.serialNumber} />
          <Field label="Criticality" value={humanize(equipment.criticality)} />
          {equipment.filterSize ? <Field label="Filter" value={`${equipment.filterSize}${equipment.filterType ? ` · ${equipment.filterType}` : ""}`} /> : null}
          {equipment.warrantyExpires ? <Field label="Warranty" value={`${equipment.warrantyProvider ?? ""} until ${formatDay(equipment.warrantyExpires)}`} /> : null}
        </Card>

        <Card>
          <div style={{ fontWeight: 640, marginBottom: 10 }}>NFC tag</div>
          {currentTag ? (
            <>
              <Field label="Status" value={humanize(currentTag.tag.state)} />
              <Field label="Paired" value={formatDate(currentTag.assignedAt)} />
              <Field label="Verified" value={formatDate(currentTag.tag.verifiedAt)} />
              <div style={{ marginTop: 12, width: 170 }}>
                <Button href={`/admin/nfc/${currentTag.tagId}`} size="sm" variant="secondary">Manage tag</Button>
              </div>
            </>
          ) : (
            actor.capabilities.has("tag.pair") ? (
              <PairTag
                equipmentId={equipment.id}
                organizationId={equipment.organizationId}
                unitName={equipment.name}
              />
            ) : (
              <>
                <Pill tone="warn">No tag paired</Pill>
                <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8 }}>
                  A tag gets paired on the next visit.
                </p>
              </>
            )
          )}
          {equipment.tagAssignments.length > 1 ? (
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--ink-faint)" }}>
              {equipment.tagAssignments.length} tags in this asset&rsquo;s history
            </div>
          ) : null}
        </Card>
      </div>

      {equipment.technicianNotes ? (
        <>
          <SectionTitle>Internal notes</SectionTitle>
          <Card style={{ background: "var(--info-soft)", borderColor: "transparent" }}>
            <Pill tone="info">Never shown to the customer</Pill>
            <p style={{ fontSize: 14.5, marginTop: 8 }}>{equipment.technicianNotes}</p>
          </Card>
        </>
      ) : null}

      <EditCondition
        equipmentId={equipment.id}
        condition={equipment.condition}
        canEdit={actor.capabilities.has("equipment.update")}
      />

      <SectionTitle>Maintenance schedules</SectionTitle>
      {equipment.schedules.length === 0 ? (
        <Card style={{ color: "var(--ink-soft)", fontSize: 14 }}>
          No jobs on this unit yet.
        </Card>
      ) : (
        equipment.schedules.map((schedule) => (
          <EditSchedule
            key={schedule.id}
            canEdit={actor.capabilities.has("schedule.manage")}
            schedule={{
              id: schedule.id,
              serviceTypeName: schedule.serviceType.name,
              intervalDays: schedule.intervalDays,
              intervalSource: schedule.intervalSource,
              nextDueAt: schedule.nextDueAt.toISOString(),
              lastServiceAt: schedule.lastServiceAt?.toISOString() ?? null,
              status: schedule.status,
              paused: schedule.paused,
            }}
          />
        ))
      )}
      {!equipment.archivedAt ? (
        <AddJob
          jobs={addableJobs}
          unitId={equipment.id}
          canCreate={actor.capabilities.has("settings.manage")}
          canAttach={actor.capabilities.has("schedule.manage")}
        />
      ) : null}

      <SectionTitle>Service history</SectionTitle>
      <List>
        {equipment.serviceRecords.length === 0 ? (
          <Row title="No services recorded" subtitle="History is retained permanently once work begins" />
        ) : (
          equipment.serviceRecords.map((record, index) => (
            <div key={record.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={record.serviceType.name}
                subtitle={`${record.technician.name} · ${formatDate(record.performedAt)}${record.supersedesId ? " · correction" : ""}`}
                right={
                  // A record entered by hand is not suspect, just not tag-confirmed;
                  // a warning colour on the owner's own history read as an accusation.
                  record.nfcVerified ? <Pill tone="good">Tag verified</Pill>
                    : record.verificationMethod === "QR" ? <Pill tone="good">QR verified</Pill>
                    : <Pill>Manual entry</Pill>
                }
              />
            </div>
          ))
        )}
      </List>

      <SectionTitle>Activity</SectionTitle>
      <List>
        {audit.map((event, index) => (
          <div key={event.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={auditLabel(event.action)}
              right={<span style={{ fontSize: 13, color: "var(--ink-faint)" }}>{formatDateTime(event.createdAt, equipment.location.timezone)}</span>}
            />
          </div>
        ))}
      </List>
      {actor.capabilities.has("equipment.archive") && !equipment.archivedAt ? (
        <div style={{ marginTop: 22 }}>
          <RemoveUnit
            equipmentId={equipment.id}
            unitName={equipment.name}
            locationId={equipment.locationId}
          />
        </div>
      ) : null}

      <div style={{ height: 30 }} />
    </main>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "7px 0", fontSize: 14.5 }}>
      <div style={{ color: "var(--ink-faint)", width: 110, flexShrink: 0 }}>{label}</div>
      <div style={{ fontWeight: 560 }}>{value}</div>
    </div>
  );
}
