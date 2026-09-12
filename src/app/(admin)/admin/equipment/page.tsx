import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { scheduleStatus, urgencyRank } from "@/lib/maintenance/engine";
import { PageHeader, List, Row, Divider, Pill, StatusPill, EmptyState, formatDate } from "@/components/ui/primitives";
import { photoThumb } from "@/components/ui/equipment-bits";

/** Every asset across every tenant the caller can see, filterable by exception. */
export default async function AdminEquipment({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireCapability("equipment.read");
  const { status } = await searchParams;
  const scope = organizationScope(actor);

  const equipment = await prisma.equipment.findMany({
    where: {
      ...(scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {}),
      ...(status === "PENDING_SETUP" ? { status: "PENDING_SETUP" as const } : { archivedAt: null }),
      ...(status === "OVERDUE" ? { schedules: { some: { status: "OVERDUE" } } } : {}),
    },
    include: {
      area: true,
      location: { select: { name: true } },
      organization: { select: { name: true } },
      photos: { where: { kind: "IDENTIFICATION" }, take: 1 },
      schedules: true,
      tagAssignments: { where: { unassignedAt: null } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const filters = [
    { key: undefined, label: "All" },
    { key: "OVERDUE", label: "Overdue" },
    { key: "PENDING_SETUP", label: "Awaiting verification" },
  ];

  return (
    <main className="rise">
      <PageHeader title="Equipment" subtitle={`${equipment.length} asset${equipment.length === 1 ? "" : "s"}`} />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {filters.map((filter) => (
          <a
            key={filter.label}
            href={filter.key ? `/admin/equipment?status=${filter.key}` : "/admin/equipment"}
            style={{
              padding: "8px 14px", borderRadius: 999, fontSize: 13.5, fontWeight: 600,
              border: `1px solid ${status === filter.key ? "transparent" : "var(--line)"}`,
              background: status === filter.key ? "var(--accent)" : "var(--surface)",
              color: status === filter.key ? "#fff" : "var(--ink-soft)",
            }}
          >
            {filter.label}
          </a>
        ))}
      </div>

      {equipment.length === 0 ? (
        <EmptyState title="Nothing here" body="No assets match this filter." />
      ) : (
        <List>
          {equipment.map((item, index) => {
            const worst = item.schedules
              .map((s) => scheduleStatus({ nextDueAt: s.nextDueAt, paused: s.paused }))
              .sort((a, b) => urgencyRank(a) - urgencyRank(b))[0];
            const next = item.schedules.map((s) => s.nextDueAt).sort((a, b) => a.getTime() - b.getTime())[0];
            return (
              <div key={item.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  href={`/admin/equipment/${item.id}`}
                  leading={photoThumb(item.photos[0]?.blobKey ?? null, item.name)}
                  title={item.name}
                  subtitle={`${item.organization.name} · ${item.location.name}${item.area ? ` · ${item.area.name}` : ""} · ${item.internalAssetId}`}
                  right={
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {item.tagAssignments.length === 0 && item.status !== "ARCHIVED" ? <Pill tone="warn">No tag</Pill> : null}
                      {next ? <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{formatDate(next)}</span> : null}
                      <StatusPill status={item.status === "PENDING_SETUP" ? "PENDING_SETUP" : worst ?? "PAUSED"} />
                    </div>
                  }
                />
              </div>
            );
          })}
        </List>
      )}
    </main>
  );
}
