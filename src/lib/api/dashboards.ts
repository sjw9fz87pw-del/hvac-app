/**
 * Dashboard read models.
 *
 * Kept out of the route handlers so the same numbers back the API, the server
 * components and any future report - there is one definition of "overdue".
 */
import { prisma } from "@/lib/db/client";
import { maintenanceHealth } from "@/lib/maintenance/engine";
import type { Actor } from "@/lib/auth/session";
import { organizationScope } from "@/lib/auth/scope";

const OPEN_ISSUE_STATUSES = ["OPEN", "TRIAGED", "ASSIGNED", "IN_PROGRESS"] as const;

export interface CustomerDashboard {
  scope: { organizationId: string | null; locationId: string | null; locationName: string | null };
  totals: { assets: number; current: number; dueSoon: number; overdue: number; openIssues: number };
  health: ReturnType<typeof maintenanceHealth>;
  recentlyServiced: { id: string; equipmentName: string; serviceType: string; performedAt: string; technician: string }[];
  nextVisit: { id: string; scheduledFor: string; taskCount: number; locationName: string } | null;
  areas: { id: string; name: string; assetCount: number; overdue: number; dueSoon: number }[];
  yearToDate: { servicesCompleted: number; issuesIdentified: number };
}

export async function customerDashboard(
  actor: Actor,
  filter: { organizationId?: string | null; locationId?: string | null } = {},
): Promise<CustomerDashboard> {
  const orgScope = organizationScope(actor);
  const equipmentWhere = {
    archivedAt: null,
    status: { not: "ARCHIVED" as const },
    ...(filter.locationId ? { locationId: filter.locationId } : {}),
    ...(filter.organizationId
      ? { organizationId: filter.organizationId }
      : orgScope
        ? { organizationId: { in: orgScope.length ? orgScope : ["__none__"] } }
        : {}),
    ...(!filter.locationId && actor.locationIds ? { locationId: { in: [...actor.locationIds] } } : {}),
  };

  const equipment = await prisma.equipment.findMany({
    where: equipmentWhere,
    select: {
      id: true, areaId: true, locationId: true,
      area: { select: { id: true, name: true, sortOrder: true } },
      schedules: { select: { status: true } },
    },
  });

  const assetIds = equipment.map((e) => e.id);

  // An asset is counted once, at its worst status across service types.
  let overdue = 0, dueSoon = 0, current = 0;
  const areaMap = new Map<string, { id: string; name: string; assetCount: number; overdue: number; dueSoon: number }>();

  for (const e of equipment) {
    const statuses = e.schedules.map((s) => s.status);
    const isOverdue = statuses.includes("OVERDUE");
    const isDue = !isOverdue && (statuses.includes("DUE") || statuses.includes("SCHEDULE_NEEDED"));
    if (isOverdue) overdue++;
    else if (isDue) dueSoon++;
    else current++;

    const key = e.area?.id ?? "unassigned";
    const entry = areaMap.get(key) ?? { id: key, name: e.area?.name ?? "Unassigned", assetCount: 0, overdue: 0, dueSoon: 0 };
    entry.assetCount++;
    if (isOverdue) entry.overdue++;
    else if (isDue) entry.dueSoon++;
    areaMap.set(key, entry);
  }

  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [openIssues, criticalIssues, recent, nextVisit, ytdServices, ytdIssues, onTime] = await Promise.all([
    prisma.issue.count({ where: { equipmentId: { in: assetIds }, status: { in: [...OPEN_ISSUE_STATUSES] } } }),
    prisma.issue.count({ where: { equipmentId: { in: assetIds }, status: { in: [...OPEN_ISSUE_STATUSES] }, severity: "CRITICAL" } }),
    prisma.serviceRecord.findMany({
      where: { equipmentId: { in: assetIds } },
      include: { equipment: { select: { name: true } }, serviceType: { select: { name: true } }, technician: { select: { name: true } } },
      orderBy: { performedAt: "desc" }, take: 6,
    }),
    prisma.visit.findFirst({
      where: {
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        scheduledFor: { gte: new Date() },
        ...(filter.locationId ? { locationId: filter.locationId } : {}),
        ...(filter.organizationId ? { organizationId: filter.organizationId } : orgScope ? { organizationId: { in: orgScope.length ? orgScope : ["__none__"] } } : {}),
      },
      include: { tasks: { select: { id: true } }, location: { select: { name: true } } },
      orderBy: { scheduledFor: "asc" },
    }),
    prisma.serviceRecord.count({ where: { equipmentId: { in: assetIds }, performedAt: { gte: yearStart } } }),
    prisma.issue.count({ where: { equipmentId: { in: assetIds }, createdAt: { gte: yearStart } } }),
    prisma.serviceRecord.findMany({
      where: { equipmentId: { in: assetIds }, performedAt: { gte: yearStart } },
      select: { performedAt: true, nextDueAt: true },
      take: 500,
    }),
  ]);

  // On-time rate: services performed on or before the date they were due.
  const punctual = onTime.filter((r) => !r.nextDueAt || r.performedAt <= r.nextDueAt).length;
  const onTimeRate = onTime.length > 0 ? punctual / onTime.length : undefined;

  const location = filter.locationId
    ? await prisma.restaurantLocation.findUnique({ where: { id: filter.locationId }, select: { name: true } })
    : null;

  return {
    scope: { organizationId: filter.organizationId ?? null, locationId: filter.locationId ?? null, locationName: location?.name ?? null },
    totals: { assets: equipment.length, current, dueSoon, overdue, openIssues },
    health: maintenanceHealth({
      totalAssets: equipment.length, assetsCurrent: current, assetsDue: dueSoon,
      assetsOverdue: overdue, openIssues, criticalIssues, onTimeRate,
    }),
    recentlyServiced: recent.map((r) => ({
      id: r.id, equipmentName: r.equipment.name, serviceType: r.serviceType.name,
      performedAt: r.performedAt.toISOString(), technician: r.technician.name,
    })),
    nextVisit: nextVisit
      ? { id: nextVisit.id, scheduledFor: nextVisit.scheduledFor.toISOString(), taskCount: nextVisit.tasks.length, locationName: nextVisit.location.name }
      : null,
    areas: [...areaMap.values()].sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name)),
    yearToDate: { servicesCompleted: ytdServices, issuesIdentified: ytdIssues },
  };
}

export interface CommandCenter {
  today: {
    restaurants: { id: string; name: string; organizationName: string; taskCount: number; completed: number; technician: string | null; status: string }[];
    equipmentScheduled: number;
    servicesCompleted: number;
    servicesRemaining: number;
    techniciansWorking: number;
  };
  exceptions: {
    overdueAssets: number;
    missedVisits: number;
    customerReportedProblems: number;
    assetsWithoutTags: number;
    assetsAwaitingVerification: number;
    failedTagPairings: number;
    incompleteProof: number;
    technicianExceptions: { technicianId: string; technicianName: string; issue: string }[];
  };
}

export async function commandCenter(actor: Actor, now = new Date()): Promise<CommandCenter> {
  const scope = organizationScope(actor);
  const orgFilter = scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {};

  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [todayVisits, overdueAssets, missedVisits, customerIssues, assetsWithoutTags, awaitingVerification, failedPairings, incompleteTasks] =
    await Promise.all([
      prisma.visit.findMany({
        where: { ...orgFilter, scheduledFor: { gte: dayStart, lt: dayEnd } },
        include: {
          location: { select: { id: true, name: true } },
          organization: { select: { name: true } },
          technician: { select: { id: true, name: true } },
          tasks: { select: { status: true } },
        },
        orderBy: { scheduledFor: "asc" },
      }),
      prisma.maintenanceSchedule.count({
        where: { status: "OVERDUE", equipment: { archivedAt: null, ...orgFilter } },
      }),
      prisma.visit.count({
        where: { ...orgFilter, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledFor: { lt: dayStart } },
      }),
      prisma.issue.count({
        where: { ...orgFilter, source: "CUSTOMER", status: { in: [...OPEN_ISSUE_STATUSES] } },
      }),
      prisma.equipment.count({
        where: {
          ...orgFilter, archivedAt: null, status: { in: ["ACTIVE", "NEEDS_ATTENTION"] },
          tagAssignments: { none: { unassignedAt: null } },
        },
      }),
      prisma.equipment.count({ where: { ...orgFilter, status: "PENDING_SETUP", archivedAt: null } }),
      prisma.tagEvent.count({ where: { type: { in: ["WRITE_FAILED", "VERIFY_FAILED"] }, createdAt: { gte: dayAgo } } }),
      // Started but never completed: proof was begun and abandoned.
      prisma.visitTask.findMany({
        where: {
          status: "IN_PROGRESS", startedAt: { lt: dayAgo },
          visit: { ...orgFilter },
        },
        include: { visit: { include: { technician: { select: { id: true, name: true } } } }, equipment: { select: { name: true } } },
        take: 20,
      }),
    ]);

  const technicianExceptions = incompleteTasks
    .filter((t) => t.visit.technician)
    .map((t) => ({
      technicianId: t.visit.technician!.id,
      technicianName: t.visit.technician!.name,
      issue: `Left ${t.equipment.name} in progress without completing proof`,
    }));

  const allTasks = todayVisits.flatMap((v) => v.tasks);

  return {
    today: {
      restaurants: todayVisits.map((v) => ({
        id: v.id, name: v.location.name, organizationName: v.organization.name,
        taskCount: v.tasks.length,
        completed: v.tasks.filter((t) => t.status === "COMPLETED").length,
        technician: v.technician?.name ?? null,
        status: v.status,
      })),
      equipmentScheduled: allTasks.length,
      servicesCompleted: allTasks.filter((t) => t.status === "COMPLETED").length,
      servicesRemaining: allTasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length,
      techniciansWorking: new Set(todayVisits.filter((v) => v.status === "IN_PROGRESS").map((v) => v.technicianId).filter(Boolean)).size,
    },
    exceptions: {
      overdueAssets, missedVisits, customerReportedProblems: customerIssues,
      assetsWithoutTags, assetsAwaitingVerification: awaitingVerification,
      failedTagPairings: failedPairings, incompleteProof: incompleteTasks.length,
      technicianExceptions,
    },
  };
}
