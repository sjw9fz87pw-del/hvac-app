import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireActor } from "@/lib/auth/session";
import { canAccessAsset, canSeeInternalNotes } from "@/lib/auth/scope";
import { toCustomerEquipment, toCustomerServiceRecord } from "@/lib/api/serializers";
import {
  Card, SectionTitle, StatusPill, Pill, Divider, formatDate, relativeDays,
} from "@/components/ui/equipment-bits";
import { ReportProblem } from "./report-problem";
import { ServiceHistory } from "./history";

/**
 * The Equipment Passport, customer view.
 *
 * Everything here comes through `toCustomerEquipment`, which has no way to emit
 * internal technician notes. Internal staff opening the same page get the
 * internal block below it, explicitly.
 */
export default async function EquipmentPassport({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const record = await prisma.equipment.findUnique({
    where: { id },
    include: {
      area: true, location: true, organization: true,
      photos: { orderBy: { capturedAt: "asc" } },
      documents: true,
      schedules: { include: { serviceType: true } },
      tagAssignments: { where: { unassignedAt: null } },
      serviceRecords: {
        include: { serviceType: true, technician: true, photos: true },
        orderBy: { performedAt: "desc" }, take: 25,
      },
      issues: { where: { status: { in: ["OPEN", "TRIAGED", "ASSIGNED", "IN_PROGRESS"] } }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!record || !canAccessAsset(actor, record)) notFound();

  const view = toCustomerEquipment(record);
  const history = record.serviceRecords.map(toCustomerServiceRecord);
  const nextDue = view.maintenance.map((m) => m.nextDueAt).sort()[0] ?? null;
  const lastService = history[0] ?? null;
  const worst = view.maintenance.find((m) => m.status === "OVERDUE") ?? view.maintenance.find((m) => m.status === "DUE") ?? view.maintenance[0];

  return (
    <main className="rise">
      <a href="/equipment" style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 600 }}>← Equipment</a>

      <div style={{ marginTop: 12, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 25 }}>{view.name}</h1>
          <StatusPill status={record.status === "PENDING_SETUP" ? "PENDING_SETUP" : worst?.status ?? "PAUSED"} />
        </div>
        <div style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 4 }}>
          {[view.locationName, view.areaName].filter(Boolean).join(" · ")}
        </div>
      </div>

      {view.photos.length > 0 ? (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "14px 0 4px" }}>
          {view.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id} src={photo.url} alt={view.name}
              style={{ height: 170, borderRadius: 14, border: "1px solid var(--line)", objectFit: "cover", flexShrink: 0 }}
            />
          ))}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 14 }}>
        <Card style={{ padding: 15 }}>
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)", fontWeight: 660, textTransform: "uppercase", letterSpacing: "0.04em" }}>Last service</div>
          <div style={{ fontSize: 17, fontWeight: 660, marginTop: 5 }}>{formatDate(lastService?.performedAt)}</div>
          {lastService ? <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{lastService.serviceType}</div> : null}
        </Card>
        <Card style={{ padding: 15 }}>
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)", fontWeight: 660, textTransform: "uppercase", letterSpacing: "0.04em" }}>Next service</div>
          <div style={{ fontSize: 17, fontWeight: 660, marginTop: 5 }}>{formatDate(nextDue)}</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{nextDue ? relativeDays(nextDue) : "Not scheduled"}</div>
        </Card>
      </div>

      {record.status === "PENDING_SETUP" ? (
        <Card style={{ marginTop: 12, background: "var(--warn-soft)", borderColor: "transparent" }}>
          <div style={{ fontWeight: 640, color: "var(--warn)" }}>Awaiting service setup</div>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 4 }}>
            Our team has been notified. We&rsquo;ll confirm the details, set the maintenance schedule and attach a tag on our next visit.
          </p>
        </Card>
      ) : null}

      {view.maintenance.length > 0 ? (
        <>
          <SectionTitle>Maintenance plan</SectionTitle>
          <Card style={{ padding: 0 }}>
            {view.maintenance.map((plan, index) => (
              <div key={plan.serviceType}>
                {index > 0 ? <Divider /> : null}
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{plan.serviceType}</div>
                    <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
                      Every {plan.intervalDays} days · next {formatDate(plan.nextDueAt)}
                    </div>
                  </div>
                  <StatusPill status={plan.status} />
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Details</SectionTitle>
      <Card style={{ padding: 0 }}>
        <DetailRow label="Type" value={view.equipmentType} />
        <DetailRow label="Manufacturer" value={view.manufacturer} />
        <DetailRow label="Model" value={view.model} />
        <DetailRow label="Serial number" value={view.serialNumber} />
        <DetailRow label="Asset ID" value={view.internalAssetId} />
        <DetailRow label="Condition" value={view.condition} />
        {view.filter ? <DetailRow label="Filter" value={[view.filter.size, view.filter.type].filter(Boolean).join(" · ")} /> : null}
        {view.warranty ? <DetailRow label="Warranty" value={`${view.warranty.provider ?? "—"}${view.warranty.expires ? ` until ${formatDate(view.warranty.expires)}` : ""}`} /> : null}
        <DetailRow label="Tag" value={view.hasTag ? "Paired" : "Not yet tagged"} />
      </Card>

      {view.notes ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card><p style={{ fontSize: 14.5, color: "var(--ink-soft)" }}>{view.notes}</p></Card>
        </>
      ) : null}

      {/* Internal-only. A customer role can never satisfy this check. */}
      {canSeeInternalNotes(actor) && record.technicianNotes ? (
        <>
          <SectionTitle>Internal notes</SectionTitle>
          <Card style={{ background: "var(--info-soft)", borderColor: "transparent" }}>
            <Pill tone="info">Internal only — not shown to the customer</Pill>
            <p style={{ fontSize: 14.5, marginTop: 8 }}>{record.technicianNotes}</p>
          </Card>
        </>
      ) : null}

      {record.issues.length > 0 ? (
        <>
          <SectionTitle>Open issues</SectionTitle>
          <Card style={{ padding: 0 }}>
            {record.issues.map((issue, index) => (
              <div key={issue.id}>
                {index > 0 ? <Divider /> : null}
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{issue.title}</div>
                    <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>Reported {formatDate(issue.createdAt)}</div>
                  </div>
                  <StatusPill status={issue.status} />
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Service history</SectionTitle>
      <ServiceHistory history={history} />

      <div style={{ marginTop: 24, marginBottom: 12 }}>
        <ReportProblem equipmentId={view.id} equipmentName={view.name} />
      </div>

      <p style={{ fontSize: 12.5, color: "var(--ink-faint)", textAlign: "center", marginBottom: 20 }}>
        This record stays with this machine — through manager changes, vendor changes, and relocation.
      </p>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--line)", fontSize: 14.5 }}>
      <div style={{ color: "var(--ink-faint)", width: 130, flexShrink: 0 }}>{label}</div>
      <div style={{ fontWeight: 560 }}>{value}</div>
    </div>
  );
}
