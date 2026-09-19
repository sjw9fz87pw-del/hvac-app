/**
 * Moving restaurants between groups.
 *
 * A group is a CustomerOrganization and a restaurant is a RestaurantLocation,
 * so "grouping" is re-parenting the location. That pointer is denormalised onto
 * every row underneath it — equipment, issues, visits, service records, tags,
 * memberships all carry organizationId so tenant scoping can be a single indexed
 * predicate rather than a join. Re-parenting therefore has to move all of them,
 * in one transaction, or the tenant boundary develops a hole.
 *
 * Two things deliberately do NOT move:
 *
 *   AuditEvent — it records what happened under the tenancy in force at the
 *   time. Rewriting history to match the present is exactly what an audit trail
 *   exists to prevent.
 *
 *   Subscription — billing is attached to the group, not the restaurant, so it
 *   stays with the group that holds the contract.
 *
 * Service records do move, and that is safe: serviceContentHash covers the
 * equipment, service type, technician, timestamp, checklist and photos. The
 * organization pointer is not part of the proof, so moving it cannot
 * invalidate a hash or alter what a record claims happened.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";

export interface MoveResult {
  movedLocations: number;
  movedEquipment: number;
  groupId: string;
  groupName: string;
}

async function reparent(
  tx: Prisma.TransactionClient,
  locationId: string,
  fromOrganizationId: string,
  toOrganizationId: string,
): Promise<number> {
  const where = { locationId, organizationId: fromOrganizationId };
  const data = { organizationId: toOrganizationId };

  // Tags are bound to the tenant but reached through the equipment they are
  // paired to, so collect them before the equipment rows move.
  const tagIds = (
    await tx.tagAssignment.findMany({
      where: { unassignedAt: null, equipment: { locationId } },
      select: { tagId: true },
    })
  ).map((row) => row.tagId);

  const equipment = await tx.equipment.updateMany({ where, data });
  await tx.issue.updateMany({ where, data });
  await tx.visit.updateMany({ where, data });
  await tx.serviceRecord.updateMany({ where, data });
  await tx.maintenancePlan.updateMany({ where, data });
  // A location manager follows their restaurant; an org-wide membership does not.
  await tx.membership.updateMany({ where, data });

  if (tagIds.length > 0) {
    await tx.tag.updateMany({ where: { id: { in: tagIds } }, data });
  }

  await tx.restaurantLocation.update({
    where: { id: locationId },
    data: { organizationId: toOrganizationId },
  });

  return equipment.count;
}

/**
 * Put `locationIds` into a group — an existing one, or a new one by name.
 * Callers must have already checked that every location is inside the actor's
 * scope; this does the movement, not the authorisation.
 */
export async function assignToGroup(
  locationIds: string[],
  target: { groupId: string } | { newGroupName: string },
  actor: { userId: string; serviceCompanyId: string },
  client: PrismaClient = prisma,
): Promise<MoveResult> {
  return client.$transaction(async (tx) => {
    const locations = await tx.restaurantLocation.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, name: true, organizationId: true },
    });
    if (locations.length === 0) throw new Error("No restaurants to move");

    let group: { id: string; name: string };
    if ("groupId" in target) {
      group = await tx.customerOrganization.findUniqueOrThrow({
        where: { id: target.groupId },
        select: { id: true, name: true },
      });
    } else {
      const name = target.newGroupName.trim();
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
      // Slugs are unique per service company, so settle collisions here rather
      // than letting the insert fail.
      let slug = base;
      for (let n = 2; n < 100; n++) {
        const clash = await tx.customerOrganization.findFirst({
          where: { serviceCompanyId: actor.serviceCompanyId, slug },
          select: { id: true },
        });
        if (!clash) break;
        slug = `${base}-${n}`;
      }
      group = await tx.customerOrganization.create({
        data: { serviceCompanyId: actor.serviceCompanyId, name, slug },
        select: { id: true, name: true },
      });
    }

    let movedEquipment = 0;
    let movedLocations = 0;
    for (const location of locations) {
      if (location.organizationId === group.id) continue;
      movedEquipment += await reparent(tx, location.id, location.organizationId, group.id);
      movedLocations += 1;
      await recordAudit(
        {
          action: "location.updated", entityType: "RestaurantLocation", entityId: location.id,
          actorId: actor.userId, organizationId: group.id,
          before: { organizationId: location.organizationId },
          after: { organizationId: group.id, groupName: group.name },
        },
        tx,
      );
    }

    return { movedLocations, movedEquipment, groupId: group.id, groupName: group.name };
  });
}

/**
 * Groups holding no restaurants are noise on every picker. Remove the empty
 * ones this move left behind, but never one that still owns anything.
 */
export async function pruneEmptyGroups(serviceCompanyId: string, client: PrismaClient = prisma): Promise<number> {
  const empty = await client.customerOrganization.findMany({
    where: {
      serviceCompanyId,
      locations: { none: {} },
      memberships: { none: {} },
      equipment: { none: {} },
      subscriptions: { none: {} },
    },
    select: { id: true },
  });
  if (empty.length === 0) return 0;
  const result = await client.customerOrganization.deleteMany({
    where: { id: { in: empty.map((g) => g.id) } },
  });
  return result.count;
}
