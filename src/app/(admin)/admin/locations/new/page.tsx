import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { organizationScope } from "@/lib/auth/scope";
import { AddRestaurantForm } from "./form";

export default async function NewLocationPage() {
  const actor = await requireCapability("location.manage");
  const scope = organizationScope(actor);

  const organizations = await prisma.customerOrganization.findMany({
    where: scope ? { id: { in: scope.length ? scope : ["__none__"] } } : { serviceCompanyId: actor.serviceCompanyId },
    select: { id: true, name: true, _count: { select: { locations: true } } },
    orderBy: { name: "asc" },
  });

  const canCreateGroup = actor.capabilities.has("org.manage");

  // A customer manager with no group and no right to make one has nothing to
  // attach a restaurant to.
  if (organizations.length === 0 && !canCreateGroup) notFound();

  // Adding restaurants is usually a run of them for the same group, so default
  // to wherever the last one went rather than making the choice every time.
  const newest = await prisma.restaurantLocation.findFirst({
    where: scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {},
    select: { organizationId: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AddRestaurantForm
      organizations={organizations.map((o) => ({ id: o.id, name: o.name, restaurants: o._count.locations }))}
      defaultGroupId={newest?.organizationId ?? null}
      canCreateGroup={canCreateGroup}
    />
  );
}
