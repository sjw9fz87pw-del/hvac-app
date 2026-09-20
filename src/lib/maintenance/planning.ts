/**
 * Changing how often work happens.
 *
 * An interval can be set at four levels — one unit, one restaurant, one group,
 * or the company default — and the most specific one wins. That chain already
 * exists in `resolveInterval`; what was missing was any way to edit it, and
 * anything that recomputes the schedules a change affects.
 *
 * Both matter equally. A plan row nobody recomputes from is a setting that
 * appears to save and changes nothing, which is worse than not offering it.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";
import { resolveInterval, nextDueDate, scheduleStatus, startOfDay, type PlanScope } from "./engine";

export type OverrideScope = Extract<PlanScope, "SYSTEM" | "CUSTOMER" | "LOCATION" | "ASSET">;

export interface OverrideTarget {
  scope: OverrideScope;
  serviceTypeId: string;
  organizationId?: string | null;
  locationId?: string | null;
  equipmentId?: string | null;
  /** SYSTEM plans are per equipment category rather than per tenant. */
  category?: Prisma.EquipmentCreateInput["category"] | null;
}

/**
 * Recompute one schedule from the override chain.
 *
 * The next due date is always derived from when the work was last actually
 * done, never from the date it previously happened to be due — so shortening
 * an interval pulls the next visit forward from the last service rather than
 * from an arbitrary earlier calculation.
 */
export async function recomputeSchedule(
  tx: Prisma.TransactionClient,
  scheduleId: string,
): Promise<{ intervalDays: number; source: PlanScope; nextDueAt: Date }> {
  const schedule = await tx.maintenanceSchedule.findUniqueOrThrow({
    where: { id: scheduleId },
    include: {
      serviceType: { select: { id: true, defaultIntervalDays: true, category: true } },
      equipment: { select: { id: true, organizationId: true, locationId: true, category: true, createdAt: true } },
    },
  });

  const plans = await tx.maintenancePlan.findMany({
    where: {
      active: true,
      serviceTypeId: schedule.serviceTypeId,
      OR: [
        { scope: "SYSTEM", category: schedule.equipment.category },
        { scope: "CUSTOMER", organizationId: schedule.equipment.organizationId },
        { scope: "LOCATION", locationId: schedule.equipment.locationId },
        { scope: "ASSET", equipmentId: schedule.equipmentId },
      ],
    },
    select: { scope: true, intervalDays: true, active: true },
  });

  const resolved = resolveInterval(plans, schedule.serviceType.defaultIntervalDays);

  // No service yet means it is due now, the same rule a new asset follows.
  const anchor = schedule.lastServiceAt;
  const nextDueAt = anchor
    ? nextDueDate(anchor, resolved.intervalDays)
    : startOfDay(schedule.equipment.createdAt);

  await tx.maintenanceSchedule.update({
    where: { id: scheduleId },
    data: {
      intervalDays: resolved.intervalDays,
      intervalSource: resolved.source,
      nextDueAt,
      status: scheduleStatus({ nextDueAt, paused: schedule.paused }),
    },
  });

  return { intervalDays: resolved.intervalDays, source: resolved.source, nextDueAt };
}

/** Every schedule a change at this scope could touch. */
async function affectedScheduleIds(
  tx: Prisma.TransactionClient,
  target: OverrideTarget,
): Promise<string[]> {
  const where: Prisma.MaintenanceScheduleWhereInput = { serviceTypeId: target.serviceTypeId };

  if (target.scope === "ASSET") where.equipmentId = target.equipmentId!;
  else if (target.scope === "LOCATION") where.equipment = { locationId: target.locationId! };
  else if (target.scope === "CUSTOMER") where.equipment = { organizationId: target.organizationId! };
  else if (target.category) where.equipment = { category: target.category };

  const rows = await tx.maintenanceSchedule.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * Set or clear an interval override.
 *
 * Passing null removes the override, which lets the level above take over
 * again — "back to the default" has to be reachable, or every override is a
 * one-way door.
 */
export async function setIntervalOverride(
  target: OverrideTarget,
  intervalDays: number | null,
  actor: { userId: string },
  client: PrismaClient = prisma,
): Promise<{ affected: number; intervalDays: number | null }> {
  return client.$transaction(async (tx) => {
    const existing = await tx.maintenancePlan.findFirst({
      where: {
        scope: target.scope,
        serviceTypeId: target.serviceTypeId,
        organizationId: target.scope === "CUSTOMER" ? target.organizationId! : null,
        locationId: target.scope === "LOCATION" ? target.locationId! : null,
        equipmentId: target.scope === "ASSET" ? target.equipmentId! : null,
        ...(target.scope === "SYSTEM" && target.category ? { category: target.category } : {}),
      },
      select: { id: true, intervalDays: true },
    });

    if (intervalDays === null) {
      if (existing) await tx.maintenancePlan.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.maintenancePlan.update({ where: { id: existing.id }, data: { intervalDays, active: true } });
    } else {
      await tx.maintenancePlan.create({
        data: {
          scope: target.scope,
          serviceTypeId: target.serviceTypeId,
          organizationId: target.scope === "CUSTOMER" ? target.organizationId! : null,
          locationId: target.scope === "LOCATION" ? target.locationId! : null,
          equipmentId: target.scope === "ASSET" ? target.equipmentId! : null,
          category: target.scope === "SYSTEM" ? target.category ?? null : null,
          intervalDays,
        },
      });
    }

    // A SYSTEM change is the company default, which is what a new unit inherits.
    if (target.scope === "SYSTEM" && intervalDays !== null) {
      await tx.serviceType.update({
        where: { id: target.serviceTypeId },
        data: { defaultIntervalDays: intervalDays },
      });
    }

    const ids = await affectedScheduleIds(tx, target);
    for (const id of ids) await recomputeSchedule(tx, id);

    await recordAudit(
      {
        action: "asset.frequency_changed", entityType: "MaintenancePlan",
        entityId: target.equipmentId ?? target.locationId ?? target.organizationId ?? target.serviceTypeId,
        actorId: actor.userId,
        organizationId: target.organizationId ?? null,
        before: { intervalDays: existing?.intervalDays ?? null },
        after: { scope: target.scope, intervalDays, schedulesRecomputed: ids.length },
      },
      tx,
    );

    return { affected: ids.length, intervalDays };
  });
}

/**
 * Move one schedule's next due date by hand.
 *
 * Deliberately separate from the interval: "this one is due next Tuesday" is a
 * different statement from "this kind of unit needs doing every N days", and
 * conflating them makes a one-off shift silently change the cadence forever.
 */
export async function setNextDue(
  scheduleId: string,
  nextDueAt: Date,
  actor: { userId: string },
  client: PrismaClient = prisma,
): Promise<void> {
  const schedule = await client.maintenanceSchedule.findUniqueOrThrow({
    where: { id: scheduleId },
    select: { id: true, nextDueAt: true, paused: true, equipment: { select: { organizationId: true } } },
  });
  const at = startOfDay(nextDueAt);

  await client.maintenanceSchedule.update({
    where: { id: scheduleId },
    data: { nextDueAt: at, status: scheduleStatus({ nextDueAt: at, paused: schedule.paused }) },
  });

  await recordAudit({
    action: "asset.frequency_changed", entityType: "MaintenanceSchedule", entityId: scheduleId,
    actorId: actor.userId, organizationId: schedule.equipment.organizationId,
    before: { nextDueAt: schedule.nextDueAt }, after: { nextDueAt: at },
  });
}

export async function setPaused(
  scheduleId: string,
  paused: boolean,
  actor: { userId: string },
  client: PrismaClient = prisma,
): Promise<void> {
  const schedule = await client.maintenanceSchedule.findUniqueOrThrow({
    where: { id: scheduleId },
    select: { nextDueAt: true, equipment: { select: { organizationId: true } } },
  });

  await client.maintenanceSchedule.update({
    where: { id: scheduleId },
    data: { paused, status: scheduleStatus({ nextDueAt: schedule.nextDueAt, paused }) },
  });

  await recordAudit({
    action: "asset.frequency_changed", entityType: "MaintenanceSchedule", entityId: scheduleId,
    actorId: actor.userId, organizationId: schedule.equipment.organizationId,
    after: { paused },
  });
}
