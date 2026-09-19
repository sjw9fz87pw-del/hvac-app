import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { organizationScope } from "@/lib/auth/scope";
import { recordAudit } from "@/lib/audit/log";
import { ungroup } from "@/lib/api/groups";
import { DEFAULT_GROUP_SLUG } from "@/lib/setup/initial-data";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({ name: z.string().min(1).max(120) });

async function reachable(actor: Awaited<ReturnType<typeof requireCapability>>, id: string) {
  const scope = organizationScope(actor);
  return prisma.customerOrganization.findFirst({
    // AND rather than a spread: a second `id` key would replace the first.
    where: {
      AND: [
        { id },
        scope ? { id: { in: scope.length ? scope : ["__none__"] } } : { serviceCompanyId: actor.serviceCompanyId },
      ],
    },
    select: { id: true, name: true, slug: true },
  });
}

export const PATCH = route(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("org.manage");
  const { id } = await context.params;
  const input = schema.parse(await request.json());

  const group = await reachable(actor, id);
  if (!group) return fail(404, "Not found");

  await prisma.customerOrganization.update({ where: { id }, data: { name: input.name.trim() } });
  await recordAudit({
    action: "org.updated", entityType: "CustomerOrganization", entityId: id,
    actorId: actor.userId, organizationId: id,
    before: { name: group.name }, after: { name: input.name.trim() },
  });
  return ok({ id, name: input.name.trim() });
});

/**
 * Dissolve a group. The restaurants inside it are not deleted — they go back
 * to the ungrouped list, which is what "remove this group" has to mean when
 * the group is only a way of arranging them.
 */
export const DELETE = route(async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("org.manage");
  const { id } = await context.params;

  const group = await reachable(actor, id);
  if (!group) return fail(404, "Not found");
  if (group.slug === DEFAULT_GROUP_SLUG) {
    return fail(422, "That is the ungrouped list, not a group you can remove.");
  }

  const result = await ungroup(id, { userId: actor.userId, serviceCompanyId: actor.serviceCompanyId }, DEFAULT_GROUP_SLUG);
  return ok({ id, removed: true, restaurantsKept: result.moved });
});
