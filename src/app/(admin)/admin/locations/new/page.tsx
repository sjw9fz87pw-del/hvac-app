import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { organizationScope } from "@/lib/auth/scope";
import { AddRestaurantForm } from "./form";

export default async function NewLocationPage() {
  const actor = await requireCapability("location.manage");
  const scope = organizationScope(actor);

  const organizations = await prisma.customerOrganization.findMany({
    where: scope ? { id: { in: scope.length ? scope : ["__none__"] } } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Nothing to attach a restaurant to.
  if (organizations.length === 0) notFound();

  return <AddRestaurantForm organizations={organizations} />;
}
