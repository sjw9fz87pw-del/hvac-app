import type { VisitStatus } from "@prisma/client";
import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { assignableTechnicians } from "@/lib/api/visits";
import { zonedInstant, zonedParts, zonedToday } from "@/lib/time/zone";
import { companyTimezone } from "@/lib/time/company";
import { addDays, calendarDays, isDateKey, type CalendarView } from "@/lib/time/calendar";
import { ScheduleView, type ListSheet } from "./schedule-view";
import type { BookableLocation, CalendarVisit } from "./types";

const OPEN_VISIT: VisitStatus[] = ["SCHEDULED", "IN_PROGRESS"];
const SHOWN_VISIT: VisitStatus[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "MISSED"];

/** Dashboard links land here with ?status= and open that list. */
const LIST_FOR_STATUS: Record<string, ListSheet> = { missed: "missed", incomplete: "unfinished", overdue: "overdue" };

/**
 * The schedule: a calendar of visits, with the work that is due on each day.
 *
 * A week (or a month) at a time, as a calendar draws it. Tapping a visit opens
 * it over the calendar to move, reassign or call off; tapping a free time
 * books one. Work that has gone overdue or visits that were missed sit above
 * it, each a tap away from being booked or moved.
 */
export default async function SchedulePage({ searchParams }: {
  searchParams: Promise<{ status?: string; view?: string; date?: string }>;
}) {
  const actor = await requireCapability("visit.read");
  const params = await searchParams;
  const scope = organizationScope(actor);
  const orgFilter = scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {};
  const canManage = actor.capabilities.has("visit.manage");

  const timezone = await companyTimezone(actor.serviceCompanyId);
  const today = zonedToday(timezone);
  const view: CalendarView = params.view === "month" ? "month" : "week";
  const date = isDateKey(params.date) ? params.date : today;
  const days = calendarDays(view, date);
  // A day either side, for a restaurant in another zone than the company:
  // each visit is then placed on its own restaurant's day.
  const from = zonedInstant(addDays(days[0], -1), "00:00", timezone)!;
  const to = zonedInstant(addDays(days[days.length - 1], 2), "00:00", timezone)!;
  const todayStart = zonedInstant(today, "00:00", timezone)!;
  const dayAgo = new Date(Date.now() - 86_400_000);

  const visitInclude = {
    location: { select: { id: true, name: true, timezone: true } },
    organization: { select: { name: true } },
    technician: { select: { id: true, name: true } },
    tasks: { select: { status: true } },
  } as const;

  const [inRange, missed, unfinished, schedules, bookedTasks, locations, technicians] = await Promise.all([
    prisma.visit.findMany({
      where: { ...orgFilter, status: { in: SHOWN_VISIT }, scheduledFor: { gte: from, lt: to } },
      include: visitInclude,
      orderBy: { scheduledFor: "asc" },
      take: 600,
    }),
    // Booked for a day that has passed and never completed: the same rule as the dashboard.
    prisma.visit.findMany({
      where: { ...orgFilter, status: { in: OPEN_VISIT }, scheduledFor: { lt: todayStart } },
      include: visitInclude,
      orderBy: { scheduledFor: "asc" },
      take: 30,
    }),
    // Started more than a day ago and never completed, as the dashboard counts it.
    prisma.visitTask.findMany({
      where: { status: "IN_PROGRESS", startedAt: { lt: dayAgo }, visit: { ...orgFilter } },
      select: {
        id: true, visitId: true,
        equipment: { select: { name: true } },
        visit: { select: { location: { select: { name: true } }, technician: { select: { name: true } } } },
      },
      take: 30,
    }),
    // Every job that could go on a visit, for what is due on each day and what a booking would cover.
    prisma.maintenanceSchedule.findMany({
      where: {
        paused: false,
        serviceType: { active: true },
        equipment: { archivedAt: null, status: { in: ["ACTIVE", "NEEDS_ATTENTION"] }, location: { active: true }, ...orgFilter },
      },
      select: { equipmentId: true, serviceTypeId: true, nextDueAt: true, equipment: { select: { locationId: true } } },
    }),
    // Work already on a booked visit, which is covered and so not "due" any more.
    prisma.visitTask.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS"] }, visit: { ...orgFilter, status: { in: OPEN_VISIT } } },
      select: { equipmentId: true, serviceTypeId: true, visit: { select: { locationId: true } } },
    }),
    prisma.restaurantLocation.findMany({
      where: { active: true, ...orgFilter },
      select: { id: true, name: true, timezone: true, organization: { select: { name: true } } },
      orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
    }),
    canManage ? assignableTechnicians(actor.serviceCompanyId) : Promise.resolve([]),
  ]);

  const toCalendar = (visit: (typeof inRange)[number]): CalendarVisit => {
    const at = zonedParts(visit.scheduledFor, visit.location.timezone);
    const open = visit.status === "SCHEDULED" || visit.status === "IN_PROGRESS";
    return {
      id: visit.id,
      date: at.date,
      time: at.time,
      minutes: visit.estimatedMinutes,
      status: open && at.date < today ? "MISSED" : (visit.status as CalendarVisit["status"]),
      locationId: visit.location.id,
      locationName: visit.location.name,
      organizationName: visit.organization.name,
      timezone: visit.location.timezone,
      technician: visit.technician,
      units: visit.tasks.length,
      done: visit.tasks.filter((t) => t.status === "COMPLETED").length,
    };
  };

  const shownDays = new Set(days);
  const visits = inRange.map(toCalendar).filter((v) => shownDays.has(v.date));

  // Per restaurant, each unit's earliest job that is not already booked.
  const booked = new Set(bookedTasks.map((t) => `${t.equipmentId}:${t.serviceTypeId}`));
  const hasBooked = new Set(bookedTasks.map((t) => t.visit.locationId));
  const earliest = new Map<string, Map<string, string>>();
  for (const s of schedules) {
    if (booked.has(`${s.equipmentId}:${s.serviceTypeId}`)) continue;
    // Due dates are calendar days, stored as midnight UTC.
    const day = s.nextDueAt.toISOString().slice(0, 10);
    const units = earliest.get(s.equipment.locationId) ?? new Map<string, string>();
    earliest.set(s.equipment.locationId, units);
    const current = units.get(s.equipmentId);
    if (!current || day < current) units.set(s.equipmentId, day);
  }
  const bookable: BookableLocation[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    organizationName: l.organization.name,
    timezone: l.timezone,
    due: [...(earliest.get(l.id)?.values() ?? [])].sort(),
    hasBooked: hasBooked.has(l.id),
  }));

  return (
    <ScheduleView
      key={`${view}:${days[0]}`}
      view={view}
      date={date}
      today={today}
      timezone={timezone}
      days={days}
      visits={visits}
      missed={missed.map(toCalendar)}
      unfinished={unfinished.map((t) => ({
        id: t.id, visitId: t.visitId, unitName: t.equipment.name,
        locationName: t.visit.location.name, technicianName: t.visit.technician?.name ?? null,
      }))}
      locations={bookable}
      technicians={technicians}
      defaultTechnicianId={technicians.some((t) => t.id === actor.userId) ? actor.userId : null}
      canManage={canManage}
      openList={params.status ? LIST_FOR_STATUS[params.status] ?? null : null}
    />
  );
}
