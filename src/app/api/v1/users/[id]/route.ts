import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canGrantRole, type Role } from "@/lib/auth/permissions";
import { organizationScope, assertOrganization, assertLocation } from "@/lib/auth/scope";
import { recordAudit } from "@/lib/audit/log";
import { issueAccessLink } from "@/lib/auth/invite-service";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({
  /** "deactivate" is how access is removed: history stays, sign-in stops. */
  action: z.enum(["deactivate", "activate", "resend_invite", "reset_password", "change_role"]),
  role: z.enum([
    "SUPER_ADMIN", "OPERATIONS_ADMIN", "SERVICE_MANAGER", "TECHNICIAN",
    "CUSTOMER_ORG_OWNER", "CUSTOMER_LOCATION_MANAGER", "CUSTOMER_STAFF",
  ]).optional(),
  organizationId: z.string().nullish(),
  locationId: z.string().nullish(),
});

/**
 * Manage an existing person.
 *
 * Three rules hold throughout, and they are the reason this is one handler
 * rather than several:
 *
 *   1. You can only act on someone you can already see. A customer owner
 *      manages their own staff; anyone outside that scope reads as 404, so the
 *      endpoint cannot be used to discover who exists.
 *   2. You cannot hand out a role you could not hold yourself, which is the
 *      same canGrantRole gate user creation uses.
 *   3. You cannot lock yourself out, and the last remaining owner cannot be
 *      demoted or deactivated — otherwise the account becomes unadministrable
 *      and nobody can undo it.
 *
 * Nobody is ever deleted. Service records name the technician who performed
 * them, and those records are immutable, so removing access means the account
 * stops working — not that the history of who did what disappears.
 */
export const PATCH = route(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireCapability("user.manage");
  const { id } = await context.params;
  const input = schema.parse(await request.json());

  const scope = organizationScope(actor);
  const target = await prisma.user.findFirst({
    where: {
      id,
      ...(scope
        ? { memberships: { some: { organizationId: { in: scope.length ? scope : ["__none__"] } } } }
        : { serviceCompanyId: actor.serviceCompanyId }),
    },
    include: { memberships: true },
  });
  if (!target) return fail(404, "Not found");

  const membership = target.memberships[0] ?? null;
  const currentRole = membership?.role ?? null;

  // Guard rails around the last way back in.
  const isSelf = target.id === actor.userId;
  if (isSelf && (input.action === "deactivate" || input.action === "change_role")) {
    return fail(422, "You cannot change your own access. Ask another owner.");
  }
  if (currentRole === "SUPER_ADMIN" && (input.action === "deactivate" || input.action === "change_role")) {
    const owners = await prisma.user.count({
      where: { active: true, serviceCompanyId: target.serviceCompanyId, memberships: { some: { role: "SUPER_ADMIN" } } },
    });
    if (owners <= 1) return fail(422, "This is the only owner. Make someone else an owner first.");
  }

  switch (input.action) {
    case "deactivate": {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: target.id }, data: { active: false } });
        // Kill live sessions, so access stops now rather than at expiry.
        await tx.session.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await recordAudit(
          { action: "user.deactivated", entityType: "User", entityId: target.id, actorId: actor.userId, before: { active: true }, after: { active: false } },
          tx,
        );
      });
      return ok({ id: target.id, active: false });
    }

    case "activate": {
      await prisma.user.update({ where: { id: target.id }, data: { active: true } });
      await recordAudit({ action: "user.activated", entityType: "User", entityId: target.id, actorId: actor.userId, after: { active: true } });
      return ok({ id: target.id, active: true });
    }

    case "resend_invite":
    case "reset_password": {
      const kind = input.action === "resend_invite" ? "invite" : "reset";
      const issued = await issueAccessLink(target.id, kind, actor.userId);
      return ok({
        id: target.id,
        invite: {
          emailed: issued.emailed,
          link: issued.link,
          expiresInHours: issued.expiresInHours,
          error: issued.emailError ?? null,
        },
      });
    }

    case "change_role": {
      if (!input.role) return fail(422, "A role is required");
      const role = input.role as Role;
      if (!canGrantRole(actor, role)) {
        return fail(403, `Your role cannot grant ${role.replace(/_/g, " ").toLowerCase()}`);
      }

      const isCustomerRole = role.startsWith("CUSTOMER_");
      if (isCustomerRole && !input.organizationId) return fail(422, "A customer role needs an organization");
      if (input.organizationId) assertOrganization(actor, input.organizationId);
      if (input.locationId) assertLocation(actor, input.locationId, input.organizationId ?? undefined);

      await prisma.$transaction(async (tx) => {
        await tx.membership.deleteMany({ where: { userId: target.id } });
        await tx.membership.create({
          data: {
            userId: target.id,
            role,
            organizationId: isCustomerRole ? input.organizationId! : null,
            locationId: input.locationId ?? null,
          },
        });
        // The old role is cached in live sessions, so end them and make them
        // sign in again under the new one.
        await tx.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
        await recordAudit(
          { action: "user.role_changed", entityType: "User", entityId: target.id, actorId: actor.userId, organizationId: input.organizationId ?? null, before: { role: currentRole }, after: { role } },
          tx,
        );
      });
      return ok({ id: target.id, role });
    }
  }
});
