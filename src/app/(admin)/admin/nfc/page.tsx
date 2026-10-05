import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { Stat, StatGrid, SectionTitle, List, Row, Divider, Pill, StatusPill, EmptyState, formatDate, Button } from "@/components/ui/primitives";

/**
 * The NFC console.
 *
 * Reader, writer, pairing, replacement, revocation, QR fallback and complete
 * history all live here. Everything is scoped to the caller's tenants.
 */
export default async function NfcConsole({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const actor = await requireCapability("tag.viewHistory");
  const { filter } = await searchParams;
  const scope = organizationScope(actor);
  const orgFilter = scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {};

  const [tags, counts, untagged, unlocked, failures] = await Promise.all([
    prisma.tag.findMany({
      where: {
        ...orgFilter,
        ...(filter === "revoked" ? { state: "REVOKED" as const } : {}),
        ...(filter === "unassigned" ? { state: "UNASSIGNED" as const } : {}),
        ...(filter === "unlocked" ? { state: "ACTIVE" as const, lockedAt: null } : {}),
      },
      include: {
        organization: { select: { name: true } },
        assignments: { where: { unassignedAt: null }, include: { equipment: { select: { id: true, name: true, location: { select: { name: true } } } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.tag.groupBy({ by: ["state"], where: orgFilter, _count: true }),
    prisma.equipment.findMany({
      where: { ...orgFilter, archivedAt: null, status: { in: ["ACTIVE", "NEEDS_ATTENTION"] }, tagAssignments: { none: { unassignedAt: null } } },
      include: { location: { select: { name: true } }, area: { select: { name: true } } },
      take: 25,
    }),
    prisma.tag.count({ where: { ...orgFilter, state: "ACTIVE", lockedAt: null } }),
    prisma.tagEvent.findMany({
      where: { type: { in: ["WRITE_FAILED", "VERIFY_FAILED", "READ_DENIED", "LOCK_FAILED"] } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  const byState = Object.fromEntries(counts.map((c) => [c.state, c._count]));

  return (
    <main className="rise">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 23 }}>NFC tags</h1>
        </div>
        {/* Tagging what is already inventoried is the common case; adding a unit
            and tagging it in one go is the rarer one and lives in rapid inventory. */}
        <div style={{ width: 180 }}>
          <Button href="/admin/nfc?filter=untagged" size="sm">Units needing tags</Button>
        </div>
      </div>

      <StatGrid>
        <Stat label="Active" value={byState.ACTIVE ?? 0} />
        <Stat label="Untagged units" value={untagged.length} tone={untagged.length > 0 ? "warn" : "neutral"} />
        <Stat label="Unlocked" value={unlocked} tone={unlocked > 0 ? "warn" : "neutral"} />
        <Stat label="Revoked" value={byState.REVOKED ?? 0} />
      </StatGrid>

      <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
        {[
          { key: undefined, label: "Recent" },
          { key: "unassigned", label: "Unassigned" },
          { key: "revoked", label: "Revoked" },
          { key: "unlocked", label: "Unlocked" },
          { key: "untagged", label: "Untagged units" },
        ].map((option) => (
          <a
            key={option.label}
            href={option.key ? `/admin/nfc?filter=${option.key}` : "/admin/nfc"}
            style={{
              padding: "8px 14px", borderRadius: 999, fontSize: 13.5, fontWeight: 600,
              border: `1px solid ${filter === option.key ? "transparent" : "var(--line)"}`,
              background: filter === option.key ? "var(--accent)" : "var(--surface-2)",
              color: filter === option.key ? "#1a0f04" : "var(--ink-soft)",
            }}
          >
            {option.label}
          </a>
        ))}
      </div>

      {filter === "untagged" ? (
        <>
          <SectionTitle>Untagged units</SectionTitle>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "-4px 0 10px" }}>
            Open a unit to pair a tag.
          </p>
          {untagged.length === 0 ? (
            <EmptyState title="All units are tagged" />
          ) : (
            <List>
              {untagged.map((asset, index) => (
                <div key={asset.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    href={`/admin/equipment/${asset.id}`}
                    title={asset.name}
                    subtitle={`${asset.location.name}${asset.area ? ` · ${asset.area.name}` : ""} · ${asset.internalAssetId}`}
                    right={<Pill tone="warn">Pair a tag →</Pill>}
                  />
                </div>
              ))}
            </List>
          )}
        </>
      ) : (
        <>
          <SectionTitle>Tags</SectionTitle>
          {tags.length === 0 ? (
            <EmptyState title="No tags yet" />
          ) : (
            <List>
              {tags.map((tag, index) => (
                <div key={tag.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    href={`/admin/nfc/${tag.id}`}
                    title={tag.assignments[0]?.equipment.name ?? tag.label ?? `Tag ${tag.tokenId.slice(0, 8)}`}
                    subtitle={
                      tag.assignments[0]
                        ? `${tag.assignments[0].equipment.location.name} · ${tag.organization?.name ?? ""}`
                        : `${tag.organization?.name ?? "Unassigned stock"} · written ${formatDate(tag.writtenAt)}`
                    }
                    right={
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {tag.state === "ACTIVE" && !tag.lockedAt ? <Pill tone="warn">Unlocked</Pill> : null}
                        <StatusPill status={tag.state} />
                      </div>
                    }
                  />
                </div>
              ))}
            </List>
          )}
        </>
      )}

      {failures.length > 0 ? (
        <>
          <SectionTitle>Recent NFC problems</SectionTitle>
          <List>
            {failures.map((event, index) => (
              <div key={event.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={event.type.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                  subtitle={JSON.stringify(event.detail)}
                  right={<span style={{ fontSize: 13, color: "var(--ink-faint)" }}>{formatDate(event.createdAt)}</span>}
                />
              </div>
            ))}
          </List>
        </>
      ) : null}

    </main>
  );
}
