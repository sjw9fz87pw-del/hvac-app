/**
 * Turning due work into visits.
 *
 * Individual asset tasks are grouped into a single visit per location per day,
 * ordered by area so a technician walks the restaurant once rather than
 * criss-crossing it.
 */
import { prisma } from "@/lib/db/client";
import { resolveInterval, scheduleStatus, nextDueDate, type PlanScope } from "./engine";

/**
 * Recompute one asset's effective interval from the override chain and rewrite
 * its schedule row. Called when a plan changes at any level.
 */
export async function refreshScheduleInterval(equipmentId: string, serviceTypeId: string) {
  const equipment = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!equipment) return null;

  const serviceType = await prisma.serviceType.findUnique({ where: { id: serviceTypeId } });
  if (!serviceType) return null;

  const plans = await prisma.maintenancePlan.findMany({
    where: {
      serviceTypeId,
      active: true,
      OR: [
        { scope: "SYSTEM", category: equipment.category },
        { scope: "CUSTOMER", organizationId: equipment.organizationId },
        { scope: "LOCATION", locationId: equipment.locationId },
        { scope: "ASSET", equipmentId: equipment.id },
      ],
    },
  });

  const resolved = resolveInterval(
    plans.map((p) => ({ scope: p.scope as PlanScope, intervalDays: p.intervalDays, active: p.active })),
    serviceType.defaultIntervalDays,
  );

  const existing = await prisma.maintenanceSchedule.findUnique({
    where: { equipmentId_serviceTypeId: { equipmentId, serviceTypeId } },
  });

  const anchor = existing?.lastServiceAt ?? equipment.createdAt;
  const nextDueAt = existing?.lastServiceAt
    ? nextDueDate(existing.lastServiceAt, resolved.intervalDays)
    : nextDueDate(anchor, resolved.intervalDays);

  return prisma.maintenanceSchedule.upsert({
    where: { equipmentId_serviceTypeId: { equipmentId, serviceTypeId } },
    create: {
      equipmentId,
      serviceTypeId,
      intervalDays: resolved.intervalDays,
      intervalSource: resolved.source,
      nextDueAt,
      status: scheduleStatus({ nextDueAt }),
    },
    update: {
      intervalDays: resolved.intervalDays,
      intervalSource: resolved.source,
      nextDueAt,
      status: scheduleStatus({ nextDueAt, paused: existing?.paused }),
    },
  });
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
}

/**
 * Build a visit covering everything due (or coming due) at a location, grouped
 * by area and ordered so the walk-through is sensible.
 */
export async function generateVisit(input: GenerateVisitInput) {
  const location = await prisma.restaurantLocation.findUnique({ where: { id: input.locationId } });
  if (!location) throw new Error("Location not found");

  const horizon = new Date(input.scheduledFor);
  horizon.setDate(horizon.getDate() + (input.horizonDays ?? 7));

  const due = await prisma.maintenanceSchedule.findMany({
    where: {
      paused: false,
      nextDueAt: { lte: horizon },
      equipment: { locationId: input.locationId, archivedAt: null, status: { in: ["ACTIVE", "NEEDS_ATTENTION"] } },
    },
    include: {
      equipment: { include: { area: true } },
      serviceType: true,
    },
  });

  if (due.length === 0) return null;

  // Group by area so the technician works one room at a time.
  due.sort((a, b) => {
    const areaA = a.equipment.area?.sortOrder ?? 999;
    const areaB = b.equipment.area?.sortOrder ?? 999;
    if (areaA !== areaB) return areaA - areaB;
    return a.equipment.name.localeCompare(b.equipment.name);
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
