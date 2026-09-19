import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessLocation } from "@/lib/auth/scope";
import { AddUnitsForm } from "./form";

export default async function NewUnitsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCapability("equipment.create");
  const { id } = await params;

  const location = await prisma.restaurantLocation.findUnique({
    where: { id },
    include: { areas: { orderBy: { sortOrder: "asc" } } },
  });

  if (!location || !canAccessLocation(actor, location.id, location.organizationId)) notFound();

  const serviceTypes = await prisma.serviceType.findMany({
    where: { active: true },
    select: { id: true, key: true, name: true, defaultIntervalDays: true },
  });

  return (
    <AddUnitsForm
      locationId={location.id}
      locationName={location.name}
      areas={location.areas.map((a) => ({ id: a.id, name: a.name }))}
      serviceTypes={serviceTypes}
    />
  );
}
