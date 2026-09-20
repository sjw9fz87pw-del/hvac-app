import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { assertOrganization, assertLocation } from "@/lib/auth/scope";
import { setIntervalOverride } from "@/lib/maintenance/planning";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({
  scope: z.enum(["SYSTEM", "CUSTOMER", "LOCATION"]),
  serviceTypeId: z.string().min(1),
  organizationId: z.string().nullish(),
  locationId: z.string().nullish(),
  /** Null removes the override so the level above applies again. */
  intervalDays: z.number().int().min(1).max(3650).nullable(),
});

/**
 * Set how often a job is done for a whole restaurant, a whole group, or as the
 * company default.
 *
 * `plan.manage` rather than `schedule.manage`: this changes the cadence for
 * many units at once, which is a different decision from moving one unit's
 * next visit.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("plan.manage");
  const input = schema.parse(await request.json());

  const serviceType = await prisma.serviceType.findUnique({
    where: { id: input.serviceTypeId },
    select: { id: true, serviceCompanyId: true, category: true },
  });
  if (!serviceType || serviceType.serviceCompanyId !== actor.serviceCompanyId) {
    return fail(404, "Not found");
  }

  if (input.scope === "CUSTOMER") {
    if (!input.organizationId) return fail(422, "A group is required");
    assertOrganization(actor, input.organizationId);
  }
  if (input.scope === "LOCATION") {
    if (!input.locationId) return fail(422, "A restaurant is required");
    const location = await prisma.restaurantLocation.findUnique({
      where: { id: input.locationId }, select: { id: true, organizationId: true },
    });
    if (!location) return fail(404, "Not found");
    assertLocation(actor, location.id, location.organizationId);
  }

  const result = await setIntervalOverride(
    {
      scope: input.scope,
      serviceTypeId: input.serviceTypeId,
      organizationId: input.organizationId ?? null,
      locationId: input.locationId ?? null,
      category: input.scope === "SYSTEM" ? serviceType.category : null,
    },
    input.intervalDays,
    { userId: actor.userId },
  );

  return ok(result);
});
