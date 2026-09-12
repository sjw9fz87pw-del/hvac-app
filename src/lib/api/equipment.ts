/**
 * Equipment creation, shared by Rapid Inventory (internal) and customer
 * self-service. The difference between the two is one field: assets a customer
 * adds land as PENDING_SETUP and raise a verification notification, because a
 * maintenance schedule is a commitment our side has to agree to.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { resolveInterval, nextDueDate, scheduleStatus, type PlanScope } from "@/lib/maintenance/engine";
import type { Actor } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/session";
import { assertLocation } from "@/lib/auth/scope";
import type { z } from "zod";
import type { createEquipmentSchema } from "./validation";

type CreateInput = z.infer<typeof createEquipmentSchema>;

/** Sequential, human-readable, unique per organization: MONA-0007. */
async function nextAssetId(tx: Prisma.TransactionClient, organizationId: string, prefix: string): Promise<string> {
  const count = await tx.equipment.count({ where: { organizationId } });
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = `${prefix}-${String(count + 1 + attempt).padStart(4, "0")}`;
    const clash = await tx.equipment.findUnique({
      where: { organizationId_internalAssetId: { organizationId, internalAssetId: candidate } },
    });
    if (!clash) return candidate;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export async function createEquipment(input: CreateInput, actor: Actor) {
  const location = await prisma.restaurantLocation.findUnique({
    where: { id: input.locationId },
    include: { organization: true },
  });
  if (!location) throw new AuthError(404, "Not found");
  assertLocation(actor, location.id, location.organizationId);

  const customerAdded = !actor.internal;

  return prisma.$transaction(async (tx) => {
    let areaId = input.areaId ?? null;
    if (!areaId && input.newAreaName) {
      const area = await tx.area.upsert({
        where: { locationId_name: { locationId: location.id, name: input.newAreaName } },
        create: { locationId: location.id, name: input.newAreaName },
        update: {},
      });
      areaId = area.id;
    }

    const prefix = location.organization.slug.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "") || "ASSET";
    const internalAssetId = await nextAssetId(tx, location.organizationId, prefix);

    const equipment = await tx.equipment.create({
      data: {
        organizationId: location.organizationId,
        locationId: location.id,
        areaId,
        name: input.name,
        category: input.category,
        equipmentType: input.equipmentType,
        manufacturer: input.manufacturer ?? null,
        model: input.model ?? null,
        serialNumber: input.serialNumber ?? null,
        internalAssetId,
        yearInstalled: input.yearInstalled ?? null,
        criticality: input.criticality,
        condition: input.condition,
        filterSize: input.filterSize ?? null,
        filterType: input.filterType ?? null,
        filterQuantity: input.filterQuantity ?? null,
        warrantyProvider: input.warrantyProvider ?? null,
        warrantyExpires: input.warrantyExpires ? new Date(input.warrantyExpires) : null,
        // A customer can never write internal notes, whatever they post.
        technicianNotes: actor.internal ? input.technicianNotes ?? null : null,
        customerVisibleNotes: input.customerVisibleNotes ?? null,
        createdById: actor.userId,
        createdBySource: customerAdded ? "CUSTOMER" : "INTERNAL",
        status: customerAdded ? "PENDING_SETUP" : "ACTIVE",
        verifiedAt: customerAdded ? null : new Date(),
        verifiedById: customerAdded ? null : actor.userId,
        photos: {
          create: input.photoBlobKeys.map((blobKey) => ({
            blobKey, kind: "IDENTIFICATION" as const, uploadedById: actor.userId,
          })),
        },
      },
    });

    // Schedules are only created for assets our side has set up. A customer-added
    // asset gets its schedule when a service manager verifies it.
    if (!customerAdded) {
      for (const entry of input.maintenance) {
        await createScheduleFor(tx, equipment.id, entry.serviceTypeId, entry.intervalDays ?? null, actor.userId);
      }
    }

    await recordAudit(
      {
        action: "asset.created", entityType: "Equipment", entityId: equipment.id,
        actorId: actor.userId, organizationId: location.organizationId,
        after: { name: equipment.name, internalAssetId, source: equipment.createdBySource },
      },
      tx,
    );

    return { equipment, customerAdded };
  });
}

/** Resolve the interval from the override chain and open a schedule row. */
export async function createScheduleFor(
  tx: Prisma.TransactionClient,
  equipmentId: string,
  serviceTypeId: string,
  assetOverrideDays: number | null,
  actorId: string,
) {
  const equipment = await tx.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
  const serviceType = await tx.serviceType.findUniqueOrThrow({ where: { id: serviceTypeId } });

  if (assetOverrideDays) {
    await tx.maintenancePlan.create({
      data: { scope: "ASSET", serviceTypeId, equipmentId, intervalDays: assetOverrideDays, note: "Set at asset creation" },
    });
  }

  const plans = await tx.maintenancePlan.findMany({
    where: {
      serviceTypeId, active: true,
      OR: [
        { scope: "SYSTEM", category: equipment.category },
        { scope: "CUSTOMER", organizationId: equipment.organizationId },
        { scope: "LOCATION", locationId: equipment.locationId },
        { scope: "ASSET", equipmentId },
      ],
    },
  });

  const resolved = resolveInterval(
    plans.map((p) => ({ scope: p.scope as PlanScope, intervalDays: p.intervalDays, active: p.active })),
    serviceType.defaultIntervalDays,
  );

  // A newly inventoried asset is due now: it has never been serviced by us, so
  // it should appear on the very next visit rather than in 30 days' time.
  const nextDueAt = nextDueDate(new Date(), 0);

  const schedule = await tx.maintenanceSchedule.upsert({
    where: { equipmentId_serviceTypeId: { equipmentId, serviceTypeId } },
    create: {
      equipmentId, serviceTypeId, intervalDays: resolved.intervalDays,
      intervalSource: resolved.source, nextDueAt, status: scheduleStatus({ nextDueAt }),
    },
    update: { intervalDays: resolved.intervalDays, intervalSource: resolved.source },
  });

  await recordAudit(
    {
      action: "asset.frequency_changed", entityType: "MaintenanceSchedule", entityId: schedule.id,
      actorId, organizationId: equipment.organizationId,
      after: { intervalDays: resolved.intervalDays, source: resolved.source },
    },
    tx,
  );

  return schedule;
}

/** Told about, not blasted: one notification to ops when a customer adds a unit. */
export async function notifyCustomerAddedEquipment(equipmentId: string) {
  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    include: { location: true, organization: true },
  });
  if (!equipment) return;
  await notify({
    type: "CUSTOMER_ADDED_EQUIPMENT",
    title: "New equipment awaiting setup",
    body: `${equipment.name} — ${equipment.organization.name}, ${equipment.location.name}`,
    link: `/admin/equipment/${equipment.id}`,
    dedupeKey: `pending-setup:${equipment.id}`,
    internalRoles: ["OPERATIONS_ADMIN", "SERVICE_MANAGER"],
  });
}
