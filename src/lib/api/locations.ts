/**
 * Removing restaurants.
 *
 * Same rule as accounts: anything that recorded work is kept, anything that
 * never did can go. A restaurant that has been serviced, visited or had an
 * issue raised against it is refused outright — those rows name it, and the
 * naming is the point. What is left is a restaurant somebody typed wrong, or
 * one set up and never used, and that should not be stuck in the list forever.
 *
 * Almost nothing in this schema cascades on delete, which is deliberate: it
 * means a deletion has to state exactly what it is removing rather than
 * discovering it at the database level. So the children are removed in
 * dependency order, and anything unexpected fails the transaction instead of
 * quietly orphaning rows.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";
import { pruneEmptyGroups } from "./groups";

export interface LocationBlockers {
  blockers: string[];
  equipment: number;
}

/** What stops this restaurant being deleted, and what would go with it. */
export async function locationDeletionCheck(
  locationId: string,
  client: PrismaClient = prisma,
): Promise<LocationBlockers> {
  const [services, visits, issues, equipment] = await Promise.all([
    client.serviceRecord.count({ where: { locationId } }),
    client.visit.count({ where: { locationId } }),
    client.issue.count({ where: { locationId } }),
    client.equipment.count({ where: { locationId } }),
  ]);

  const blockers: string[] = [];
  if (services > 0) blockers.push(`${services} service record${services === 1 ? "" : "s"}`);
  if (visits > 0) blockers.push(`${visits} visit${visits === 1 ? "" : "s"}`);
  if (issues > 0) blockers.push(`${issues} issue${issues === 1 ? "" : "s"}`);
  return { blockers, equipment };
}

/**
 * Delete a restaurant and everything beneath it. Callers must have checked
 * `locationDeletionCheck` first; this does the removal, not the judgement.
 */
export async function deleteLocation(
  locationId: string,
  actor: { userId: string; serviceCompanyId: string },
  client: PrismaClient = prisma,
): Promise<{ equipment: number; name: string }> {
  const result = await client.$transaction(async (tx) => {
    const location = await tx.restaurantLocation.findUniqueOrThrow({
      where: { id: locationId },
      select: { id: true, name: true, organizationId: true },
    });

    const equipment = await tx.equipment.findMany({
      where: { locationId }, select: { id: true },
    });
    const equipmentIds = equipment.map((e) => e.id);

    if (equipmentIds.length > 0) {
      // Tags are physical objects that outlive the asset they were stuck to:
      // release them back to unassigned stock rather than deleting the record
      // of a chip that still exists on somebody's shelf.
      const assignments = await tx.tagAssignment.findMany({
        where: { equipmentId: { in: equipmentIds } }, select: { tagId: true },
      });
      const tagIds = [...new Set(assignments.map((a) => a.tagId))];
      await tx.tagAssignment.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      if (tagIds.length > 0) {
        await tx.tag.updateMany({
          where: { id: { in: tagIds } },
          data: { state: "UNASSIGNED", organizationId: null },
        });
      }

      const sensors = await tx.sensorDevice.findMany({
        where: { equipmentId: { in: equipmentIds } }, select: { id: true },
      });
      if (sensors.length > 0) {
        await tx.sensorReading.deleteMany({ where: { deviceId: { in: sensors.map((s) => s.id) } } });
        await tx.sensorDevice.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      }

      await tx.subscriptionAsset.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await tx.aiExtraction.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await tx.repairCost.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await tx.partUsage.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await tx.equipmentPhoto.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await tx.equipmentDocument.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await tx.maintenanceSchedule.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      await tx.maintenancePlan.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
      // An asset can point at the one that replaced it; clear that first or the
      // self-relation blocks the delete.
      await tx.equipment.updateMany({
        where: { replacedByAssetId: { in: equipmentIds } }, data: { replacedByAssetId: null },
      });
      await tx.equipment.deleteMany({ where: { id: { in: equipmentIds } } });
    }

    await tx.maintenancePlan.deleteMany({ where: { locationId } });
    // Managers scoped to this one restaurant lose the membership, not the account.
    await tx.membership.deleteMany({ where: { locationId } });
    await tx.area.deleteMany({ where: { locationId } });
    await tx.restaurantLocation.delete({ where: { id: locationId } });

    await recordAudit(
      {
        action: "location.deleted", entityType: "RestaurantLocation", entityId: locationId,
        actorId: actor.userId, organizationId: location.organizationId,
        before: { name: location.name, equipment: equipmentIds.length },
      },
      tx,
    );

    return { equipment: equipmentIds.length, name: location.name };
  });

  // A group left holding nothing is clutter on every picker.
  await pruneEmptyGroups(actor.serviceCompanyId, client);
  return result;
}
