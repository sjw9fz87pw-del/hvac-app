import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { Button, PageHeader, SectionTitle, List, Row, Divider, Pill, StatusPill, EmptyState, Stat, StatGrid, formatDate, formatDateTime, relativeDays, formatDay } from "@/components/ui/primitives";
import { dayBounds } from "@/lib/time/zone";
import { companyTimezone } from "@/lib/time/company";

/** Scheduled work, overdue work, and visits that were never completed. */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireCapability("visit.read");
  const { status } = await searchParams;
  const scope = organizationScope(actor);
  const orgFilter = scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {};

  const { start: dayStart } = dayBounds(await companyTimezone(actor.serviceCompanyId));

  const [visits, missed, overdueSchedules, incomplete] = await Promise.all([
    prisma.visit.findMany({
      where: { ...orgFilter, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledFor: { gte: dayStart } },
      include: {
        location: { select: { name: true, timezone: true } }, organization: { select: { name: true } },
        technician: { select: { name: true } }, tasks: { select: { status: true } },
      },
      orderBy: { scheduledFor: "asc" }, take: 50,
    }),
    prisma.visit.findMany({
      where: { ...orgFilter, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledFor: { lt: dayStart } },
      include: { location: { select: { name: true, timezone: true } }, technician: { select: { name: true } }, tasks: { select: { status: true } } },
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

      <StatGrid>
        <Stat label="Scheduled" value={visits.length} />
        <Stat label="Missed" value={missed.length} tone={missed.length > 0 ? "bad" : "neutral"} />
        <Stat label="Overdue" value={overdueSchedules.length} tone={overdueSchedules.length > 0 ? "bad" : "neutral"} />
        <Stat label="Incomplete" value={incomplete.length} tone={incomplete.length > 0 ? "warn" : "neutral"} />
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
                    href={`/admin/schedule/${visit.id}`}
                    title={visit.location.name}
                    subtitle={`Scheduled ${formatDateTime(visit.scheduledFor, visit.location.timezone)} · ${visit.tasks.filter((t) => t.status === "COMPLETED").length}/${visit.tasks.length} done · ${visit.technician?.name ?? "not assigned"}`}
                    right={<Pill tone="bad">{relativeDays(visit.scheduledFor, { timeZone: visit.location.timezone })}</Pill>}
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
        <EmptyState title="Nothing booked" body="Open a restaurant to book a visit and pick a technician."
          action={<Button href="/admin/locations" variant="secondary">Choose a restaurant</Button>} />
      ) : (
        <List>
          {visits.map((visit, index) => (
            <div key={visit.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/admin/schedule/${visit.id}`}
                title={`${visit.location.name} · ${formatDateTime(visit.scheduledFor, visit.location.timezone)}`}
                subtitle={`${visit.organization.name} · ${visit.tasks.length} units · ${visit.technician?.name ?? "Not assigned"}`}
                right={<StatusPill status={visit.status} />}
              />
            </div>
          ))}
        </List>
      )}

      <SectionTitle>Overdue units</SectionTitle>
      {overdueSchedules.length === 0 ? (
        <EmptyState title="Nothing overdue" body="All units are within their maintenance interval." />
      ) : (
        <List>
          {overdueSchedules.map((schedule, index) => (
            <div key={schedule.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/admin/equipment/${schedule.equipment.id}`}
                title={schedule.equipment.name}
                subtitle={`${schedule.serviceType.name} · ${schedule.equipment.location.name} · due ${formatDay(schedule.nextDueAt)}`}
                right={<Pill tone="bad">{relativeDays(schedule.nextDueAt, { day: true })}</Pill>}
              />
            </div>
          ))}
        </List>
      )}
    </main>
  );
}
