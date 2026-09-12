import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { PageHeader, List, Row, Divider, EmptyState, Stat, StatGrid, Pill, formatDate } from "@/components/ui/primitives";

/** The technician's own record of work completed. */
export default async function ActivityPage() {
  const actor = await requireActor();

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [records, monthCount, issueCount] = await Promise.all([
    prisma.serviceRecord.findMany({
      where: { technicianId: actor.userId },
      include: {
        equipment: { select: { name: true } },
        location: { select: { name: true } },
        serviceType: { select: { name: true } },
        photos: { select: { id: true } },
      },
      orderBy: { performedAt: "desc" },
      take: 60,
    }),
    prisma.serviceRecord.count({ where: { technicianId: actor.userId, performedAt: { gte: monthStart } } }),
    prisma.issue.count({ where: { reportedById: actor.userId } }),
  ]);

  return (
    <main className="rise">
      <PageHeader title="Activity" subtitle="Your completed service records" />

      <StatGrid>
        <Stat label="This month" value={monthCount} tone="accent" />
        <Stat label="All time" value={records.length >= 60 ? "60+" : records.length} />
        <Stat label="Issues flagged" value={issueCount} tone="info" />
      </StatGrid>

      <div style={{ height: 20 }} />

      {records.length === 0 ? (
        <EmptyState title="No services recorded yet" body="Completed work appears here with its photos and checklist." />
      ) : (
        <List>
          {records.map((record, index) => (
            <div key={record.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={record.equipment.name}
                subtitle={`${record.serviceType.name} · ${record.location.name}`}
                right={
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: "var(--ink-faint)" }}>{formatDate(record.performedAt)}</div>
                    {record.nfcVerified ? <Pill tone="good">Verified</Pill> : null}
                  </div>
                }
              />
            </div>
          ))}
        </List>
      )}
    </main>
  );
}
