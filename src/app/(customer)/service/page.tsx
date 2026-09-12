import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { tenantWhere } from "@/lib/auth/scope";
import { PageHeader, Card, SectionTitle, List, Row, Divider, StatusPill, EmptyState, Pill, formatDate, relativeDays } from "@/components/ui/primitives";

/** Upcoming visits and completed visit reports. */
export default async function ServicePage() {
  const actor = await requireActor();
  const where = tenantWhere(actor);

  const [upcoming, completed] = await Promise.all([
    prisma.visit.findMany({
      where: { ...where, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledFor: { gte: new Date(Date.now() - 86_400_000) } },
      include: { location: { select: { name: true } }, tasks: { select: { id: true } } },
      orderBy: { scheduledFor: "asc" }, take: 10,
    }),
    prisma.visit.findMany({
      where: { ...where, status: "COMPLETED" },
      include: {
        location: { select: { name: true } },
        serviceRecords: { select: { id: true, issuesFoundCount: true } },
      },
      orderBy: { completedAt: "desc" }, take: 20,
    }),
  ]);

  return (
    <main className="rise">
      <PageHeader title="Service" subtitle="Upcoming visits and completed service reports" />

      <SectionTitle>Upcoming</SectionTitle>
      {upcoming.length === 0 ? (
        <EmptyState title="Nothing scheduled" body="When a visit is booked you'll see the date and which units are covered." />
      ) : (
        <List>
          {upcoming.map((visit, index) => (
            <div key={visit.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={visit.location.name}
                subtitle={`${visit.tasks.length} unit${visit.tasks.length === 1 ? "" : "s"} · ${formatDate(visit.scheduledFor)}`}
                right={<Pill tone="accent">{relativeDays(visit.scheduledFor)}</Pill>}
              />
            </div>
          ))}
        </List>
      )}

      <SectionTitle>Service reports</SectionTitle>
      {completed.length === 0 ? (
        <EmptyState title="No completed visits yet" body="After each visit we publish a report with photos of every unit serviced." />
      ) : (
        <List>
          {completed.map((visit, index) => (
            <div key={visit.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/service/${visit.id}`}
                title={`${visit.location.name} — ${formatDate(visit.completedAt ?? visit.scheduledFor)}`}
                subtitle={`${visit.serviceRecords.length} asset${visit.serviceRecords.length === 1 ? "" : "s"} serviced${
                  visit.serviceRecords.some((r) => r.issuesFoundCount > 0) ? " · issues noted" : ""
                }`}
                right={<StatusPill status="COMPLETED" />}
              />
            </div>
          ))}
        </List>
      )}

      <Card style={{ marginTop: 20, background: "var(--canvas)", borderStyle: "dashed" }}>
        <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
          Every completed service is recorded permanently with the technician, timestamp, checklist and before/after photos.
        </div>
      </Card>
    </main>
  );
}
