import { requireActor } from "@/lib/auth/session";
import { customerDashboard } from "@/lib/api/dashboards";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import {
  Card, Stat, StatGrid, SectionTitle, List, Row, Divider, Pill, HealthRing,
  EmptyState, Button, formatDate, relativeDays, StatusPill,
} from "@/components/ui/primitives";
import { LocationSwitcher } from "./switcher";

/**
 * The customer home screen. A restaurant owner should understand their whole
 * operation without reading a manual: health, what is current, what is due,
 * what is overdue, what was just done, and when we are next on site.
 */
export default async function CustomerHome({ searchParams }: { searchParams: Promise<{ locationId?: string }> }) {
  const actor = await requireActor();
  const { locationId } = await searchParams;

  const scope = organizationScope(actor);
  const locations = await prisma.restaurantLocation.findMany({
    where: {
      active: true,
      ...(scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {}),
      ...(actor.locationIds ? { id: { in: [...actor.locationIds] } } : {}),
    },
    select: { id: true, name: true, city: true, organization: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const selected = locationId && locations.some((l) => l.id === locationId) ? locationId : null;
  const dashboard = await customerDashboard(actor, { locationId: selected });
  const multiLocation = locations.length > 1;

  return (
    <main className="rise">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, color: "var(--ink-faint)", fontWeight: 600 }}>
          {locations[0]?.organization.name ?? "Your restaurants"}
        </div>
        <h1 style={{ fontSize: 27, marginTop: 2 }}>
          {selected ? locations.find((l) => l.id === selected)!.name : multiLocation ? "All locations" : locations[0]?.name ?? "Your equipment"}
        </h1>
      </div>

      {multiLocation ? <LocationSwitcher locations={locations} selected={selected} /> : null}

      <Card style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 16 }}>
        <HealthRing score={dashboard.health.score} band={dashboard.health.band} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)", fontWeight: 660, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Maintenance Health
          </div>
          <div style={{ fontSize: 18, fontWeight: 660, marginTop: 3 }}>
            {dashboard.health.band === "EXCELLENT" ? "Everything on track"
              : dashboard.health.band === "GOOD" ? "In good shape"
              : dashboard.health.band === "FAIR" ? "Some attention needed"
              : "Needs attention"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {dashboard.health.factors.slice(0, 3).map((f) => (
              <Pill key={f.label} tone={f.impact < 0 ? "warn" : "good"}>{f.label}</Pill>
            ))}
          </div>
          {/* Stated plainly: this measures our upkeep, not the machine's condition. */}
          <p style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 10, lineHeight: 1.45 }}>
            Based on service punctuality, overdue items and open issues — not on sensor diagnostics.
          </p>
        </div>
      </Card>

      <div style={{ marginTop: 14 }}>
        <StatGrid>
          <Stat label="Assets" value={dashboard.totals.assets} hint="Under management" />
          <Stat label="Current" value={dashboard.totals.current} tone="good" />
          <Stat label="Due soon" value={dashboard.totals.dueSoon} tone={dashboard.totals.dueSoon > 0 ? "warn" : "neutral"} />
          <Stat label="Overdue" value={dashboard.totals.overdue} tone={dashboard.totals.overdue > 0 ? "bad" : "good"} />
        </StatGrid>
      </div>

      {dashboard.nextVisit ? (
        <Card style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14, borderColor: "var(--accent)" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>
            {new Date(dashboard.nextVisit.scheduledFor).getDate()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 640 }}>Next scheduled service</div>
            <div style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
              {formatDate(dashboard.nextVisit.scheduledFor)} · {dashboard.nextVisit.taskCount} units · {dashboard.nextVisit.locationName}
            </div>
          </div>
          <Pill tone="accent">{relativeDays(dashboard.nextVisit.scheduledFor)}</Pill>
        </Card>
      ) : null}

      {dashboard.areas.length > 0 ? (
        <>
          <SectionTitle action={<a href="/equipment" style={{ fontSize: 13.5, color: "var(--accent)", fontWeight: 600 }}>View all</a>}>
            By area
          </SectionTitle>
          <List>
            {dashboard.areas.map((area, index) => (
              <div key={area.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  href={`/equipment?areaId=${area.id}`}
                  title={area.name}
                  subtitle={`${area.assetCount} asset${area.assetCount === 1 ? "" : "s"}`}
                  right={
                    area.overdue > 0 ? <Pill tone="bad">{area.overdue} overdue</Pill>
                      : area.dueSoon > 0 ? <Pill tone="warn">{area.dueSoon} due</Pill>
                      : <Pill tone="good">Current</Pill>
                  }
                />
              </div>
            ))}
          </List>
        </>
      ) : null}

      <SectionTitle>Recently serviced</SectionTitle>
      {dashboard.recentlyServiced.length === 0 ? (
        <EmptyState title="No services recorded yet" body="Completed work will appear here with photos and notes." />
      ) : (
        <List>
          {dashboard.recentlyServiced.map((record, index) => (
            <div key={record.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={record.equipmentName}
                subtitle={`${record.serviceType} · ${record.technician}`}
                right={<span style={{ fontSize: 13, color: "var(--ink-faint)" }}>{formatDate(record.performedAt)}</span>}
              />
            </div>
          ))}
        </List>
      )}

      <SectionTitle>This year</SectionTitle>
      <StatGrid min={170}>
        <Stat label="Services completed" value={dashboard.yearToDate.servicesCompleted} tone="accent" />
        <Stat
          label="Problems identified"
          value={dashboard.yearToDate.issuesIdentified}
          tone="info"
          hint="Found during preventive service"
        />
      </StatGrid>

      {dashboard.totals.openIssues > 0 ? (
        <div style={{ marginTop: 14 }}>
          <Card style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <StatusPill status="OPEN" />
            <div style={{ flex: 1 }}>
              {dashboard.totals.openIssues} open issue{dashboard.totals.openIssues === 1 ? "" : "s"}
            </div>
            <div style={{ width: 110 }}><Button href="/issues" variant="secondary" size="sm">Review</Button></div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
