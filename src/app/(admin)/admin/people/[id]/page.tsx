import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { organizationScope } from "@/lib/auth/scope";
import { canGrantRole, type Role } from "@/lib/auth/permissions";
import { ROLE_COPY, roleCopy } from "@/lib/auth/role-copy";
import { awaitingSetup } from "@/lib/auth/invite-service";
import { ManagePerson } from "./manage";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCapability("user.manage");
  const { id } = await params;
  const scope = organizationScope(actor);

  // Same scoping as the API: someone outside it does not exist as far as this
  // page is concerned.
  const person = await prisma.user.findFirst({
    where: {
      id,
      ...(scope
        ? { memberships: { some: { organizationId: { in: scope.length ? scope : ["__none__"] } } } }
        : { serviceCompanyId: actor.serviceCompanyId }),
    },
    include: {
      memberships: { include: { organization: { select: { name: true } }, location: { select: { name: true } } } },
      _count: { select: { serviceRecords: true } },
    },
  });
  if (!person) notFound();

  const membership = person.memberships[0] ?? null;
  const role = (membership?.role ?? "CUSTOMER_STAFF") as Role;

  const owners = await prisma.user.count({
    where: { active: true, serviceCompanyId: person.serviceCompanyId, memberships: { some: { role: "SUPER_ADMIN" } } },
  });

  const organizations = await prisma.customerOrganization.findMany({
    where: scope ? { id: { in: scope.length ? scope : ["__none__"] } } : {},
    select: { id: true, name: true, locations: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <ManagePerson
      person={{
        id: person.id,
        name: person.name,
        email: person.email,
        active: person.active,
        awaitingSetup: awaitingSetup(person.passwordHash),
        lastLoginAt: person.lastLoginAt?.toISOString() ?? null,
        servicesRecorded: person._count.serviceRecords,
        role,
        roleLabel: roleCopy(role).label,
        scopeName: membership?.location?.name ?? membership?.organization?.name ?? "Your company",
      }}
      roles={ROLE_COPY.filter((entry) => canGrantRole({ internal: actor.internal, roles: actor.roles }, entry.role))}
      organizations={organizations}
      isSelf={person.id === actor.userId}
      isLastOwner={role === "SUPER_ADMIN" && owners <= 1}
    />
  );
}
