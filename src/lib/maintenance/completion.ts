/**
 * Completing a service.
 *
 * Two rules drive this file:
 *
 *   1. Proof gates are configurable per service type and are enforced on the
 *      server. If required proof is missing the task does not quietly close -
 *      it is refused with a list of exactly what is missing.
 *   2. The resulting record is immutable. Corrections write a new record that
 *      supersedes the old one; nothing ever edits history in place.
 */
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";
import { nextDueDate, scheduleStatus } from "./engine";
import { notify } from "@/lib/notifications/notify";
import type { Actor } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/session";
import { canAccessAsset, canAccessOrganization } from "@/lib/auth/scope";

export interface ChecklistResultInput {
  templateId?: string | null;
  label: string;
  completed: boolean;
  value?: string | null;
  note?: string | null;
}

export interface PhotoInput {
  kind: "BEFORE" | "AFTER" | "ISSUE";
  blobKey: string;
  capturedAt: string;
  width?: number;
  height?: number;
  bytes?: number;
}

export interface CompleteServiceInput {
  visitTaskId?: string | null;
  equipmentId: string;
  serviceTypeId: string;
  performedAt: Date;
  durationMinutes?: number | null;
  technicianNotes?: string | null;
  customerVisibleNotes?: string | null;
  checklist: ChecklistResultInput[];
  photos: PhotoInput[];
  verificationMethod?: "NFC" | "QR" | "MANUAL" | null;
  nfcTagId?: string | null;
  issues?: { category: string; title: string; description?: string | null; severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" }[];
}

export class ProofIncompleteError extends Error {
  constructor(public missing: string[]) {
    super(`Service proof is incomplete: ${missing.join(", ")}`);
    this.name = "ProofIncompleteError";
  }
}

export interface ProofRequirements {
  requiresNfcVerification: boolean;
  requiresBeforePhoto: boolean;
  requiresAfterPhoto: boolean;
  requiresChecklist: boolean;
  requiresTechnicianNote: boolean;
}

/**
 * Pure so it can be unit-tested and mirrored in the client to grey out the
 * Complete button - but the server's answer is the one that counts.
 */
export function missingProof(
  requirements: ProofRequirements,
  input: Pick<CompleteServiceInput, "checklist" | "photos" | "technicianNotes" | "verificationMethod">,
  requiredChecklistLabels: string[] = [],
): string[] {
  const missing: string[] = [];

  if (requirements.requiresNfcVerification && input.verificationMethod !== "NFC" && input.verificationMethod !== "QR") {
    missing.push("tag verification");
  }
  if (requirements.requiresBeforePhoto && !input.photos.some((p) => p.kind === "BEFORE")) {
    missing.push("before photo");
  }
  if (requirements.requiresAfterPhoto && !input.photos.some((p) => p.kind === "AFTER")) {
    missing.push("after photo");
  }
  if (requirements.requiresTechnicianNote && !input.technicianNotes?.trim()) {
    missing.push("technician note");
  }
  if (requirements.requiresChecklist) {
    const done = new Map(input.checklist.map((c) => [c.label, c.completed]));
    for (const label of requiredChecklistLabels) {
      if (!done.get(label)) missing.push(`checklist: ${label}`);
    }
    if (requiredChecklistLabels.length === 0 && input.checklist.length === 0) {
      missing.push("checklist");
    }
  }

  return missing;
}

/** Content hash over the proof, so later tampering with the row is detectable. */
export function serviceContentHash(parts: {
  equipmentId: string; serviceTypeId: string; technicianId: string;
  performedAt: Date; checklist: ChecklistResultInput[]; photoKeys: string[];
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      equipmentId: parts.equipmentId,
      serviceTypeId: parts.serviceTypeId,
      technicianId: parts.technicianId,
      performedAt: parts.performedAt.toISOString(),
      checklist: parts.checklist.map((c) => [c.label, c.completed, c.value ?? null]),
      photoKeys: [...parts.photoKeys].sort(),
    }))
    .digest("hex");
}

export async function completeService(input: CompleteServiceInput, actor: Actor) {
  const equipment = await prisma.equipment.findUnique({
    where: { id: input.equipmentId },
    include: { location: true },
  });
  if (!equipment) throw new AuthError(404, "Not found");
  if (!canAccessAsset(actor, equipment)) throw new AuthError(404, "Not found");

  const serviceType = await prisma.serviceType.findUnique({
    where: { id: input.serviceTypeId },
    include: { checklistItems: true },
  });
  if (!serviceType) throw new AuthError(404, "Not found");

  const requiredLabels = serviceType.checklistItems.filter((i) => i.required).map((i) => i.label);
  const missing = missingProof(serviceType, input, requiredLabels);
  if (missing.length > 0) throw new ProofIncompleteError(missing);

  const schedule = await prisma.maintenanceSchedule.findUnique({
    where: { equipmentId_serviceTypeId: { equipmentId: input.equipmentId, serviceTypeId: input.serviceTypeId } },
  });
  const intervalDays = schedule?.intervalDays ?? serviceType.defaultIntervalDays;
  const nextDue = nextDueDate(input.performedAt, intervalDays);

  return prisma.$transaction(async (tx) => {
    const record = await tx.serviceRecord.create({
      data: {
        organizationId: equipment.organizationId,
        locationId: equipment.locationId,
        equipmentId: equipment.id,
        serviceTypeId: serviceType.id,
        visitTaskId: input.visitTaskId ?? null,
        visitId: input.visitTaskId
          ? (await tx.visitTask.findUnique({ where: { id: input.visitTaskId } }))?.visitId ?? null
          : null,
        technicianId: actor.userId,
        performedAt: input.performedAt,
        durationMinutes: input.durationMinutes ?? null,
        technicianNotes: input.technicianNotes ?? null,
        customerVisibleNotes: input.customerVisibleNotes ?? null,
        issuesFoundCount: input.issues?.length ?? 0,
        nextDueAt: nextDue,
        nfcVerified: input.verificationMethod === "NFC" || input.verificationMethod === "QR",
        nfcTagId: input.nfcTagId ?? null,
        verificationMethod: input.verificationMethod ?? "MANUAL",
        checklistResults: input.checklist as unknown as Prisma.InputJsonValue,
        contentHash: serviceContentHash({
          equipmentId: equipment.id, serviceTypeId: serviceType.id, technicianId: actor.userId,
          performedAt: input.performedAt, checklist: input.checklist,
          photoKeys: input.photos.map((p) => p.blobKey),
        }),
        photos: {
          create: input.photos.map((p) => ({
            kind: p.kind, blobKey: p.blobKey, capturedAt: new Date(p.capturedAt),
            width: p.width ?? null, height: p.height ?? null, bytes: p.bytes ?? null,
          })),
        },
      },
      include: { photos: true },
    });

    // Issues the technician flagged while on site - the beginning of vendor routing.
    for (const issue of input.issues ?? []) {
      const created = await tx.issue.create({
        data: {
          organizationId: equipment.organizationId,
          locationId: equipment.locationId,
          equipmentId: equipment.id,
          serviceRecordId: record.id,
          source: "TECHNICIAN",
          category: issue.category,
          severity: issue.severity ?? "MEDIUM",
          title: issue.title,
          description: issue.description ?? null,
          reportedById: actor.userId,
          events: { create: { actorId: actor.userId, type: "CREATED", body: issue.description ?? null } },
        },
      });
      await recordAudit(
        { action: "issue.created", entityType: "Issue", entityId: created.id, actorId: actor.userId, organizationId: equipment.organizationId },
        tx,
      );
    }

    await tx.maintenanceSchedule.upsert({
      where: { equipmentId_serviceTypeId: { equipmentId: equipment.id, serviceTypeId: serviceType.id } },
      create: {
        equipmentId: equipment.id, serviceTypeId: serviceType.id, intervalDays,
        lastServiceAt: input.performedAt, nextDueAt: nextDue, status: scheduleStatus({ nextDueAt: nextDue }),
      },
      update: {
        lastServiceAt: input.performedAt, nextDueAt: nextDue, status: scheduleStatus({ nextDueAt: nextDue }),
      },
    });

    if (input.visitTaskId) {
      await tx.visitTask.update({
        where: { id: input.visitTaskId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    await recordAudit(
      {
        action: "service.completed", entityType: "ServiceRecord", entityId: record.id,
        actorId: actor.userId, organizationId: equipment.organizationId,
        after: { equipmentId: equipment.id, serviceTypeId: serviceType.id, nextDueAt: nextDue },
      },
      tx,
    );

    return record;
  });
}

/**
 * Corrections. The original record is left exactly as written; a new record
 * carries the corrected content and points back at what it supersedes.
 */
export async function supersedeService(
  originalId: string,
  input: CompleteServiceInput,
  reason: string,
  actor: Actor,
) {
  const original = await prisma.serviceRecord.findUnique({ where: { id: originalId } });
  if (!original) throw new AuthError(404, "Not found");
  if (!canAccessOrganization(actor, original.organizationId)) throw new AuthError(404, "Not found");

  const replacement = await completeService({ ...input, visitTaskId: null }, actor);
  await prisma.serviceRecord.update({
    where: { id: replacement.id },
    data: { supersedesId: originalId, supersededReason: reason },
  });
  await recordAudit({
    action: "service.edited", entityType: "ServiceRecord", entityId: replacement.id,
    actorId: actor.userId, organizationId: original.organizationId,
    before: { serviceRecordId: originalId }, detail: { reason },
  });
  return replacement;
}

/** Fire notifications after the transaction commits, so a failed send cannot roll back a service. */
export async function notifyServiceCompleted(recordId: string) {
  const record = await prisma.serviceRecord.findUnique({
    where: { id: recordId },
    include: { equipment: true, serviceType: true, location: true },
  });
  if (!record) return;
  await notify({
    organizationId: record.organizationId,
    locationId: record.locationId,
    type: "SERVICE_COMPLETED",
    title: `${record.serviceType.name} completed`,
    body: `${record.equipment.name} at ${record.location.name}`,
    link: `/equipment/${record.equipmentId}`,
    dedupeKey: `service:${record.id}`,
  });
}
