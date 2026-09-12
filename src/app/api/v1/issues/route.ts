import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { tenantWhere, canAccessAsset } from "@/lib/auth/scope";
import { reportIssueSchema, ISSUE_CATEGORY_LABELS } from "@/lib/api/validation";
import { recordAudit } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { toCustomerIssue } from "@/lib/api/serializers";
import { withIdempotency } from "@/lib/sync/idempotency";
import { ok, route } from "@/lib/api/respond";

export const GET = route(async (request: NextRequest) => {
  const actor = await requireCapability("issue.read");
  const params = request.nextUrl.searchParams;

  const issues = await prisma.issue.findMany({
    where: {
      ...tenantWhere(actor, { organizationId: params.get("organizationId"), locationId: params.get("locationId") }),
      ...(params.get("status") ? { status: params.get("status") as never } : {}),
      ...(params.get("open") === "true" ? { status: { in: ["OPEN", "TRIAGED", "ASSIGNED", "IN_PROGRESS"] } } : {}),
    },
    include: { equipment: { select: { name: true } } },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return ok({ issues: issues.map(toCustomerIssue) });
});

/**
 * Report a problem, started from the asset - so the restaurant, area, model,
 * serial number and service history are already known and nobody has to
 * describe which fridge they mean.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("issue.create");
  const body = await request.json();
  const input = reportIssueSchema.parse(body);

  const equipment = await prisma.equipment.findUnique({
    where: { id: input.equipmentId },
    include: { location: true },
  });
  if (!equipment || !canAccessAsset(actor, equipment)) throw new AuthError(404, "Not found");

  const outcome = await withIdempotency(
    { actorId: actor.userId, key: request.headers.get("idempotency-key"), endpoint: "POST /issues", body },
    async () => {
      const issue = await prisma.$transaction(async (tx) => {
        const created = await tx.issue.create({
          data: {
            organizationId: equipment.organizationId,
            locationId: equipment.locationId,
            equipmentId: equipment.id,
            source: actor.internal ? "TECHNICIAN" : "CUSTOMER",
            category: input.category,
            severity: input.severity,
            title: `${ISSUE_CATEGORY_LABELS[input.category] ?? input.category} — ${equipment.name}`,
            description: input.description ?? null,
            reportedById: actor.userId,
            photos: { create: input.photoBlobKeys.map((blobKey) => ({ blobKey })) },
            events: { create: { actorId: actor.userId, type: "CREATED", body: input.description ?? null } },
          },
        });
        await recordAudit(
          {
            action: "issue.created", entityType: "Issue", entityId: created.id,
            actorId: actor.userId, organizationId: equipment.organizationId,
            after: { category: input.category, severity: input.severity },
          },
          tx,
        );
        return created;
      });

      await notify({
        type: "ISSUE_FOUND",
        title: issue.title,
        body: `${equipment.location.name}${input.description ? ` — ${input.description.slice(0, 120)}` : ""}`,
        link: `/admin/issues/${issue.id}`,
        dedupeKey: `issue:${issue.id}`,
        internalRoles: ["OPERATIONS_ADMIN", "SERVICE_MANAGER"],
      });

      return { status: 201, body: { id: issue.id, status: issue.status, title: issue.title } };
    },
  );

  return ok(outcome.body, outcome.status);
});
