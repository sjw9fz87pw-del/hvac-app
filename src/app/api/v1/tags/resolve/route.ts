import { NextRequest } from "next/server";
import { z } from "zod";
import { parseTagUrl, denialMessage } from "@pmops/nfc-core";
import { prisma } from "@/lib/db/client";
import { requireActor, requestMeta } from "@/lib/auth/session";
import { canSeeInternalNotes } from "@/lib/auth/scope";
import { resolveTap } from "@/lib/nfc/service";
import { toCustomerEquipment, toCustomerServiceRecord } from "@/lib/api/serializers";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({ payload: z.string().min(1) });

/**
 * The tap endpoint. NFC and QR both land here with the same payload, so the QR
 * fallback is not a second-class path.
 *
 * Every denial returns one generic message; distinguishing "no such tag" from
 * "not yours" would let someone enumerate valid tags.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireActor();
  const { payload: raw } = schema.parse(await request.json());
  const payload = parseTagUrl(raw) ?? raw;
  const meta = await requestMeta();

  const outcome = await resolveTap(payload, { actor, ...meta });
  if (!outcome.ok) return fail(404, denialMessage(outcome.reason));

  const equipment = await prisma.equipment.findUnique({
    where: { id: outcome.equipmentId },
    include: {
      area: true, location: true, photos: true,
      schedules: { include: { serviceType: true } },
      tagAssignments: { where: { unassignedAt: null } },
      serviceRecords: {
        include: { serviceType: true, technician: true, photos: true },
        orderBy: { performedAt: "desc" }, take: 10,
      },
    },
  });
  if (!equipment) return fail(404, denialMessage("UNKNOWN_TAG"));

  // The technician's open task for this asset, if there is one - this is what
  // makes "tap the tag and start working" a single step.
  const openTask = actor.internal
    ? await prisma.visitTask.findFirst({
        where: {
          equipmentId: equipment.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          visit: { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, ...(actor.roles.includes("TECHNICIAN") ? { technicianId: actor.userId } : {}) },
        },
        include: { serviceType: true, visit: true },
        orderBy: { sortOrder: "asc" },
      })
    : null;

  return ok({
    tagId: outcome.tagId,
    equipment: {
      ...toCustomerEquipment(equipment),
      ...(canSeeInternalNotes(actor) ? { technicianNotes: equipment.technicianNotes } : {}),
    },
    history: equipment.serviceRecords.map(toCustomerServiceRecord),
    openTask: openTask
      ? {
          id: openTask.id, visitId: openTask.visitId, status: openTask.status,
          serviceType: { id: openTask.serviceTypeId, name: openTask.serviceType.name },
        }
      : null,
  });
});
