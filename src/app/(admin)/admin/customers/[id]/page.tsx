import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessOrganization } from "@/lib/auth/scope";
import { customerDashboard } from "@/lib/api/dashboards";
import { Stat, StatGrid, SectionTitle, List, Row, Divider, Pill, HealthRing, Card } from "@/components/ui/primitives";

/**
 * One customer, all locations. This is the All Locations view an organization
 * owner sees, rendered for internal staff against the same read model.
 */
export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCapability("org.read");
  const { id } = await params;

  const organization = await prisma.customerOrganization.findUnique({
    where: { id },
    include: {
      locations: {
        where: { active: true },
        include: {
          _count: { select: { equipment: true } },
          equipment: { where: { archivedAt: null }, select: { schedules: { select: { status: true } } } },
        },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!organization || !canAccessOrganization(actor, organization.id)) notFound();

  const dashboard = await customerDashboard(actor, { organizationId: organization.id });

  return (
    <main className="rise">
      <a href="/admin/customers" style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 600 }}>← Customers</a>
      <h1 style={{ fontSize: 27, margin: "12px 0 18px" }}>{organization.name}</h1>

      <Card style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 16 }}>
        <HealthRing score={dashboard.health.score} band={dashboard.health.band} />
        <div>
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)", fontWeight: 660, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Maintenance Health
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {dashboard.health.factors.map((factor) => (
              <Pill key={factor.label} tone={factor.impact < 0 ? "warn" : "good"}>{factor.label}</Pill>
            ))}
          </div>
        </div>
      </Card>

      <StatGrid min={155}>
        <Stat label="Total assets" value={dashboard.totals.assets} />
        <Stat label="Current" value={dashboard.totals.current} tone="good" />
        <Stat label="Due" value={dashboard.totals.dueSoon} tone={dashboard.totals.dueSoon > 0 ? "warn" : "neutral"} />
        <Stat label="Overdue" value={dashboard.totals.overdue} tone={dashboard.totals.overdue > 0 ? "bad" : "good"} />
        <Stat label="Open issues" value={dashboard.totals.openIssues} tone={dashboard.totals.openIssues > 0 ? "warn" : "good"} />
      </StatGrid>

      <SectionTitle>Locations</SectionTitle>
      <List>
        {organization.locations.map((location, index) => {
          const overdue = location.equipment.filter((e) => e.schedules.some((s) => s.status === "OVERDUE")).length;
          return (
            <div key={location.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/admin/locations/${location.id}`}
                title={location.name}
                subtitle={`${location._count.equipment} assets${location.city ? ` · ${location.city}` : ""}`}
                right={overdue > 0 ? <Pill tone="bad">{overdue} overdue</Pill> : <Pill tone="good">Current</Pill>}
              />
            </div>
          );
        })}
      </List>
    </main>
  );
}
