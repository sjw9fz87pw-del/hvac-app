import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireActor, assertCapability, AuthError } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { recordAudit } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { ok, route } from "@/lib/api/respond";

const schema = z.object({
  status: z.enum(["OPEN", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "WONT_FIX"]).optional(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  assignedToId: z.string().nullish(),
  /** Routing to an outside trade: the coordinator role, without employing every trade. */
  vendorId: z.string().nullish(),
  resolutionNote: z.string().max(2000).nullish(),
  comment: z.string().max(2000).nullish(),
});

export const PATCH = route(async (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const { id } = await ctx.params;
  const input = schema.parse(await request.json());

  const issue = await prisma.issue.findUnique({ where: { id }, include: { equipment: true } });
  if (!issue || !canAccessAsset(actor, issue)) throw new AuthError(404, "Not found");

  if (input.assignedToId !== undefined || input.vendorId !== undefined) assertCapability(actor, "issue.assign");
  else if (input.status === "RESOLVED" || input.status === "CLOSED") assertCapability(actor, "issue.resolve");
  else if (input.status || input.severity) assertCapability(actor, "issue.triage");

  const resolving = input.status === "RESOLVED" || input.status === "CLOSED";

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.issue.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId, status: input.status ?? "ASSIGNED" } : {}),
        ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
        ...(resolving ? { resolvedAt: new Date(), resolutionNote: input.resolutionNote ?? null } : {}),
      },
    });

    await tx.issueEvent.create({
      data: {
        issueId: id, actorId: actor.userId,
        type: resolving ? "RESOLVED" : input.assignedToId !== undefined || input.vendorId !== undefined ? "ASSIGNED" : "STATUS_CHANGE",
        body: input.comment ?? input.resolutionNote ?? null,
        detail: { status: input.status ?? null, vendorId: input.vendorId ?? null },
      },
    });

    await recordAudit(
      {
        action: resolving ? "issue.resolved" : input.assignedToId !== undefined || input.vendorId !== undefined ? "issue.assigned" : "issue.assigned",
        entityType: "Issue", entityId: id, actorId: actor.userId, organizationId: issue.organizationId,
        before: { status: issue.status }, after: { status: result.status },
      },
      tx,
    );

    return result;
  });

  if (resolving) {
    await notify({
      type: "ISSUE_RESOLVED",
      title: `Resolved: ${issue.title}`,
      body: input.resolutionNote ?? null,
      link: `/equipment/${issue.equipmentId}`,
      dedupeKey: `issue-resolved:${issue.id}`,
      organizationId: issue.organizationId,
      locationId: issue.locationId,
    });
  }

  return ok({ id: updated.id, status: updated.status });
});
