import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { ServiceTask } from "./task";

/** The service task screen: tag verification, checklist, before/after photos, notes. */
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCapability("service.perform");
  const { id } = await params;

  const task = await prisma.visitTask.findUnique({
    where: { id },
    include: {
      visit: { include: { location: { select: { name: true } } } },
      serviceType: { include: { checklistItems: { orderBy: { sortOrder: "asc" } } } },
      equipment: {
        include: {
          area: true,
          photos: { where: { kind: "IDENTIFICATION" }, take: 1 },
          tagAssignments: { where: { unassignedAt: null }, include: { tag: true } },
          schedules: { include: { serviceType: true } },
          serviceRecords: { orderBy: { performedAt: "desc" }, take: 1, include: { technician: { select: { name: true } } } },
        },
      },
    },
  });

  if (!task || !canAccessAsset(actor, task.visit)) notFound();

  // Which unit comes next, so completion can hand straight off to it.
  const nextTask = await prisma.visitTask.findFirst({
    where: { visitId: task.visitId, status: { in: ["PENDING", "IN_PROGRESS"] }, id: { not: task.id } },
    orderBy: { sortOrder: "asc" },
    include: { equipment: { select: { name: true } } },
  });

  const last = task.equipment.serviceRecords[0];

  return (
    <ServiceTask
      task={{
        id: task.id,
        status: task.status,
        visitId: task.visitId,
        locationName: task.visit.location.name,
      }}
      equipment={{
        id: task.equipment.id,
        name: task.equipment.name,
        areaName: task.equipment.area?.name ?? "Unassigned",
        model: task.equipment.model,
        internalAssetId: task.equipment.internalAssetId,
        photoBlobKey: task.equipment.photos[0]?.blobKey ?? null,
        hasTag: task.equipment.tagAssignments.length > 0,
        lastService: last ? { performedAt: last.performedAt.toISOString(), technician: last.technician.name } : null,
      }}
      serviceType={{
        id: task.serviceType.id,
        name: task.serviceType.name,
        requirements: {
          nfc: task.serviceType.requiresNfcVerification,
          beforePhoto: task.serviceType.requiresBeforePhoto,
          afterPhoto: task.serviceType.requiresAfterPhoto,
          checklist: task.serviceType.requiresChecklist,
          note: task.serviceType.requiresTechnicianNote,
        },
        checklist: task.serviceType.checklistItems.map((item) => ({
          id: item.id, label: item.label, required: item.required,
        })),
      }}
      nextTask={nextTask ? { id: nextTask.id, equipmentName: nextTask.equipment.name } : null}
    />
  );
}
