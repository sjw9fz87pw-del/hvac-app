import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { PageHeader, SectionTitle, List, Row, Divider, Stat, StatGrid, EmptyState, Card, formatDate } from "@/components/ui/primitives";

/**
 * Reports.
 *
 * Each completed visit already produces a structured report; this is the index
 * of them plus the year-to-date numbers the business is actually sold on.
 */
export default async function ReportsPage() {
  const actor = await requireCapability("report.view");
  const scope = organizationScope(actor);
  const orgFilter = scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {};

  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [visits, servicesYtd, issuesYtd, assetsUnderManagement, overdue, photosYtd] = await Promise.all([
    prisma.visit.findMany({
      where: { ...orgFilter, status: "COMPLETED" },
      include: {
        location: { select: { name: true } }, organization: { select: { name: true } },
        technician: { select: { name: true } }, serviceRecords: { select: { id: true } },
      },
      orderBy: { completedAt: "desc" }, take: 40,
    }),
    prisma.serviceRecord.count({ where: { ...orgFilter, performedAt: { gte: yearStart } } }),
    prisma.issue.count({ where: { ...orgFilter, createdAt: { gte: yearStart } } }),
    prisma.equipment.count({ where: { ...orgFilter, archivedAt: null, status: { not: "ARCHIVED" } } }),
    prisma.maintenanceSchedule.count({ where: { status: "OVERDUE", equipment: { archivedAt: null, ...orgFilter } } }),
    prisma.servicePhoto.count({ where: { serviceRecord: { ...orgFilter, performedAt: { gte: yearStart } } } }),
  ]);

  return (
    <main className="rise">
      <PageHeader title="Reports" subtitle="Service proof and year-to-date performance" />

      <StatGrid min={165}>
        <Stat label="Assets under management" value={assetsUnderManagement} tone="accent" />
        <Stat label="Services completed YTD" value={servicesYtd} tone="good" />
        <Stat label="Overdue items" value={overdue} tone={overdue > 0 ? "bad" : "good"} />
        <Stat label="Problems identified" value={issuesYtd} tone="info" hint="Found before failure" />
        <Stat label="Proof photos" value={photosYtd} />
      </StatGrid>

      <SectionTitle>Visit reports</SectionTitle>
      {visits.length === 0 ? (
        <EmptyState title="No completed visits yet" body="Each completed visit produces a customer-facing report automatically." />
      ) : (
        <List>
          {visits.map((visit, index) => (
            <div key={visit.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/service/${visit.id}`}
                title={`${visit.location.name} — ${formatDate(visit.completedAt ?? visit.scheduledFor)}`}
                subtitle={`${visit.organization.name} · ${visit.serviceRecords.length} assets · ${visit.technician?.name ?? "team"}`}
                right={<span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>View →</span>}
              />
            </div>
          ))}
        </List>
      )}

      <Card style={{ marginTop: 20, background: "var(--canvas)", borderStyle: "dashed" }}>
        <div style={{ fontWeight: 620, fontSize: 14 }}>PDF and email delivery</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 5 }}>
          Reports are built as structured data (<code>lib/reports/visit-report.ts</code>) and rendered separately, so
          emailing them or rendering to PDF is a new renderer over the same model rather than a rewrite. Neither is
          implemented yet.
        </p>
      </Card>
    </main>
  );
}
