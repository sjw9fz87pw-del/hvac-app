import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { PageHeader, List, Row, Divider, StatusPill, EmptyState, formatDate, relativeDays, Pill, formatDateTime } from "@/components/ui/primitives";

export default async function TechVisits() {
  const actor = await requireActor();

  const visits = await prisma.visit.findMany({
    where: {
      status: { in: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] },
      // Yours, and any nobody has been given yet — so booked work can't sit
      // unseen because no one was assigned. Done work is only your own.
      OR: [
        { technicianId: actor.userId },
        { technicianId: null, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      ],
    },
    include: {
      location: { select: { name: true, city: true, timezone: true } },
      organization: { select: { name: true } },
      tasks: { select: { status: true } },
    },
    orderBy: { scheduledFor: "desc" },
    take: 60,
  });

  // Soonest first: the next visit is the one that matters.
  const upcoming = visits.filter((v) => v.status !== "COMPLETED")
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  const past = visits.filter((v) => v.status === "COMPLETED");

  return (
    <main className="rise">
      <PageHeader title="Visits" />

      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState title="No visits booked" body="Visits booked for you, or for anyone, appear here." />
      ) : null}

      {upcoming.length > 0 ? (
        <List>
          {upcoming.map((visit, index) => (
            <div key={visit.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/tech/visits/${visit.id}`}
                title={visit.location.name}
                subtitle={`${formatDateTime(visit.scheduledFor, visit.location.timezone)} · ${visit.tasks.length} units${visit.technicianId ? "" : " · Not assigned"}`}
                right={<Pill tone={visit.status === "IN_PROGRESS" ? "warn" : "accent"}>{visit.status === "IN_PROGRESS" ? "In progress" : relativeDays(visit.scheduledFor, { timeZone: visit.location.timezone })}</Pill>}
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
