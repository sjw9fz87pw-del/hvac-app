/**
 * Removing units.
 *
 * The same rule the rest of the app follows: anything that recorded work is
 * kept, anything that never did can go. A unit that has been serviced is
 * refused — the service record names it, and that naming is the product.
 * Archiving exists for those, and keeps the history attached.
 *
 * What is left is a unit typed twice, or added to the wrong restaurant, or
 * entered while learning the app. Those should not be permanent.
 *
 * Nothing here cascades at the database level, deliberately: a deletion has to
 * state what it removes rather than discover it, so the children come out in
 * dependency order and anything unexpected fails the transaction.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";

export interface EquipmentBlockers {
  /** Human-readable reasons this unit cannot simply be deleted. */
  blockers: string[];
  /** Work that has not happened yet, which deletion cancels rather than blocks. */
  pendingTasks: number;
  hasTag: boolean;
}

/** What stops this unit being deleted, and what deleting it would take with it. */
export async function equipmentDeletionCheck(
  equipmentId: string,
  client: PrismaClient = prisma,
): Promise<EquipmentBlockers> {
  const [services, issues, doneTasks, pendingTasks, tags] = await Promise.all([
    client.serviceRecord.count({ where: { equipmentId } }),
    client.issue.count({ where: { equipmentId } }),
    client.visitTask.count({ where: { equipmentId, status: { in: ["COMPLETED", "SKIPPED"] } } }),
    client.visitTask.count({ where: { equipmentId, status: { in: ["PENDING", "IN_PROGRESS"] } } }),
    client.tagAssignment.count({ where: { equipmentId, unassignedAt: null } }),
  ]);

  const blockers: string[] = [];
  if (services > 0) blockers.push(`${services} service record${services === 1 ? "" : "s"}`);
  if (issues > 0) blockers.push(`${issues} issue${issues === 1 ? "" : "s"}`);
  if (doneTasks > 0) blockers.push(`${doneTasks} completed visit task${doneTasks === 1 ? "" : "s"}`);

  return { blockers, pendingTasks, hasTag: tags > 0 };
}

/**
 * Delete a unit. Callers must have checked `equipmentDeletionCheck` first;
 * this performs the removal, not the judgement.
 */
export async function deleteEquipment(
  equipmentId: string,
  actor: { userId: string },
  client: PrismaClient = prisma,
): Promise<{ name: string; organizationId: string }> {
  return client.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUniqueOrThrow({
      where: { id: equipmentId },
      select: { id: true, name: true, organizationId: true, locationId: true },
    });

    // A tag is a physical object that outlives the unit it was stuck to, so it
    // goes back to unassigned stock rather than being destroyed with it.
    const assignments = await tx.tagAssignment.findMany({
      where: { equipmentId }, select: { tagId: true },
    });
    const tagIds = [...new Set(assignments.map((a) => a.tagId))];
    await tx.tagAssignment.deleteMany({ where: { equipmentId } });
    if (tagIds.length > 0) {
      await tx.tag.updateMany({
        where: { id: { in: tagIds } },
        data: { state: "UNASSIGNED", organizationId: null },
      });
    }

    const sensors = await tx.sensorDevice.findMany({ where: { equipmentId }, select: { id: true } });
    if (sensors.length > 0) {
      await tx.sensorReading.deleteMany({ where: { deviceId: { in: sensors.map((s) => s.id) } } });
      await tx.sensorDevice.deleteMany({ where: { equipmentId } });
    }

    // Scheduled-but-unstarted work disappears with the unit; completed work
    // would have blocked the deletion before reaching here.
    await tx.visitTask.deleteMany({ where: { equipmentId } });
    await tx.subscriptionAsset.deleteMany({ where: { equipmentId } });
    await tx.aiExtraction.deleteMany({ where: { equipmentId } });
    await tx.repairCost.deleteMany({ where: { equipmentId } });
    await tx.partUsage.deleteMany({ where: { equipmentId } });
    await tx.equipmentPhoto.deleteMany({ where: { equipmentId } });
    await tx.equipmentDocument.deleteMany({ where: { equipmentId } });
    await tx.maintenanceSchedule.deleteMany({ where: { equipmentId } });
    await tx.maintenancePlan.deleteMany({ where: { equipmentId } });
    // A unit can point at the one that replaced it; clear that or the
    // self-relation blocks the delete.
    await tx.equipment.updateMany({ where: { replacedByAssetId: equipmentId }, data: { replacedByAssetId: null } });

    await tx.equipment.delete({ where: { id: equipmentId } });

    await recordAudit(
      {
        action: "asset.deleted", entityType: "Equipment", entityId: equipmentId,
        actorId: actor.userId, organizationId: equipment.organizationId,
        before: { name: equipment.name, locationId: equipment.locationId },
      },
      tx,
    );

    return { name: equipment.name, organizationId: equipment.organizationId };
  });
}
