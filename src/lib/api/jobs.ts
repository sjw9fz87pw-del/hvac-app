/**
 * The kinds of work the company does, and which units get them.
 *
 * A "job" here is a service type: condenser cleaning, a hood filter, anything
 * the owner names. Defining one does nothing on its own; it produces work only
 * once it is attached to a unit, which opens a schedule for that pair.
 *
 * Removal follows the rule the rest of the app uses. A job nobody has ever
 * done is deleted outright. A job with history is retired instead: hidden,
 * no longer scheduled, but still named on every record that says it was done,
 * because those records are the product and must keep meaning what they said.
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";
import { canAccessAsset } from "@/lib/auth/scope";
import type { Actor } from "@/lib/auth/session";
import { createScheduleFor } from "./equipment";
import { settleVisit } from "@/lib/maintenance/scheduling";
import { JobError } from "./job-error";

export { JobError };

type Tx = Prisma.TransactionClient;

/** "Hood filter (fryer)" → "HOOD_FILTER_FRYER". Keys are internal; names are what people see. */
export function jobKey(name: string): string {
  const key = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return key || "JOB";
}

/**
 * Define a new job.
 *
 * It starts with nothing to prove except that it was done: one checklist item,
 * named after the job, and no photo or tag requirement. That matches how the
 * existing work is recorded today, and the bar can be raised in Settings. A
 * checklist requirement with no items would make the job impossible to
 * complete, so the item is not optional.
 */
export async function createJob(
  input: { serviceCompanyId: string; name: string; intervalDays: number; actorId: string },
  client: PrismaClient = prisma,
) {
  const name = input.name.trim().replace(/\s+/g, " ");

  return client.$transaction(async (tx) => {
    const sameName = await tx.serviceType.findFirst({
      where: { serviceCompanyId: input.serviceCompanyId, active: true, name: { equals: name, mode: "insensitive" } },
      select: { name: true },
    });
    if (sameName) throw new JobError(`There is already a job called "${sameName.name}".`);

    // Retired jobs keep their key, so a new job with an old name gets a fresh one.
    const base = jobKey(name);
    const taken = new Set(
      (await tx.serviceType.findMany({
        where: { serviceCompanyId: input.serviceCompanyId, key: { startsWith: base } },
        select: { key: true },
      })).map((t) => t.key),
    );
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;

    const job = await tx.serviceType.create({
      data: {
        serviceCompanyId: input.serviceCompanyId,
        key,
        name,
        category: "OTHER",
        defaultIntervalDays: input.intervalDays,
        estimatedMinutes: 20,
        requiresNfcVerification: false,
        requiresBeforePhoto: false,
        requiresAfterPhoto: false,
        requiresChecklist: true,
        requiresTechnicianNote: false,
        checklistItems: { create: [{ label: name, sortOrder: 0 }] },
      },
    });

    await recordAudit(
      {
        action: "serviceType.created", entityType: "ServiceType", entityId: job.id,
        actorId: input.actorId, after: { name, intervalDays: input.intervalDays },
      },
      tx,
    );
    return job;
  });
}

/**
 * Drop scheduled visits left with nothing to do.
 *
 * Removing work can empty a visit that was booked only for it. A visit with no
 * tasks would still sit on the calendar and send a technician to do nothing,
 * so it goes too — but only one that has not started and holds no records.
 */
export async function dropEmptyVisits(tx: Tx, visitIds: string[]) {
  if (visitIds.length === 0) return;
  await tx.visit.deleteMany({
    where: {
      id: { in: visitIds },
      status: "SCHEDULED",
      tasks: { none: {} },
      serviceRecords: { none: {} },
    },
  });
  // What remains may now have nothing left to do, which makes it complete.
  for (const id of visitIds) await settleVisit(tx, id);
}

/** Take the not-yet-done work for a job off the calendar, returning the visits it touched. */
async function cancelPendingTasks(tx: Tx, where: Prisma.VisitTaskWhereInput): Promise<string[]> {
  const pending = await tx.visitTask.findMany({
    where: { ...where, status: { in: ["PENDING", "IN_PROGRESS"] } },
    select: { id: true, visitId: true },
  });
  if (pending.length > 0) {
    await tx.visitTask.deleteMany({ where: { id: { in: pending.map((t) => t.id) } } });
  }
  return [...new Set(pending.map((t) => t.visitId))];
}

/** Remove a job from the company: deleted if it was never done, retired if it was. */
export async function removeJob(
  serviceTypeId: string,
  actor: { userId: string; serviceCompanyId: string },
  client: PrismaClient = prisma,
): Promise<{ outcome: "deleted" | "retired"; name: string; units: number }> {
  return client.$transaction(async (tx) => {
    const job = await tx.serviceType.findUnique({ where: { id: serviceTypeId } });
    // Another company's job is not ours to describe, let alone remove.
    if (!job || job.serviceCompanyId !== actor.serviceCompanyId) throw new JobError("Not found", 404);

    const units = await tx.maintenanceSchedule.count({ where: { serviceTypeId } });
    if (!job.active) return { outcome: "retired" as const, name: job.name, units };

    const touchedVisits = await cancelPendingTasks(tx, { serviceTypeId });

    const [records, history, priced] = await Promise.all([
      tx.serviceRecord.count({ where: { serviceTypeId } }),
      tx.visitTask.count({ where: { serviceTypeId } }),
      tx.planLineItem.count({ where: { serviceTypeId } }),
    ]);

    let outcome: "deleted" | "retired";
    if (records > 0 || history > 0 || priced > 0) {
      await tx.serviceType.update({ where: { id: serviceTypeId }, data: { active: false } });
      await tx.maintenanceSchedule.updateMany({ where: { serviceTypeId }, data: { paused: true, status: "PAUSED" } });
      await tx.maintenancePlan.updateMany({ where: { serviceTypeId }, data: { active: false } });
      outcome = "retired";
    } else {
      await tx.maintenanceSchedule.deleteMany({ where: { serviceTypeId } });
      await tx.maintenancePlan.deleteMany({ where: { serviceTypeId } });
      await tx.checklistItemTemplate.deleteMany({ where: { serviceTypeId } });
      await tx.serviceType.delete({ where: { id: serviceTypeId } });
      outcome = "deleted";
    }

    await dropEmptyVisits(tx, touchedVisits);

    await recordAudit(
      {
        action: outcome === "deleted" ? "serviceType.removed" : "serviceType.retired",
        entityType: "ServiceType", entityId: serviceTypeId, actorId: actor.userId,
        before: { name: job.name, units },
      },
      tx,
    );
    return { outcome, name: job.name, units };
  });
}

/**
 * Put a job on some units.
 *
 * Units that already have it are left exactly as they are — their interval and
 * due date may have been set by hand — and counted, so the screen can say so.
 * A unit outside the caller's reach fails the whole request as not found,
 * rather than quietly doing the rest.
 */
export async function attachJob(
  input: { equipmentIds: string[]; serviceTypeId: string; intervalDays: number | null; actor: Actor },
  client: PrismaClient = prisma,
): Promise<{ added: number; alreadyHad: number }> {
  return client.$transaction(async (tx) => {
    const job = await tx.serviceType.findUnique({ where: { id: input.serviceTypeId } });
    if (!job || !job.active || job.serviceCompanyId !== input.actor.serviceCompanyId) {
      throw new JobError("Not found", 404);
    }

    const units = await tx.equipment.findMany({
      where: { id: { in: [...new Set(input.equipmentIds)] } },
      select: { id: true, organizationId: true, locationId: true, archivedAt: true },
    });
    if (units.length !== new Set(input.equipmentIds).size || units.some((u) => !canAccessAsset(input.actor, u))) {
      throw new JobError("Not found", 404);
    }

    const existing = new Set(
      (await tx.maintenanceSchedule.findMany({
        where: { serviceTypeId: job.id, equipmentId: { in: units.map((u) => u.id) } },
        select: { equipmentId: true },
      })).map((s) => s.equipmentId),
    );

    let added = 0;
    for (const unit of units) {
      if (unit.archivedAt || existing.has(unit.id)) continue;
      await createScheduleFor(tx, unit.id, job.id, input.intervalDays, input.actor.userId);
      await recordAudit(
        {
          action: "schedule.added", entityType: "Equipment", entityId: unit.id,
          actorId: input.actor.userId, organizationId: unit.organizationId,
          after: { job: job.name, intervalDays: input.intervalDays },
        },
        tx,
      );
      added++;
    }
    return { added, alreadyHad: existing.size };
  });
}

/**
 * Take a job off one unit.
 *
 * Refused once the job has been done on that unit: the service records name
 * this schedule's work, and deleting the schedule would orphan the cadence
 * they were done against. Pausing is the way to stop it then.
 */
export async function detachJob(
  scheduleId: string,
  actor: Actor,
  client: PrismaClient = prisma,
): Promise<{ job: string }> {
  return client.$transaction(async (tx) => {
    const schedule = await tx.maintenanceSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        equipment: { select: { id: true, organizationId: true, locationId: true } },
        serviceType: { select: { name: true } },
      },
    });
    if (!schedule || !canAccessAsset(actor, schedule.equipment)) throw new JobError("Not found", 404);

    const pair = { equipmentId: schedule.equipmentId, serviceTypeId: schedule.serviceTypeId };
    const records = await tx.serviceRecord.count({ where: pair });
    if (records > 0) {
      throw new JobError(
        `${schedule.serviceType.name} has been done on this unit ${records} time${records === 1 ? "" : "s"}, ` +
        "so it cannot be removed. Pause it instead to stop scheduling it.",
      );
    }

    const touchedVisits = await cancelPendingTasks(tx, pair);
    // A skipped task is history of a visit, not of this schedule; keep it, unlinked.
    await tx.visitTask.updateMany({ where: { scheduleId }, data: { scheduleId: null } });
    await tx.maintenancePlan.deleteMany({ where: { scope: "ASSET", ...pair } });
    await tx.maintenanceSchedule.delete({ where: { id: scheduleId } });
    await dropEmptyVisits(tx, touchedVisits);

    await recordAudit(
      {
        action: "schedule.removed", entityType: "Equipment", entityId: schedule.equipmentId,
        actorId: actor.userId, organizationId: schedule.equipment.organizationId,
        before: { job: schedule.serviceType.name, intervalDays: schedule.intervalDays },
      },
      tx,
    );
    return { job: schedule.serviceType.name };
  });
}
