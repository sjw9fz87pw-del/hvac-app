import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { assertLocation, organizationScope } from "@/lib/auth/scope";
import { assignToGroup, pruneEmptyGroups } from "@/lib/api/groups";
import { withIdempotency } from "@/lib/sync/idempotency";
import { ok, fail, route } from "@/lib/api/respond";

export const GET = route(async () => {
  const actor = await requireCapability("org.read");
  const scope = organizationScope(actor);

  const groups = await prisma.customerOrganization.findMany({
    where: scope ? { id: { in: scope.length ? scope : ["__none__"] } } : { serviceCompanyId: actor.serviceCompanyId },
    select: { id: true, name: true, _count: { select: { locations: true } } },
    orderBy: { name: "asc" },
  });

  return ok({ groups: groups.map((g) => ({ id: g.id, name: g.name, restaurants: g._count.locations })) });
});

const schema = z.object({
  locationIds: z.array(z.string().min(1)).min(1).max(50),
  groupId: z.string().min(1).optional(),
  newGroupName: z.string().min(1).max(120).optional(),
}).refine((v) => Boolean(v.groupId) !== Boolean(v.newGroupName), {
  message: "Provide either an existing group or a name for a new one",
});

/**
 * Put restaurants into a group.
 *
 * Re-parenting moves the tenant pointer on everything beneath each restaurant,
 * so it needs `org.manage` — the right to change the customer structure — not
 * merely `location.manage`, which is the right to edit a restaurant's details.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("org.manage");
  const body = await request.json();
  const input = schema.parse(body);

  // Every restaurant, and the destination, has to already be inside the actor's
  // scope. Anything outside it 404s rather than 403s, so this cannot be used to
  // discover what exists elsewhere.
  for (const id of input.locationIds) {
    const location = await prisma.restaurantLocation.findUnique({
      where: { id }, select: { id: true, organizationId: true },
    });
    if (!location) return fail(404, "Not found");
    assertLocation(actor, location.id, location.organizationId);
  }

  if (input.groupId) {
    const scope = organizationScope(actor);
    const group = await prisma.customerOrganization.findFirst({
      // AND, not a spread: spreading a second `id` key would silently replace
      // the first and let any in-scope group satisfy the lookup.
      where: {
        AND: [
          { id: input.groupId },
          scope ? { id: { in: scope.length ? scope : ["__none__"] } } : { serviceCompanyId: actor.serviceCompanyId },
        ],
      },
      select: { id: true },
    });
    if (!group) return fail(404, "Not found");
  }

  const outcome = await withIdempotency(
    { actorId: actor.userId, key: request.headers.get("idempotency-key"), endpoint: "POST /groups", body },
    async () => {
      const result = await assignToGroup(
        input.locationIds,
        input.groupId ? { groupId: input.groupId } : { newGroupName: input.newGroupName! },
        { userId: actor.userId, serviceCompanyId: actor.serviceCompanyId },
      );
      // A group the last restaurant just left is clutter on every picker.
      await pruneEmptyGroups(actor.serviceCompanyId);
      return { status: 200, body: result };
    },
  );

  return ok(outcome.body, outcome.status);
});
