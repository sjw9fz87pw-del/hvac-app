import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { equipmentDeletionCheck } from "@/lib/api/equipment-removal";
import { ok, route } from "@/lib/api/respond";

/**
 * Can this unit be deleted, or does it have to be archived?
 *
 * Asked before anything is shown, so the screen offers the one action that
 * will actually work rather than a delete button that fails on press.
 */
export const GET = route(async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("equipment.archive");
  const { id } = await ctx.params;

  const equipment = await prisma.equipment.findUnique({ where: { id } });
  if (!equipment || !canAccessAsset(actor, equipment)) throw new AuthError(404, "Not found");

  const check = await equipmentDeletionCheck(id);
  return ok({
    deletable: check.blockers.length === 0,
    blockers: check.blockers,
    pendingTasks: check.pendingTasks,
    hasTag: check.hasTag,
    archived: Boolean(equipment.archivedAt),
  });
});
