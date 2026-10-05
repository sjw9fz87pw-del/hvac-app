import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { PageHeader, SectionTitle, List, Row, Divider, Stat, StatGrid, EmptyState, formatDate } from "@/components/ui/primitives";

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

  const [visits, servicesYtd, issuesYtd, assetsUnderManagement, overdue] = await Promise.all([
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
  ]);

  return (
    <main className="rise">
      <PageHeader title="Reports" subtitle="Service proof and year-to-date performance" />

      <StatGrid>
        <Stat label="Units" value={assetsUnderManagement} />
        <Stat label="Services this year" value={servicesYtd} />
        <Stat label="Problems found" value={issuesYtd} />
        <Stat label="Overdue" value={overdue} tone={overdue > 0 ? "bad" : "neutral"} />
      </StatGrid>

      <SectionTitle>Visit reports</SectionTitle>
      {visits.length === 0 ? (
        <EmptyState title="No completed visits yet" body="Reports are created when visits are completed." />
      ) : (
        <List>
          {visits.map((visit, index) => (
            <div key={visit.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/service/${visit.id}`}
                title={`${visit.location.name} — ${formatDate(visit.completedAt ?? visit.scheduledFor)}`}
                subtitle={`${visit.organization.name} · ${visit.serviceRecords.length} units · ${visit.technician?.name ?? "team"}`}
                right={<span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>View →</span>}
              />
            </div>
          ))}
        </List>
      )}

    </main>
  );
}
