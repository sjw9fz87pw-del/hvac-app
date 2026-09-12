import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { PageHeader, List, Row, Divider, Pill, EmptyState, formatDate } from "@/components/ui/primitives";

export default async function TechniciansPage() {
  const actor = await requireCapability("technician.manage");

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const technicians = await prisma.user.findMany({
    where: { serviceCompanyId: actor.serviceCompanyId, memberships: { some: { role: "TECHNICIAN" } } },
    include: {
      visits: { where: { scheduledFor: { gte: dayStart } }, select: { id: true, status: true } },
      serviceRecords: { where: { performedAt: { gte: monthStart } }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="rise">
      <PageHeader title="Technicians" subtitle={`${technicians.length} on the team`} />
      {technicians.length === 0 ? (
        <EmptyState title="No technicians yet" />
      ) : (
        <List>
          {technicians.map((technician, index) => {
            const working = technician.visits.some((v) => v.status === "IN_PROGRESS");
            return (
              <div key={technician.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={technician.name}
                  subtitle={`${technician.serviceRecords.length} services this month · last seen ${formatDate(technician.lastLoginAt)}`}
                  right={
                    working ? <Pill tone="warn">On site</Pill>
                      : technician.visits.length > 0 ? <Pill tone="accent">{technician.visits.length} visits</Pill>
                      : <Pill tone="neutral">Available</Pill>
                  }
                />
              </div>
            );
          })}
        </List>
      )}
    </main>
  );
}
