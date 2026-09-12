/**
 * Notifications, without the spam.
 *
 * Three guards: a dedupe key unique per (user, type, key) so the same event can
 * never be delivered twice; per-user preferences; and audience resolution that
 * targets the people actually responsible for a location rather than blasting an
 * organization.
 */
import { Prisma, type NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Stable per real-world event. Repeat calls with the same key are no-ops. */
  dedupeKey: string;
  /** Customer audience. */
  organizationId?: string | null;
  locationId?: string | null;
  /** Internal audience: notify staff holding any of these roles. */
  internalRoles?: ("SUPER_ADMIN" | "OPERATIONS_ADMIN" | "SERVICE_MANAGER")[];
  /** Explicit recipients, bypassing audience resolution. */
  userIds?: string[];
}

async function resolveAudience(input: NotifyInput): Promise<string[]> {
  if (input.userIds?.length) return input.userIds;

  const ids = new Set<string>();

  if (input.organizationId) {
    const memberships = await prisma.membership.findMany({
      where: {
        organizationId: input.organizationId,
        role: { in: ["CUSTOMER_ORG_OWNER", "CUSTOMER_LOCATION_MANAGER"] },
      },
      select: { userId: true, role: true, locationId: true },
    });
    for (const m of memberships) {
      // Location managers only hear about their own location.
      if (m.role === "CUSTOMER_LOCATION_MANAGER" && input.locationId && m.locationId && m.locationId !== input.locationId) {
        continue;
      }
      ids.add(m.userId);
    }
  }

  if (input.internalRoles?.length) {
    const staff = await prisma.membership.findMany({
      where: { role: { in: input.internalRoles } },
      select: { userId: true },
    });
    for (const s of staff) ids.add(s.userId);
  }

  return [...ids];
}

export async function notify(input: NotifyInput): Promise<number> {
  const audience = await resolveAudience(input);
  if (audience.length === 0) return 0;

  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: { in: audience }, type: input.type },
  });
  const optedOut = new Set(prefs.filter((p) => !p.inApp).map((p) => p.userId));
  const recipients = audience.filter((id) => !optedOut.has(id));
  if (recipients.length === 0) return 0;

  const result = await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId, type: input.type, title: input.title,
      body: input.body ?? null, link: input.link ?? null, dedupeKey: input.dedupeKey,
    })),
    // The unique index on (userId, type, dedupeKey) is what makes this idempotent.
    skipDuplicates: true,
  });

  return result.count;
}

export async function markRead(userId: string, notificationIds: string[]) {
  await prisma.notification.updateMany({
    where: { userId, id: { in: notificationIds }, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/**
 * Overdue maintenance is digested, not per-asset: one notification per location
 * per day naming the count, rather than one per piece of equipment.
 */
export async function notifyOverdueDigest(now = new Date()): Promise<number> {
  const overdue = await prisma.maintenanceSchedule.groupBy({
    by: ["equipmentId"],
    where: { status: "OVERDUE", equipment: { archivedAt: null } },
  });
  if (overdue.length === 0) return 0;

  const equipment = await prisma.equipment.findMany({
    where: { id: { in: overdue.map((o) => o.equipmentId) } },
    select: { id: true, organizationId: true, locationId: true, location: { select: { name: true } } },
  });

  const byLocation = new Map<string, { organizationId: string; locationName: string; count: number }>();
  for (const e of equipment) {
    const entry = byLocation.get(e.locationId) ?? { organizationId: e.organizationId, locationName: e.location.name, count: 0 };
    entry.count++;
    byLocation.set(e.locationId, entry);
  }

  const day = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const [locationId, entry] of byLocation) {
    sent += await notify({
      type: "OVERDUE_MAINTENANCE",
      title: `${entry.count} overdue maintenance item${entry.count === 1 ? "" : "s"}`,
      body: entry.locationName,
      link: `/equipment?status=OVERDUE&locationId=${locationId}`,
      dedupeKey: `overdue:${locationId}:${day}`,
      organizationId: entry.organizationId,
      locationId,
      internalRoles: ["OPERATIONS_ADMIN", "SERVICE_MANAGER"],
    });
  }
  return sent;
}

export const json = Prisma.JsonNull;
