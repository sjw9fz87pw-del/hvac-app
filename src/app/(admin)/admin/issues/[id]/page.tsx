import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { Card, SectionTitle, StatusPill, Pill, List, Row, Divider, formatDate } from "@/components/ui/primitives";
import { IssueActions } from "./actions";

export default async function IssueDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCapability("issue.read");
  const { id } = await params;

  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      equipment: { include: { location: true, area: true } },
      organization: { select: { name: true } },
      reportedBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      vendor: { select: { id: true, name: true, trade: true } },
      photos: true,
      events: { orderBy: { createdAt: "desc" } },
      serviceRecord: { select: { id: true, performedAt: true } },
    },
  });

  if (!issue || !canAccessAsset(actor, issue)) notFound();

  const [technicians, vendors] = await Promise.all([
    prisma.user.findMany({
      where: { serviceCompanyId: actor.serviceCompanyId, active: true, memberships: { some: { role: { in: ["TECHNICIAN", "SERVICE_MANAGER"] } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.vendor.findMany({ where: { serviceCompanyId: actor.serviceCompanyId, active: true }, select: { id: true, name: true, trade: true } }),
  ]);

  return (
    <main className="rise">
      <a href="/admin/issues" style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 600 }}>← Issues</a>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0 6px", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 25 }}>{issue.title}</h1>
        <StatusPill status={issue.status} />
        <Pill tone={issue.severity === "CRITICAL" || issue.severity === "HIGH" ? "bad" : "neutral"}>{issue.severity}</Pill>
      </div>
      <div style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 18 }}>
        {issue.organization.name} · {issue.equipment.location.name}
        {issue.equipment.area ? ` · ${issue.equipment.area.name}` : ""} · reported by {issue.reportedBy?.name ?? "system"} on {formatDate(issue.createdAt)}
      </div>

      {issue.description ? (
        <Card style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 15 }}>{issue.description}</p>
        </Card>
      ) : null}

      {issue.photos.length > 0 ? (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", marginBottom: 14 }}>
          {issue.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={`/api/v1/photos/${encodeURIComponent(photo.blobKey)}`}
              alt="Reported issue"
              style={{ height: 180, borderRadius: 12, border: "1px solid var(--line)", objectFit: "cover" }}
            />
          ))}
        </div>
      ) : null}

      {/* Because the report started from the asset, the full context is already attached. */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 640, marginBottom: 8 }}>Equipment context</div>
        <div style={{ fontSize: 14.5, display: "grid", gap: 4 }}>
          <div><a href={`/admin/equipment/${issue.equipmentId}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{issue.equipment.name}</a></div>
          <div style={{ color: "var(--ink-soft)" }}>
            {[issue.equipment.manufacturer, issue.equipment.model].filter(Boolean).join(" ") || issue.equipment.equipmentType}
            {issue.equipment.serialNumber ? ` · S/N ${issue.equipment.serialNumber}` : ""} · {issue.equipment.internalAssetId}
          </div>
          {issue.serviceRecord ? (
            <div style={{ color: "var(--ink-soft)" }}>Found during service on {formatDate(issue.serviceRecord.performedAt)}</div>
          ) : null}
        </div>
      </Card>

      <IssueActions
        issueId={issue.id}
        status={issue.status}
        assignedToId={issue.assignedToId}
        vendorId={issue.vendorId}
        technicians={technicians}
        vendors={vendors}
        canAssign={actor.capabilities.has("issue.assign")}
        canResolve={actor.capabilities.has("issue.resolve")}
      />

      <SectionTitle>History</SectionTitle>
      <List>
        {issue.events.map((event, index) => (
          <div key={event.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={event.type.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
              subtitle={event.body ?? undefined}
              right={<span style={{ fontSize: 13, color: "var(--ink-faint)" }}>{event.createdAt.toLocaleString()}</span>}
            />
          </div>
        ))}
      </List>
      <div style={{ height: 30 }} />
    </main>
  );
}
