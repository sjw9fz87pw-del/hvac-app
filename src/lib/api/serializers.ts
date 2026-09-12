/**
 * The customer/internal boundary.
 *
 * Internal-only fields - `technicianNotes`, access notes, cost data - are
 * stripped here rather than by remembering to write the right `select` at every
 * call site. A customer payload is built by a function that has no way to emit
 * an internal field, which is a stronger guarantee than a convention.
 */
import type { Equipment, EquipmentPhoto, ServiceRecord, ServicePhoto, MaintenanceSchedule, ServiceType, Issue } from "@prisma/client";
import { scheduleStatus } from "@/lib/maintenance/engine";

export interface CustomerEquipmentView {
  id: string;
  name: string;
  category: string;
  equipmentType: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  internalAssetId: string;
  status: string;
  condition: string;
  areaName: string | null;
  locationName: string | null;
  photos: { id: string; url: string; kind: string; capturedAt: string; caption: string | null }[];
  notes: string | null;          // customer-visible notes ONLY
  warranty: { provider: string | null; expires: string | null } | null;
  filter: { size: string | null; type: string | null; quantity: number | null } | null;
  maintenance: {
    serviceType: string;
    intervalDays: number;
    lastServiceAt: string | null;
    nextDueAt: string;
    status: string;
  }[];
  hasTag: boolean;
}

type EquipmentWithRelations = Equipment & {
  photos?: EquipmentPhoto[];
  area?: { name: string } | null;
  location?: { name: string } | null;
  schedules?: (MaintenanceSchedule & { serviceType: ServiceType })[];
  tagAssignments?: { unassignedAt: Date | null }[];
};

export function photoUrl(blobKey: string): string {
  return `/api/v1/photos/${encodeURIComponent(blobKey)}`;
}

export function toCustomerEquipment(equipment: EquipmentWithRelations): CustomerEquipmentView {
  return {
    id: equipment.id,
    name: equipment.name,
    category: equipment.category,
    equipmentType: equipment.equipmentType,
    manufacturer: equipment.manufacturer,
    model: equipment.model,
    serialNumber: equipment.serialNumber,
    internalAssetId: equipment.internalAssetId,
    status: equipment.status,
    condition: equipment.condition,
    areaName: equipment.area?.name ?? null,
    locationName: equipment.location?.name ?? null,
    photos: (equipment.photos ?? [])
      .filter((p) => p.kind !== "DATA_PLATE") // serial-plate close-ups are an internal artifact
      .map((p) => ({
        id: p.id, url: photoUrl(p.blobKey), kind: p.kind,
        capturedAt: p.capturedAt.toISOString(), caption: p.caption,
      })),
    // Deliberately `customerVisibleNotes`. `technicianNotes` has no path out of
    // this function.
    notes: equipment.customerVisibleNotes,
    warranty: equipment.warrantyProvider || equipment.warrantyExpires
      ? { provider: equipment.warrantyProvider, expires: equipment.warrantyExpires?.toISOString() ?? null }
      : null,
    filter: equipment.filterSize || equipment.filterType
      ? { size: equipment.filterSize, type: equipment.filterType, quantity: equipment.filterQuantity }
      : null,
    maintenance: (equipment.schedules ?? []).map((s) => ({
      serviceType: s.serviceType.name,
      intervalDays: s.intervalDays,
      lastServiceAt: s.lastServiceAt?.toISOString() ?? null,
      nextDueAt: s.nextDueAt.toISOString(),
      status: scheduleStatus({ nextDueAt: s.nextDueAt, paused: s.paused }),
    })),
    hasTag: (equipment.tagAssignments ?? []).some((a) => a.unassignedAt === null),
  };
}

export interface CustomerServiceRecordView {
  id: string;
  performedAt: string;
  serviceType: string;
  technicianName: string;
  notes: string | null;              // customer-visible notes ONLY
  issuesFoundCount: number;
  nextDueAt: string | null;
  verified: boolean;
  photos: { id: string; kind: string; url: string; capturedAt: string }[];
  checklist: { label: string; completed: boolean }[];
}

type ServiceRecordWithRelations = ServiceRecord & {
  serviceType?: { name: string };
  technician?: { name: string };
  photos?: ServicePhoto[];
};

export function toCustomerServiceRecord(record: ServiceRecordWithRelations): CustomerServiceRecordView {
  const checklist = Array.isArray(record.checklistResults)
    ? (record.checklistResults as { label?: string; completed?: boolean }[])
    : [];
  return {
    id: record.id,
    performedAt: record.performedAt.toISOString(),
    serviceType: record.serviceType?.name ?? "Service",
    technicianName: record.technician?.name ?? "Technician",
    notes: record.customerVisibleNotes,
    issuesFoundCount: record.issuesFoundCount,
    nextDueAt: record.nextDueAt?.toISOString() ?? null,
    verified: record.nfcVerified,
    photos: (record.photos ?? []).map((p) => ({
      id: p.id, kind: p.kind, url: photoUrl(p.blobKey), capturedAt: p.capturedAt.toISOString(),
    })),
    checklist: checklist.map((c) => ({ label: String(c.label ?? ""), completed: Boolean(c.completed) })),
  };
}

export function toCustomerIssue(issue: Issue & { equipment?: { name: string } }) {
  return {
    id: issue.id,
    title: issue.title,
    category: issue.category,
    severity: issue.severity,
    status: issue.status,
    description: issue.description,
    equipmentName: issue.equipment?.name ?? null,
    createdAt: issue.createdAt.toISOString(),
    resolvedAt: issue.resolvedAt?.toISOString() ?? null,
    resolutionNote: issue.resolutionNote,
  };
}
