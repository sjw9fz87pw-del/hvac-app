import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { canAccessLocation } from "@/lib/auth/scope";
import { scheduleStatus } from "@/lib/maintenance/engine";
import { missingProof } from "@/lib/maintenance/completion";
import { CompleteLocationForm, type UnitRow } from "./form";

export default async function CompleteLocationPage({ params }: { params: Promise<{ locationId: string }> }) {
  const actor = await requireCapability("service.complete");
  const { locationId } = await params;

  const location = await prisma.restaurantLocation.findUnique({
    where: { id: locationId },
    include: {
      areas: { orderBy: { sortOrder: "asc" } },
      equipment: {
        where: { archivedAt: null, status: { not: "ARCHIVED" } },
        include: {
          area: { select: { name: true } },
          schedules: {
            include: { serviceType: { include: { checklistItems: { orderBy: { sortOrder: "asc" } } } } },
          },
        },
        orderBy: [{ area: { sortOrder: "asc" } }, { name: "asc" }],
      },
    },
  });

  if (!location || !canAccessLocation(actor, location.id, location.organizationId)) notFound();

  const units: UnitRow[] = [];

  for (const item of location.equipment) {
    for (const schedule of item.schedules) {
      const serviceType = schedule.serviceType;
      const checklist = serviceType.checklistItems.map((c) => ({ label: c.label, completed: true }));

      // Ask the same function the completion endpoint uses, with the payload
      // this screen would actually send. If it comes back with anything, this
      // unit cannot be closed out from here and we say exactly why.
      const blocked = missingProof(
        serviceType,
        { checklist, photos: [], technicianNotes: null, verificationMethod: "MANUAL" },
        serviceType.checklistItems.filter((c) => c.required).map((c) => c.label),
      );

      units.push({
        equipmentId: item.id,
        name: item.name,
        assetId: item.internalAssetId,
        areaName: item.area?.name ?? "Unassigned",
        serviceTypeId: serviceType.id,
        serviceTypeName: serviceType.name,
        checklist,
        status: scheduleStatus({ nextDueAt: schedule.nextDueAt, paused: schedule.paused }),
        nextDueAt: schedule.nextDueAt.toISOString(),
        blockedBy: blocked,
      });
    }
  }

  return (
    <CompleteLocationForm
      locationId={location.id}
      locationName={location.name}
      units={units}
      technicianName={actor.name}
    />
  );
}
