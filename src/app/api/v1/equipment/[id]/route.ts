import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { canAccessAsset, canSeeInternalNotes } from "@/lib/auth/scope";
import { toCustomerEquipment, toCustomerServiceRecord } from "@/lib/api/serializers";
import { ok, route } from "@/lib/api/respond";

/**
 * The Equipment Passport. Service history is loaded alongside the asset and is
 * never filtered by the asset's current state - archiving a unit does not hide
 * what was done to it.
 */
export const GET = route(async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("equipment.read");
  const { id } = await ctx.params;

  const equipment = await prisma.equipment.findUnique({
    where: { id },
    include: {
      area: true, location: true, organization: true,
      photos: { orderBy: { capturedAt: "asc" } },
      documents: true,
      schedules: { include: { serviceType: true } },
      tagAssignments: { include: { tag: true }, orderBy: { assignedAt: "desc" } },
      serviceRecords: {
        include: { serviceType: true, technician: true, photos: true },
        orderBy: { performedAt: "desc" },
        take: 50,
      },
      issues: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  // Out of scope is reported as "not found": confirming existence would itself
  // leak another customer's data.
  if (!equipment || !canAccessAsset(actor, equipment)) {
    throw new AuthError(404, "Not found");
  }

  const internal = canSeeInternalNotes(actor);
  const currentTag = equipment.tagAssignments.find((a) => a.unassignedAt === null);

  return ok({
    equipment: {
      ...toCustomerEquipment(equipment),
      organizationName: equipment.organization.name,
      ...(internal
        ? {
            technicianNotes: equipment.technicianNotes,
            createdBySource: equipment.createdBySource,
            verifiedAt: equipment.verifiedAt?.toISOString() ?? null,
            archivedAt: equipment.archivedAt?.toISOString() ?? null,
            tag: currentTag ? { id: currentTag.tagId, state: currentTag.tag.state, assignedAt: currentTag.assignedAt.toISOString() } : null,
            tagHistory: equipment.tagAssignments.map((a) => ({
              tagId: a.tagId, state: a.tag.state, label: a.tag.label,
              assignedAt: a.assignedAt.toISOString(),
              unassignedAt: a.unassignedAt?.toISOString() ?? null,
              reason: a.unassignReason,
            })),
          }
        : {}),
    },
    history: equipment.serviceRecords.map(toCustomerServiceRecord),
    issues: equipment.issues.map((i) => ({
      id: i.id, title: i.title, category: i.category, status: i.status,
      severity: i.severity, createdAt: i.createdAt.toISOString(),
    })),
  });
});
