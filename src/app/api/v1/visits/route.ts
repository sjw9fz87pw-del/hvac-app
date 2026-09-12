import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireActor, requireCapability, assertCapability } from "@/lib/auth/session";
import { tenantWhere, assertLocation } from "@/lib/auth/scope";
import { generateVisit } from "@/lib/maintenance/scheduling";
import { recordAudit } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { ok, fail, route } from "@/lib/api/respond";

export const GET = route(async (request: NextRequest) => {
  const actor = await requireCapability("visit.read");
  const params = request.nextUrl.searchParams;
  const mine = params.get("mine") === "true";
  const from = params.get("from") ? new Date(params.get("from")!) : null;
  const to = params.get("to") ? new Date(params.get("to")!) : null;

  const visits = await prisma.visit.findMany({
    where: {
      ...tenantWhere(actor, { organizationId: params.get("organizationId"), locationId: params.get("locationId") }),
      ...(mine ? { technicianId: actor.userId } : {}),
      ...(from || to ? { scheduledFor: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(params.get("status") ? { status: params.get("status") as never } : {}),
    },
    include: {
      location: { select: { id: true, name: true, city: true, addressLine1: true } },
      organization: { select: { name: true } },
      technician: { select: { id: true, name: true } },
      tasks: { select: { id: true, status: true } },
    },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });

  return ok({
    visits: visits.map((v) => ({
      id: v.id,
      scheduledFor: v.scheduledFor.toISOString(),
      status: v.status,
      estimatedMinutes: v.estimatedMinutes,
      locationId: v.locationId,
      locationName: v.location.name,
      locationAddress: [v.location.addressLine1, v.location.city].filter(Boolean).join(", "),
      organizationName: v.organization.name,
      technician: v.technician ? { id: v.technician.id, name: v.technician.name } : null,
      taskCount: v.tasks.length,
      completedCount: v.tasks.filter((t) => t.status === "COMPLETED").length,
    })),
  });
});

const createSchema = z.object({
  locationId: z.string().min(1),
  scheduledFor: z.string().datetime(),
  technicianId: z.string().nullish(),
  horizonDays: z.number().int().min(0).max(90).default(7),
});

/**
 * Build a visit from what is actually due at a location, grouped by area. This
 * is the "system generates the upcoming work" path - nobody hand-picks assets.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireActor();
  assertCapability(actor, "visit.manage");
  const input = createSchema.parse(await request.json());
  assertLocation(actor, input.locationId);

  const visit = await generateVisit({
    locationId: input.locationId,
    scheduledFor: new Date(input.scheduledFor),
    technicianId: input.technicianId ?? null,
    horizonDays: input.horizonDays,
  });

  if (!visit) return fail(422, "Nothing is due at this location within the selected window");

  await recordAudit({
    action: "visit.created", entityType: "Visit", entityId: visit.id,
    actorId: actor.userId, organizationId: visit.organizationId,
    after: { scheduledFor: visit.scheduledFor, taskCount: visit.tasks.length },
  });

  if (input.technicianId) {
    await notify({
      type: "VISIT_SCHEDULED",
      title: "New visit assigned",
      body: `${visit.tasks.length} units on ${visit.scheduledFor.toDateString()}`,
      link: `/tech/visits/${visit.id}`,
      dedupeKey: `visit:${visit.id}`,
      userIds: [input.technicianId],
    });
  }

  return ok({ id: visit.id, taskCount: visit.tasks.length, estimatedMinutes: visit.estimatedMinutes }, 201);
});
