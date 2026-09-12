import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessOrganization } from "@/lib/auth/scope";
import { appBaseUrl } from "@/lib/nfc/service";
import { Card, SectionTitle, StatusPill, Pill, List, Row, Divider, formatDate } from "@/components/ui/primitives";
import { TagActions } from "./actions";

/**
 * One tag: current pairing, QR fallback, and the complete event history.
 *
 * History is never pruned. A revoked tag keeps every event it ever produced,
 * which is what makes "which tag was on this unit last March" answerable.
 */
export default async function TagDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCapability("tag.viewHistory");
  const { id } = await params;

  const tag = await prisma.tag.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      assignments: {
        include: { equipment: { select: { id: true, name: true, internalAssetId: true, location: { select: { name: true } } } } },
        orderBy: { assignedAt: "desc" },
      },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });

  if (!tag) notFound();
  if (tag.organizationId && !canAccessOrganization(actor, tag.organizationId)) notFound();

  const current = tag.assignments.find((a) => a.unassignedAt === null);

  // The QR encodes the same token the chip carries, so both paths resolve identically.
  const qrPayload = `${appBaseUrl()}/t/v1.${tag.tenantHint}.${tag.tokenId}.${tag.macPrefix}`;
  const qrSvg = current ? await QRCode.toString(qrPayload, { type: "svg", margin: 1, width: 180 }) : null;

  return (
    <main className="rise">
      <a href="/admin/nfc" style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 600 }}>← NFC</a>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0 18px", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 25 }}>{current?.equipment.name ?? tag.label ?? "Unassigned tag"}</h1>
        <StatusPill status={tag.state} />
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Card>
          <SectionRow label="Token id" value={tag.tokenId} mono />
          <SectionRow label="Customer" value={tag.organization?.name ?? "Unassigned stock"} />
          <SectionRow label="Written" value={formatDate(tag.writtenAt)} />
          <SectionRow label="Verified" value={formatDate(tag.verifiedAt)} />
          {tag.revokedAt ? <SectionRow label="Revoked" value={`${formatDate(tag.revokedAt)} — ${tag.revokedReason ?? ""}`} /> : null}
          {current ? (
            <SectionRow label="Paired to" value={`${current.equipment.name} (${current.equipment.internalAssetId})`} />
          ) : null}
        </Card>

        {qrSvg ? (
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12.5, fontWeight: 660, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              QR fallback
            </div>
            <div dangerouslySetInnerHTML={{ __html: qrSvg }} style={{ display: "inline-block", background: "#fff", padding: 10, borderRadius: 12 }} />
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 10 }}>
              Resolves to the same record as the tag. Print and stick it beside the tag for iPhones and damaged chips.
            </p>
          </Card>
        ) : null}
      </div>

      {current ? (
        <div style={{ marginTop: 16 }}>
          <TagActions
            tagId={tag.id}
            equipmentId={current.equipment.id}
            equipmentName={current.equipment.name}
            organizationId={tag.organizationId!}
            canRevoke={actor.capabilities.has("tag.revoke")}
          />
        </div>
      ) : null}

      <SectionTitle>Pairing history</SectionTitle>
      <List>
        {tag.assignments.map((assignment, index) => (
          <div key={assignment.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              href={`/admin/equipment/${assignment.equipmentId}`}
              title={assignment.equipment.name}
              subtitle={`${assignment.equipment.location.name} · paired ${formatDate(assignment.assignedAt)}${
                assignment.unassignedAt ? ` · removed ${formatDate(assignment.unassignedAt)}` : ""
              }`}
              right={assignment.unassignedAt ? <Pill>Ended</Pill> : <Pill tone="good">Current</Pill>}
            />
          </div>
        ))}
      </List>

      <SectionTitle>Audit history</SectionTitle>
      <List>
        {tag.events.map((event, index) => (
          <div key={event.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={event.type.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
              subtitle={Object.keys(event.detail as object).length > 0 ? JSON.stringify(event.detail) : undefined}
              right={<span style={{ fontSize: 13, color: "var(--ink-faint)" }}>{event.createdAt.toLocaleString()}</span>}
            />
          </div>
        ))}
      </List>
      <div style={{ height: 30 }} />
    </main>
  );
}

function SectionRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "9px 0", fontSize: 14.5, borderBottom: "1px solid var(--line)" }}>
      <div style={{ color: "var(--ink-faint)", width: 110, flexShrink: 0 }}>{label}</div>
      <div style={{ fontWeight: 560, fontFamily: mono ? "ui-monospace, monospace" : undefined, fontSize: mono ? 13 : undefined, wordBreak: "break-all" }}>
        {value}
      </div>
    </div>
  );
}
