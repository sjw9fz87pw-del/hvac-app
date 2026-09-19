import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { assertOrganization, organizationScope } from "@/lib/auth/scope";
import { createLocationSchema } from "@/lib/api/validation";
import { uniqueGroupSlug } from "@/lib/api/groups";
import { recordAudit } from "@/lib/audit/log";
import { withIdempotency } from "@/lib/sync/idempotency";
import { ok, fail, route } from "@/lib/api/respond";

export const GET = route(async () => {
  const actor = await requireCapability("org.read");
  const scope = organizationScope(actor);

  const locations = await prisma.restaurantLocation.findMany({
    where: scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {},
    select: { id: true, name: true, organizationId: true, city: true, state: true },
    orderBy: { name: "asc" },
  });

  return ok({ locations });
});

export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("location.manage");
  const body = await request.json();
  const input = createLocationSchema.parse(body);

  // Creating a group is a change to the customer structure, which is a
  // different right from adding a restaurant to one that already exists.
  if (input.newGroupName && !actor.capabilities.has("org.manage")) {
    return fail(403, "Your role cannot create a group");
  }
  // Out-of-scope organizations 404 rather than 403, so this cannot be used to
  // probe which organizations exist.
  if (input.organizationId) assertOrganization(actor, input.organizationId);

  const outcome = await withIdempotency(
    { actorId: actor.userId, key: request.headers.get("idempotency-key"), endpoint: "POST /locations", body },
    async () => {
      const location = await prisma.$transaction(async (tx) => {
        const organizationId = input.organizationId
          ?? (await tx.customerOrganization.create({
            data: {
              serviceCompanyId: actor.serviceCompanyId,
              name: input.newGroupName!.trim(),
              slug: await uniqueGroupSlug(tx, actor.serviceCompanyId, input.newGroupName!),
            },
            select: { id: true },
          })).id;

        const created = await tx.restaurantLocation.create({
          data: {
            organizationId,
            name: input.name,
            addressLine1: input.addressLine1 ?? null,
            city: input.city ?? null,
            state: input.state ?? null,
            postalCode: input.postalCode ?? null,
            phone: input.phone ?? null,
            accessNotes: input.accessNotes ?? null,
            areas: {
              create: input.areas.map((name, sortOrder) => ({ name, sortOrder })),
            },
          },
        });

        await recordAudit(
          {
            action: "location.created", entityType: "RestaurantLocation", entityId: created.id,
            actorId: actor.userId, organizationId,
            after: { name: created.name, areas: input.areas, group: input.newGroupName ?? null },
          },
          tx,
        );

        return created;
      });

      return { status: 201, body: { id: location.id, name: location.name, groupId: location.organizationId } };
    },
  );

  return ok(outcome.body, outcome.status);
});
