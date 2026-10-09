/**
 * Changing a visit after it is booked: move it, assign it, or call it off.
 *
 * A booked visit used to be fixed — wrong day, wrong person or no longer
 * needed, the only way out was to wait for it to go "missed".
 */
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";
import { canAccessAsset } from "@/lib/auth/scope";
import type { Actor } from "@/lib/auth/session";
import { notify } from "@/lib/notifications/notify";
import { JobError } from "./job-error";
import { formatDateTime } from "@/lib/time/format";

/** Everyone who can be sent to do the work: field staff, and the office roles above them. */
const FIELD_ROLES: Role[] = ["TECHNICIAN", "SERVICE_MANAGER", "OPERATIONS_ADMIN", "SUPER_ADMIN"];

export async function assignableTechnicians(serviceCompanyId: string) {
  return prisma.user.findMany({
    where: {
      serviceCompanyId,
      active: true,
      memberships: { some: { role: { in: FIELD_ROLES }, organizationId: null } },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export interface VisitChange {
  scheduledFor?: Date;
  /** Null unassigns. */
  technicianId?: string | null;
  cancel?: boolean;
}

export async function changeVisit(visitId: string, change: VisitChange, actor: Actor) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { tasks: { select: { status: true } }, location: { select: { name: true, timezone: true } } },
  });
  if (!visit || !canAccessAsset(actor, visit)) throw new JobError("Not found", 404);
  if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
    throw new JobError(`This visit is ${visit.status === "COMPLETED" ? "complete" : "cancelled"} and can no longer be changed.`);
  }

  if (change.cancel) {
    // Work already recorded on it stands; calling off the rest is "skip", not "cancel".
    if (visit.tasks.some((t) => t.status === "COMPLETED")) {
      throw new JobError("Some units on this visit are already done, so it can't be cancelled.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.visitTask.updateMany({
        where: { visitId, status: { in: ["PENDING", "IN_PROGRESS"] } },
        data: { status: "SKIPPED", skipReason: "Visit cancelled" },
      });
      await tx.visit.update({ where: { id: visitId }, data: { status: "CANCELLED" } });
      await recordAudit(
        {
          action: "visit.updated", entityType: "Visit", entityId: visitId, actorId: actor.userId,
          organizationId: visit.organizationId, after: { cancelled: true },
        },
        tx,
      );
    });
    return { cancelled: true };
  }

  let technician: { id: string; name: string } | null | undefined;
  if (change.technicianId !== undefined) {
    if (change.technicianId === null) technician = null;
    else {
      technician = (await assignableTechnicians(actor.serviceCompanyId)).find((t) => t.id === change.technicianId);
      if (!technician) throw new JobError("That person can't be assigned to visits.");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.visit.update({
      where: { id: visitId },
      data: {
        ...(change.scheduledFor ? { scheduledFor: change.scheduledFor } : {}),
        ...(technician !== undefined ? { technicianId: technician?.id ?? null } : {}),
      },
    });
    await recordAudit(
      {
        action: "visit.updated", entityType: "Visit", entityId: visitId, actorId: actor.userId,
        organizationId: visit.organizationId,
        before: { scheduledFor: visit.scheduledFor, technicianId: visit.technicianId },
        after: { scheduledFor: next.scheduledFor, technicianId: next.technicianId },
      },
      tx,
    );
    return next;
  });

  // Tell whoever now has it — unless they assigned it to themselves.
  if (technician && technician.id !== visit.technicianId && technician.id !== actor.userId) {
    await notify({
      type: "VISIT_SCHEDULED",
      title: "Visit assigned to you",
      body: `${visit.location.name} · ${visit.tasks.length} unit${visit.tasks.length === 1 ? "" : "s"} · ${formatDateTime(updated.scheduledFor, visit.location.timezone)}`,
      link: `/tech/visits/${visitId}`,
      dedupeKey: `visit-assigned:${visitId}:${technician.id}`,
      userIds: [technician.id],
    });
  }

  return { cancelled: false, scheduledFor: updated.scheduledFor, technicianId: updated.technicianId };
}
