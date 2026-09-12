import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireActor } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { buildVisitReport } from "@/lib/reports/visit-report";
import { Card, SectionTitle, Stat, StatGrid, Pill, formatDate } from "@/components/ui/primitives";

/**
 * The customer-facing visit report.
 *
 * Structured as data first and rendered second, so the same report can be
 * emailed or rendered to PDF later without rewriting any of it.
 */
export default async function VisitReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const visit = await prisma.visit.findUnique({ where: { id }, select: { organizationId: true, locationId: true } });
  if (!visit || !canAccessAsset(actor, visit)) notFound();

  const report = await buildVisitReport(id);
  if (!report) notFound();

  return (
    <main className="rise">
      <a href="/service" style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 600 }}>← Service</a>

      <div style={{ margin: "12px 0 18px" }}>
        <h1 style={{ fontSize: 25 }}>{report.locationName}</h1>
        <div style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 3 }}>
          Service report · {formatDate(report.completedAt ?? report.scheduledFor)} · {report.technicianName ?? "Our team"}
        </div>
      </div>

      <StatGrid>
        <Stat label="Assets serviced" value={report.summary.assetsServiced} tone="accent" />
        <Stat label="Photos captured" value={report.summary.photoCount} />
        <Stat label="Issues found" value={report.summary.issuesFound} tone={report.summary.issuesFound > 0 ? "warn" : "good"} />
      </StatGrid>

      {report.areas.map((area) => (
        <section key={area.name}>
          <SectionTitle>{area.name}</SectionTitle>
          <div style={{ display: "grid", gap: 10 }}>
            {area.items.map((item) => (
              <Card key={item.serviceRecordId}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 640, flex: 1 }}>{item.equipmentName}</div>
                  <Pill tone="good">{item.serviceType}</Pill>
                </div>
                <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 3 }}>
                  {item.completedChecklist.length} of {item.checklist.length} checks completed
                  {item.nextDueAt ? ` · next due ${formatDate(item.nextDueAt)}` : ""}
                </div>

                {item.photos.length > 0 ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto" }}>
                    {item.photos.map((photo) => (
                      <figure key={photo.id} style={{ margin: 0, flexShrink: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.url} alt={`${photo.kind} — ${item.equipmentName}`} style={{ width: 140, height: 105, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)" }} />
                        <figcaption style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 4, textTransform: "capitalize" }}>
                          {photo.kind.toLowerCase()}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}

                {item.notes ? (
                  <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 10, background: "var(--canvas)", padding: 11, borderRadius: 10 }}>
                    {item.notes}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ))}

      {report.recommendations.length > 0 ? (
        <>
          <SectionTitle>Recommendations</SectionTitle>
          <Card>
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              {report.recommendations.map((rec, index) => (
                <li key={index} style={{ fontSize: 14.5 }}>{rec}</li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      <div style={{ height: 30 }} />
    </main>
  );
}
