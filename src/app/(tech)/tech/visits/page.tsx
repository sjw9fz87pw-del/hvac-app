import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { PageHeader, List, Row, Divider, StatusPill, EmptyState, formatDate, relativeDays, Pill } from "@/components/ui/primitives";

export default async function TechVisits() {
  const actor = await requireActor();

  const visits = await prisma.visit.findMany({
    where: { technicianId: actor.userId, status: { in: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] } },
    include: {
      location: { select: { name: true, city: true } },
      organization: { select: { name: true } },
      tasks: { select: { status: true } },
    },
    orderBy: { scheduledFor: "desc" },
    take: 60,
  });

  const upcoming = visits.filter((v) => v.status !== "COMPLETED");
  const past = visits.filter((v) => v.status === "COMPLETED");

  return (
    <main className="rise">
      <PageHeader title="Visits" subtitle="Your scheduled and completed restaurant visits" />

      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState title="No visits assigned" body="Scheduled work appears here as soon as it is assigned to you." />
      ) : null}

      {upcoming.length > 0 ? (
        <List>
          {upcoming.map((visit, index) => (
            <div key={visit.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/tech/visits/${visit.id}`}
                title={visit.location.name}
                subtitle={`${visit.organization.name} · ${visit.tasks.length} units · ${formatDate(visit.scheduledFor)}`}
                right={<Pill tone={visit.status === "IN_PROGRESS" ? "warn" : "accent"}>{relativeDays(visit.scheduledFor)}</Pill>}
              />
            </div>
          ))}
        </List>
      ) : null}

      {past.length > 0 ? (
        <>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-faint)", fontWeight: 660, margin: "26px 0 10px" }}>
            Completed
          </h2>
          <List>
            {past.map((visit, index) => (
              <div key={visit.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  href={`/tech/visits/${visit.id}`}
                  title={visit.location.name}
                  subtitle={`${visit.tasks.filter((t) => t.status === "COMPLETED").length} of ${visit.tasks.length} units · ${formatDate(visit.completedAt ?? visit.scheduledFor)}`}
                  right={<StatusPill status="COMPLETED" />}
                />
              </div>
            ))}
          </List>
        </>
      ) : null}
    </main>
  );
}
