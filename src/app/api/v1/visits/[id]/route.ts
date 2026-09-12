import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { ok, route } from "@/lib/api/respond";

/** A visit as the technician sees it: tasks grouped by area, in walking order. */
export const GET = route(async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("visit.read");
  const { id } = await ctx.params;

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      location: true,
      organization: { select: { name: true } },
      technician: { select: { id: true, name: true } },
      tasks: {
        include: {
          serviceType: { include: { checklistItems: { orderBy: { sortOrder: "asc" } } } },
          equipment: {
            include: {
              area: true,
              photos: { where: { kind: "IDENTIFICATION" }, take: 1 },
              tagAssignments: { where: { unassignedAt: null } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!visit || !canAccessAsset(actor, visit)) throw new AuthError(404, "Not found");

  return ok({
    visit: {
      id: visit.id,
      scheduledFor: visit.scheduledFor.toISOString(),
      status: visit.status,
      estimatedMinutes: visit.estimatedMinutes,
      locationName: visit.location.name,
      organizationName: visit.organization.name,
      address: [visit.location.addressLine1, visit.location.city, visit.location.state].filter(Boolean).join(", "),
      // Door codes and best-time notes are internal; customers never load this route.
      accessNotes: actor.internal ? visit.location.accessNotes : null,
      technician: visit.technician,
    },
    tasks: visit.tasks.map((t) => ({
      id: t.id,
      status: t.status,
      equipment: {
        id: t.equipment.id,
        name: t.equipment.name,
        internalAssetId: t.equipment.internalAssetId,
        areaName: t.equipment.area?.name ?? "Unassigned",
        areaOrder: t.equipment.area?.sortOrder ?? 999,
        model: t.equipment.model,
        photoBlobKey: t.equipment.photos[0]?.blobKey ?? null,
        hasTag: t.equipment.tagAssignments.length > 0,
      },
      serviceType: {
        id: t.serviceType.id,
        name: t.serviceType.name,
        estimatedMinutes: t.serviceType.estimatedMinutes,
        requirements: {
          nfc: t.serviceType.requiresNfcVerification,
          beforePhoto: t.serviceType.requiresBeforePhoto,
          afterPhoto: t.serviceType.requiresAfterPhoto,
          checklist: t.serviceType.requiresChecklist,
          note: t.serviceType.requiresTechnicianNote,
        },
        checklist: t.serviceType.checklistItems.map((c) => ({
          id: c.id, label: c.label, required: c.required, inputType: c.inputType,
        })),
      },
    })),
  });
});
