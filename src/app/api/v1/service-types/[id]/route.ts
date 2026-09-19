import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit/log";
import { ok, fail, route } from "@/lib/api/respond";

/**
 * Change what a service type demands before a technician may call the work
 * done. These are the proof gates the completion path enforces, so loosening
 * one is a deliberate decision about what this company's records are worth —
 * it is recorded in the audit trail with both the before and after.
 */
const schema = z.object({
  requiresNfcVerification: z.boolean().optional(),
  requiresBeforePhoto: z.boolean().optional(),
  requiresAfterPhoto: z.boolean().optional(),
  requiresChecklist: z.boolean().optional(),
  requiresTechnicianNote: z.boolean().optional(),
  defaultIntervalDays: z.number().int().min(1).max(3650).optional(),
});

export const PATCH = route(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("settings.manage");
  const { id } = await context.params;
  const input = schema.parse(await request.json());

  const serviceType = await prisma.serviceType.findUnique({ where: { id } });
  // Another company's service type is not ours to describe, let alone change.
  if (!serviceType || serviceType.serviceCompanyId !== actor.serviceCompanyId) {
    return fail(404, "Not found");
  }

  const before = {
    requiresNfcVerification: serviceType.requiresNfcVerification,
    requiresBeforePhoto: serviceType.requiresBeforePhoto,
    requiresAfterPhoto: serviceType.requiresAfterPhoto,
    requiresChecklist: serviceType.requiresChecklist,
    requiresTechnicianNote: serviceType.requiresTechnicianNote,
    defaultIntervalDays: serviceType.defaultIntervalDays,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.serviceType.update({ where: { id }, data: input });
    await recordAudit(
      {
        action: "serviceType.updated", entityType: "ServiceType", entityId: id,
        actorId: actor.userId, organizationId: null,
        before, after: input,
      },
      tx,
    );
    return next;
  });

  return ok({
    id: updated.id,
    requiresNfcVerification: updated.requiresNfcVerification,
    requiresBeforePhoto: updated.requiresBeforePhoto,
    requiresAfterPhoto: updated.requiresAfterPhoto,
    requiresChecklist: updated.requiresChecklist,
    requiresTechnicianNote: updated.requiresTechnicianNote,
    defaultIntervalDays: updated.defaultIntervalDays,
  });
});
