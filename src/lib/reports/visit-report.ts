/**
 * Visit report as structured data.
 *
 * Deliberately a data structure rather than markup: the same report backs the
 * customer's web view today and can be handed to an email template or a PDF
 * renderer later without any of this logic being rewritten.
 */
import { prisma } from "@/lib/db/client";
import { photoUrl } from "@/lib/api/serializers";

export interface VisitReportItem {
  serviceRecordId: string;
  equipmentName: string;
  internalAssetId: string;
  serviceType: string;
  checklist: { label: string; completed: boolean }[];
  completedChecklist: string[];
  photos: { id: string; kind: string; url: string; capturedAt: string }[];
  notes: string | null;   // customer-visible notes only
  nextDueAt: string | null;
}

export interface VisitReport {
  visitId: string;
  locationName: string;
  organizationName: string;
  scheduledFor: string;
  completedAt: string | null;
  technicianName: string | null;
  summary: { assetsServiced: number; photoCount: number; issuesFound: number; checksCompleted: number };
  areas: { name: string; items: VisitReportItem[] }[];
  issues: { id: string; title: string; severity: string; description: string | null }[];
  recommendations: string[];
}

export async function buildVisitReport(visitId: string): Promise<VisitReport | null> {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      location: { select: { name: true } },
      organization: { select: { name: true } },
      technician: { select: { name: true } },
      serviceRecords: {
        include: {
          equipment: { include: { area: true } },
          serviceType: { select: { name: true } },
          photos: true,
          issues: true,
        },
        orderBy: { performedAt: "asc" },
      },
    },
  });
  if (!visit) return null;

  const areaMap = new Map<string, VisitReportItem[]>();
  let photoCount = 0;
  let checksCompleted = 0;
  const issues: VisitReport["issues"] = [];

  for (const record of visit.serviceRecords) {
    const checklist = Array.isArray(record.checklistResults)
      ? (record.checklistResults as { label?: string; completed?: boolean }[]).map((c) => ({
          label: String(c.label ?? ""), completed: Boolean(c.completed),
        }))
      : [];
    checksCompleted += checklist.filter((c) => c.completed).length;
    photoCount += record.photos.length;

    for (const issue of record.issues) {
      issues.push({ id: issue.id, title: issue.title, severity: issue.severity, description: issue.description });
    }

    const areaName = record.equipment.area?.name ?? "Unassigned";
    areaMap.set(areaName, [
      ...(areaMap.get(areaName) ?? []),
      {
        serviceRecordId: record.id,
        equipmentName: record.equipment.name,
        internalAssetId: record.equipment.internalAssetId,
        serviceType: record.serviceType.name,
        checklist,
        completedChecklist: checklist.filter((c) => c.completed).map((c) => c.label),
        photos: record.photos.map((p) => ({
          id: p.id, kind: p.kind, url: photoUrl(p.blobKey), capturedAt: p.capturedAt.toISOString(),
        })),
        // Only the customer-visible note reaches the report.
        notes: record.customerVisibleNotes,
        nextDueAt: record.nextDueAt?.toISOString() ?? null,
      },
    ]);
  }

  return {
    visitId: visit.id,
    locationName: visit.location.name,
    organizationName: visit.organization.name,
    scheduledFor: visit.scheduledFor.toISOString(),
    completedAt: visit.completedAt?.toISOString() ?? null,
    technicianName: visit.technician?.name ?? null,
    summary: {
      assetsServiced: visit.serviceRecords.length,
      photoCount,
      issuesFound: issues.length,
      checksCompleted,
    },
    areas: [...areaMap.entries()].map(([name, items]) => ({ name, items })),
    issues,
    recommendations: buildRecommendations(issues),
  };
}

/**
 * Recommendations are derived strictly from what was actually observed and
 * recorded. Nothing here infers a condition that no technician reported.
 */
function buildRecommendations(issues: VisitReport["issues"]): string[] {
  const recommendations: string[] = [];
  const critical = issues.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH");
  if (critical.length > 0) {
    recommendations.push(
      `${critical.length} item${critical.length === 1 ? "" : "s"} flagged for follow-up: ${critical.map((i) => i.title).join("; ")}.`,
    );
  }
  const rest = issues.filter((i) => i.severity !== "CRITICAL" && i.severity !== "HIGH");
  if (rest.length > 0) {
    recommendations.push(`${rest.length} minor observation${rest.length === 1 ? "" : "s"} noted for monitoring on the next visit.`);
  }
  return recommendations;
}
