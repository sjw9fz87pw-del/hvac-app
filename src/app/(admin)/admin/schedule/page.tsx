import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { PageHeader, SectionTitle, List, Row, Divider, Pill, StatusPill, EmptyState, Stat, StatGrid, formatDate, relativeDays } from "@/components/ui/primitives";

/** Scheduled work, overdue work, and visits that were never completed. */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireCapability("visit.read");
  const { status } = await searchParams;
  const scope = organizationScope(actor);
  const orgFilter = scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {};

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);

  const [visits, missed, overdueSchedules, incomplete] = await Promise.all([
    prisma.visit.findMany({
      where: { ...orgFilter, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledFor: { gte: dayStart } },
      include: {
        location: { select: { name: true } }, organization: { select: { name: true } },
        technician: { select: { name: true } }, tasks: { select: { status: true } },
      },
      orderBy: { scheduledFor: "asc" }, take: 50,
    }),
    prisma.visit.findMany({
      where: { ...orgFilter, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledFor: { lt: dayStart } },
      include: { location: { select: { name: true } }, technician: { select: { name: true } }, tasks: { select: { status: true } } },
      orderBy: { scheduledFor: "asc" }, take: 30,
    }),
    prisma.maintenanceSchedule.findMany({
      where: { status: "OVERDUE", equipment: { archivedAt: null, ...orgFilter } },
      include: {
        serviceType: { select: { name: true } },
        equipment: { select: { id: true, name: true, location: { select: { name: true } } } },
      },
      orderBy: { nextDueAt: "asc" }, take: 50,
    }),
    prisma.visitTask.findMany({
      where: { status: "IN_PROGRESS", visit: { ...orgFilter } },
      include: {
        equipment: { select: { id: true, name: true } },
        visit: { include: { location: { select: { name: true } }, technician: { select: { name: true } } } },
      },
      take: 30,
    }),
  ]);

  return (
    <main className="rise">
      <PageHeader title="Schedule" subtitle="Upcoming visits, overdue work and exceptions" />

      <StatGrid min={150}>
        <Stat label="Scheduled" value={visits.length} />
        <Stat label="Missed visits" value={missed.length} tone={missed.length > 0 ? "bad" : "good"} />
        <Stat label="Overdue assets" value={overdueSchedules.length} tone={overdueSchedules.length > 0 ? "bad" : "good"} />
        <Stat label="Incomplete proof" value={incomplete.length} tone={incomplete.length > 0 ? "warn" : "good"} />
      </StatGrid>

      {status === "missed" || missed.length > 0 ? (
        <>
          <SectionTitle>Missed visits</SectionTitle>
          {missed.length === 0 ? <EmptyState title="No missed visits" /> : (
            <List>
              {missed.map((visit, index) => (
                <div key={visit.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    href={`/tech/visits/${visit.id}`}
                    title={visit.location.name}
                    subtitle={`Scheduled ${formatDate(visit.scheduledFor)} · ${visit.tasks.filter((t) => t.status === "COMPLETED").length}/${visit.tasks.length} done · ${visit.technician?.name ?? "unassigned"}`}
                    right={<Pill tone="bad">{relativeDays(visit.scheduledFor)}</Pill>}
                  />
                </div>
              ))}
            </List>
          )}
        </>
      ) : null}

      {incomplete.length > 0 ? (
        <>
          <SectionTitle>Incomplete service proof</SectionTitle>
          <List>
            {incomplete.map((task, index) => (
              <div key={task.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  href={`/admin/equipment/${task.equipment.id}`}
                  title={task.equipment.name}
                  subtitle={`${task.visit.location.name} · started by ${task.visit.technician?.name ?? "unknown"} and never completed`}
                  right={<Pill tone="warn">Open</Pill>}
                />
              </div>
            ))}
          </List>
        </>
      ) : null}

      <SectionTitle>Upcoming visits</SectionTitle>
      {visits.length === 0 ? (
        <EmptyState title="Nothing scheduled" body="Generate visits from a location page to cover what's due." />
      ) : (
        <List>
          {visits.map((visit, index) => (
            <div key={visit.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/tech/visits/${visit.id}`}
                title={`${visit.location.name} — ${formatDate(visit.scheduledFor)}`}
                subtitle={`${visit.organization.name} · ${visit.tasks.length} units · ${visit.technician?.name ?? "Unassigned"}`}
                right={<StatusPill status={visit.status} />}
              />
            </div>
          ))}
        </List>
      )}

      <SectionTitle>Overdue assets</SectionTitle>
      {overdueSchedules.length === 0 ? (
        <EmptyState title="Nothing overdue" body="Every asset is within its maintenance interval." />
      ) : (
        <List>
          {overdueSchedules.map((schedule, index) => (
            <div key={schedule.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/admin/equipment/${schedule.equipment.id}`}
                title={schedule.equipment.name}
                subtitle={`${schedule.serviceType.name} · ${schedule.equipment.location.name} · due ${formatDate(schedule.nextDueAt)}`}
                right={<Pill tone="bad">{relativeDays(schedule.nextDueAt)}</Pill>}
              />
            </div>
          ))}
        </List>
      )}
    </main>
  );
}
