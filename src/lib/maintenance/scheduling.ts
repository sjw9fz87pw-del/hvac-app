/**
 * Turning due work into visits.
 *
 * Individual asset tasks are grouped into a single visit per location per day,
 * ordered by area so a technician walks the restaurant once rather than
 * criss-crossing it.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";
import { scheduleStatus } from "./engine";
import { JobError } from "@/lib/api/job-error";

const OPEN_TASK = ["PENDING", "IN_PROGRESS"] as const;
const OPEN_VISIT = ["SCHEDULED", "IN_PROGRESS"] as const;

/**
 * Bring a visit's status in line with its tasks.
 *
 * A visit is the container a day's work is booked in; its status is a summary
 * of that work, so it is derived rather than set by hand. Without this a visit
 * stayed Scheduled forever — finished visits turned into "missed" the next day,
 * and every screen that waits for a completed visit (the customer's service
 * report, Reports) stayed empty.
 *
 * Call it inside the transaction that changed a task. Cancelled and completed
 * visits are left alone: those are decisions, not summaries.
 */
export async function settleVisit(
  tx: Prisma.TransactionClient,
  visitId: string,
  actorId: string | null = null,
): Promise<string | null> {
  const visit = await tx.visit.findUnique({
    where: { id: visitId },
    select: { status: true, startedAt: true, organizationId: true, tasks: { select: { status: true } } },
  });
  if (!visit) return null;
  if (visit.status === "COMPLETED" || visit.status === "CANCELLED" || visit.tasks.length === 0) return visit.status;

  const remaining = visit.tasks.filter((t) => (OPEN_TASK as readonly string[]).includes(t.status)).length;
  const anyDone = visit.tasks.length > remaining;
  const now = new Date();

  if (remaining === 0) {
    await tx.visit.update({
      where: { id: visitId },
      data: { status: "COMPLETED", completedAt: now, startedAt: visit.startedAt ?? now },
    });
    await recordAudit(
      { action: "visit.completed", entityType: "Visit", entityId: visitId, actorId, organizationId: visit.organizationId },
      tx,
    );
    return "COMPLETED";
  }
  if (anyDone && visit.status === "SCHEDULED") {
    await tx.visit.update({ where: { id: visitId }, data: { status: "IN_PROGRESS", startedAt: visit.startedAt ?? now } });
    return "IN_PROGRESS";
  }
  return visit.status;
}

/**
 * Settle every open visit whose work is all done.
 *
 * The nightly backstop for any path that changes tasks without settling — and
 * the repair for visits finished before visits were settled at all.
 */
export async function reconcileVisits(): Promise<number> {
  const finished = await prisma.visit.findMany({
    where: {
      status: { in: [...OPEN_VISIT] },
      tasks: { some: {}, none: { status: { in: [...OPEN_TASK] } } },
    },
    select: { id: true },
  });
  for (const visit of finished) {
    await prisma.$transaction((tx) => settleVisit(tx, visit.id));
  }
  return finished.length;
}

/**
 * Re-evaluate stored statuses against the clock. Idempotent, so it is safe to
 * run on a schedule or on demand.
 */
export async function refreshScheduleStatuses(now = new Date()): Promise<number> {
  const schedules = await prisma.maintenanceSchedule.findMany({
    where: { paused: false, equipment: { archivedAt: null, status: { not: "ARCHIVED" } } },
    select: { id: true, nextDueAt: true, status: true, equipmentId: true },
  });

  const scheduledEquipment = new Set(
    (
      await prisma.visitTask.findMany({
        where: { status: { in: ["PENDING", "IN_PROGRESS"] }, visit: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } } },
        select: { equipmentId: true },
      })
    ).map((t) => t.equipmentId),
  );

  let changed = 0;
  for (const s of schedules) {
    const next = scheduleStatus({
      nextDueAt: s.nextDueAt,
      now,
      hasScheduledVisit: scheduledEquipment.has(s.equipmentId),
    });
    if (next !== s.status) {
      await prisma.maintenanceSchedule.update({ where: { id: s.id }, data: { status: next } });
      changed++;
    }
  }
  return changed;
}

export interface GenerateVisitInput {
  locationId: string;
  scheduledFor: Date;
  technicianId?: string | null;
  /** Include work coming due within this many days, not only what is due today. */
  horizonDays?: number;
  /**
   * "due" builds the visit the engine thinks is needed. "all" covers every
   * active unit at the location whatever its due date, because a real visit is
   * often booked for a reason the schedule knows nothing about - an inspection,
   * a new technician walking the site, a complaint about one cooler that is
   * worth checking the rest while there. Paused units stay out either way:
   * pausing is a deliberate "leave this alone".
   */
  include?: "due" | "all";
}

/**
 * Build a visit at a location, grouped by area and ordered so the walk-through
 * is sensible. By default it covers what is due or coming due; with
 * `include: "all"` it covers every active unit there.
 */
export async function generateVisit(input: GenerateVisitInput) {
  const location = await prisma.restaurantLocation.findUnique({ where: { id: input.locationId } });
  if (!location) throw new Error("Location not found");

  const horizon = new Date(input.scheduledFor);
  horizon.setDate(horizon.getDate() + (input.horizonDays ?? 7));

  const everything = input.include === "all";

  const due = await prisma.maintenanceSchedule.findMany({
    where: {
      paused: false,
      ...(everything ? {} : { nextDueAt: { lte: horizon } }),
      equipment: { locationId: input.locationId, archivedAt: null, status: { in: ["ACTIVE", "NEEDS_ATTENTION"] } },
    },
    include: {
      equipment: { include: { area: true } },
      serviceType: true,
    },
  });

  if (due.length === 0) return null;

  // A unit already on a booked visit is not booked again: two visits for one
  // job means two trips, and whichever is second finds nothing to do.
  const booked = new Set(
    (await prisma.visitTask.findMany({
      where: {
        equipmentId: { in: due.map((d) => d.equipmentId) },
        status: { in: [...OPEN_TASK] },
        visit: { status: { in: [...OPEN_VISIT] } },
      },
      select: { equipmentId: true, serviceTypeId: true },
    })).map((t) => `${t.equipmentId}:${t.serviceTypeId}`),
  );
  const unbooked = due.filter((d) => !booked.has(`${d.equipmentId}:${d.serviceTypeId}`));
  if (unbooked.length === 0) {
    throw new JobError("Everything here is already on a booked visit. Open that visit to change its date instead.");
  }
  due.splice(0, due.length, ...unbooked);

  // Group by area so the technician works one room at a time.
  due.sort((a, b) => {
    const areaA = a.equipment.area?.sortOrder ?? 999;
    const areaB = b.equipment.area?.sortOrder ?? 999;
    if (areaA !== areaB) return areaA - areaB;
    return a.equipment.name.localeCompare(b.equipment.name, undefined, { numeric: true });
  });

  const estimatedMinutes = due.reduce((sum, d) => sum + d.serviceType.estimatedMinutes, 0);

  return prisma.visit.create({
    data: {
      organizationId: location.organizationId,
      locationId: location.id,
      technicianId: input.technicianId ?? null,
      scheduledFor: input.scheduledFor,
      status: "SCHEDULED",
      estimatedMinutes,
      tasks: {
        create: due.map((d, index) => ({
          equipmentId: d.equipmentId,
          serviceTypeId: d.serviceTypeId,
          scheduleId: d.id,
          sortOrder: index,
        })),
      },
    },
    include: { tasks: true },
  });
}
