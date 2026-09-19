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
  // A manager scoped to this restaurant follows it. Memberships scoped to the
  // whole group are handled by the caller, which alone can see whether the
  // group still has anything left in it.
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
/** A slug free of collisions within the service company. */
export async function uniqueGroupSlug(
  tx: Prisma.TransactionClient,
  serviceCompanyId: string,
  name: string,
): Promise<string> {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
  let slug = base;
  for (let n = 2; n < 100; n++) {
    const clash = await tx.customerOrganization.findFirst({
      where: { serviceCompanyId, slug }, select: { id: true },
    });
    if (!clash) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

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
      group = await tx.customerOrganization.create({
        data: {
          serviceCompanyId: actor.serviceCompanyId,
          name,
          slug: await uniqueGroupSlug(tx, actor.serviceCompanyId, name),
        },
        select: { id: true, name: true },
      });
    }

    const sourceGroupIds = [...new Set(locations.map((l) => l.organizationId))].filter((id) => id !== group.id);

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

    // Anyone scoped to a group rather than a single restaurant would otherwise
    // be left pointing at an empty group — signed in, with nothing to see. If
    // this move took the last restaurant out, their access follows it.
    for (const sourceId of sourceGroupIds) {
      const left = await tx.restaurantLocation.count({ where: { organizationId: sourceId } });
      if (left > 0) continue;
      await tx.membership.updateMany({
        where: { organizationId: sourceId, locationId: null },
        data: { organizationId: group.id },
      });
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

/**
 * Dissolve a group: its restaurants go back to the ungrouped bucket and the
 * group itself is removed. Nothing underneath a restaurant is touched beyond
 * the tenant pointer every row already carries, which `reparent` moves.
 */
export async function ungroup(
  groupId: string,
  actor: { userId: string; serviceCompanyId: string },
  defaultSlug: string,
  client: PrismaClient = prisma,
): Promise<{ moved: number; name: string }> {
  return client.$transaction(async (tx) => {
    const group = await tx.customerOrganization.findUniqueOrThrow({
      where: { id: groupId },
      select: { id: true, name: true, slug: true },
    });

    // The bucket restaurants sit in before anyone has grouped anything. It is
    // created at setup, but a deployment that never had one still needs
    // somewhere for these to land.
    let bucket = await tx.customerOrganization.findFirst({
      where: { serviceCompanyId: actor.serviceCompanyId, slug: defaultSlug },
      select: { id: true },
    });
    if (!bucket) {
      bucket = await tx.customerOrganization.create({
        data: { serviceCompanyId: actor.serviceCompanyId, name: "My Restaurants", slug: defaultSlug },
        select: { id: true },
      });
    }

    if (bucket.id === group.id) throw new Error("That is the ungrouped list, not a group");

    const locations = await tx.restaurantLocation.findMany({
      where: { organizationId: group.id }, select: { id: true },
    });
    for (const location of locations) {
      await reparent(tx, location.id, group.id, bucket.id);
    }

    // Anything still pointing at the group would block the delete; org-wide
    // memberships move with it rather than being dropped.
    await tx.membership.updateMany({
      where: { organizationId: group.id }, data: { organizationId: bucket.id },
    });

    await recordAudit(
      {
        action: "org.deleted", entityType: "CustomerOrganization", entityId: group.id,
        actorId: actor.userId, organizationId: bucket.id,
        before: { name: group.name, restaurants: locations.length },
      },
      tx,
    );

    await tx.customerOrganization.delete({ where: { id: group.id } });
    return { moved: locations.length, name: group.name };
  });
}
