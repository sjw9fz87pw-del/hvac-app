import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { canGrantRole, type Role } from "@/lib/auth/permissions";
import { assertOrganization, assertLocation } from "@/lib/auth/scope";
import { recordAudit } from "@/lib/audit/log";
import { freshUnusableHash, issueAccessLink } from "@/lib/auth/invite-service";
import { ok, fail, route } from "@/lib/api/respond";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum([
    "SUPER_ADMIN", "OPERATIONS_ADMIN", "SERVICE_MANAGER", "TECHNICIAN",
    "CUSTOMER_ORG_OWNER", "CUSTOMER_LOCATION_MANAGER", "CUSTOMER_STAFF",
  ]),
  organizationId: z.string().nullish(),
  locationId: z.string().nullish(),
});

/**
 * Create a user.
 *
 * Two rules do the real work here, because `user.manage` is held by internal
 * admins and by customer organization owners alike:
 *
 *   1. Nobody grants a role they could not hold themselves, and no customer
 *      ever grants an internal role — otherwise a restaurant owner could mint a
 *      Super Admin and leave their own tenant entirely.
 *   2. The organization and location a membership is scoped to are validated
 *      against the creator's own scope, so nobody can attach a user to a tenant
 *      they cannot see.
 *
 * No password is set here. The account is created holding a placeholder hash
 * that no password can produce, and an invitation link is issued so the person
 * chooses their own. Until they do, the account cannot be signed into at all.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("user.manage");
  const input = schema.parse(await request.json());
  const role = input.role as Role;

  if (!canGrantRole(actor, role)) {
    return fail(403, `Your role cannot create a ${role.replace(/_/g, " ").toLowerCase()}`);
  }

  // Customer roles are meaningless without a tenant; internal roles must not have one.
  const isCustomerRole = role.startsWith("CUSTOMER_");
  if (isCustomerRole && !input.organizationId) {
    return fail(422, "A customer role needs an organization");
  }
  if (input.organizationId) assertOrganization(actor, input.organizationId);
  if (input.locationId) assertLocation(actor, input.locationId, input.organizationId ?? undefined);

  const email = input.email.toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { email } })) {
    return fail(409, "A user with that email already exists");
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        serviceCompanyId: actor.serviceCompanyId,
        email,
        name: input.name,
        // Unusable by construction: verifyPassword only accepts "scrypt$..." hashes.
        passwordHash: freshUnusableHash(),
        memberships: {
          create: {
            role,
            organizationId: isCustomerRole ? input.organizationId! : null,
            locationId: input.locationId ?? null,
          },
        },
      },
    });
    await recordAudit(
      {
        action: "user.invited", entityType: "User", entityId: created.id,
        actorId: actor.userId, organizationId: input.organizationId ?? null,
        after: { email, role },
      },
      tx,
    );
    return created;
  });

  const issued = await issueAccessLink(user.id, "invite", actor.userId);

  return ok(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role,
      invite: {
        emailed: issued.emailed,
        // Returned so an admin can pass it on by hand when email is not set up
        // or a message bounces. It is single-use and expires.
        link: issued.link,
        expiresInHours: issued.expiresInHours,
        error: issued.emailError ?? null,
      },
    },
    201,
  );
});
