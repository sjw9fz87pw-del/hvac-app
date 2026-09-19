import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { canGrantRole } from "@/lib/auth/permissions";
import { ROLE_COPY } from "@/lib/auth/role-copy";
import { AddPersonForm } from "./form";

export default async function NewPersonPage() {
  const actor = await requireCapability("user.manage");
  const scope = organizationScope(actor);

  // The picker only offers what this actor may actually grant. The server
  // re-checks with the same function, because hidden is not the same as denied.
  const grantable = ROLE_COPY.filter((entry) =>
    canGrantRole({ internal: actor.internal, roles: actor.roles }, entry.role),
  );

  const organizations = await prisma.customerOrganization.findMany({
    where: scope ? { id: { in: scope.length ? scope : ["__none__"] } } : {},
    select: {
      id: true,
      name: true,
      locations: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  return <AddPersonForm roles={grantable} organizations={organizations} />;
}
