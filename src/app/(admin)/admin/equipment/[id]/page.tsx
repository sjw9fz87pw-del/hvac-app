import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { Card, SectionTitle, StatusPill, Pill, List, Row, Divider, Button, formatDate } from "@/components/ui/primitives";
import { VerifyEquipment } from "./verify";

/** The internal view of an asset: passport, tag state, audit trail, verification. */
export default async function AdminEquipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCapability("equipment.read");
  const { id } = await params;

  const equipment = await prisma.equipment.findUnique({
    where: { id },
    include: {
      area: true, location: true, organization: true,
      schedules: { include: { serviceType: true } },
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

  const audit = await prisma.auditEvent.findMany({
    where: { entityType: "Equipment", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const currentTag = equipment.tagAssignments.find((a) => a.unassignedAt === null);

  return (
    <main className="rise">
      <a href="/admin/equipment" style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 600 }}>← Equipment</a>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0 6px", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 26 }}>{equipment.name}</h1>
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
          <div style={{ fontWeight: 640, marginBottom: 10 }}>Asset</div>
          <Field label="Type" value={equipment.equipmentType} />
          <Field label="Manufacturer" value={equipment.manufacturer} />
          <Field label="Model" value={equipment.model} />
          <Field label="Serial" value={equipment.serialNumber} />
          <Field label="Condition" value={equipment.condition} />
          <Field label="Criticality" value={equipment.criticality} />
          {equipment.filterSize ? <Field label="Filter" value={`${equipment.filterSize}${equipment.filterType ? ` · ${equipment.filterType}` : ""}`} /> : null}
          {equipment.warrantyExpires ? <Field label="Warranty" value={`${equipment.warrantyProvider ?? ""} until ${formatDate(equipment.warrantyExpires)}`} /> : null}
        </Card>

        <Card>
          <div style={{ fontWeight: 640, marginBottom: 10 }}>NFC tag</div>
          {currentTag ? (
            <>
              <Field label="State" value={currentTag.tag.state} />
              <Field label="Paired" value={formatDate(currentTag.assignedAt)} />
              <Field label="Verified" value={formatDate(currentTag.tag.verifiedAt)} />
              <div style={{ marginTop: 12, width: 170 }}>
                <Button href={`/admin/nfc/${currentTag.tagId}`} size="sm" variant="secondary">Manage tag</Button>
              </div>
            </>
          ) : (
            <>
              <Pill tone="warn">No tag paired</Pill>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8 }}>
                Pair one on the next visit. The asset still has a working QR fallback once a tag is minted.
              </p>
            </>
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

      <SectionTitle>Maintenance schedules</SectionTitle>
      {equipment.schedules.length === 0 ? (
        <Card style={{ color: "var(--ink-soft)", fontSize: 14 }}>
          No schedule yet — this asset is not generating preventive work.
        </Card>
      ) : (
        <List>
          {equipment.schedules.map((schedule, index) => (
            <div key={schedule.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={schedule.serviceType.name}
                subtitle={`Every ${schedule.intervalDays} days (from ${schedule.intervalSource.toLowerCase()} plan) · last ${formatDate(schedule.lastServiceAt)}`}
                right={<StatusPill status={schedule.status} />}
              />
            </div>
          ))}
        </List>
      )}

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
                right={record.nfcVerified ? <Pill tone="good">{record.verificationMethod}</Pill> : <Pill tone="warn">Unverified</Pill>}
              />
            </div>
          ))
        )}
      </List>

      <SectionTitle>Audit trail</SectionTitle>
      <List>
        {audit.map((event, index) => (
          <div key={event.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={event.action}
              subtitle={event.detail && Object.keys(event.detail as object).length ? JSON.stringify(event.detail) : undefined}
              right={<span style={{ fontSize: 13, color: "var(--ink-faint)" }}>{event.createdAt.toLocaleString()}</span>}
            />
          </div>
        ))}
      </List>
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
