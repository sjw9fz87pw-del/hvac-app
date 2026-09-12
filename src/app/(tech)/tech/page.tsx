import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Card, Stat, StatGrid, SectionTitle, EmptyState, Button, Pill, formatDate } from "@/components/ui/primitives";
import { SyncBanner } from "@/components/ui/sync-banner";

/**
 * Today.
 *
 * Open the app, see the restaurants assigned and how many units are due at each.
 * One tap into a visit; from there the NFC tag does the navigating.
 */
export default async function TechToday() {
  const actor = await requireActor();

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

  const visits = await prisma.visit.findMany({
    where: {
      technicianId: actor.userId,
      scheduledFor: { gte: dayStart, lt: dayEnd },
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
    },
    include: {
      location: { select: { name: true, addressLine1: true, city: true } },
      organization: { select: { name: true } },
      tasks: { select: { status: true } },
    },
    orderBy: { scheduledFor: "asc" },
  });

  const allTasks = visits.flatMap((v) => v.tasks);
  const completed = allTasks.filter((t) => t.status === "COMPLETED").length;

  const upcoming = await prisma.visit.count({
    where: { technicianId: actor.userId, scheduledFor: { gte: dayEnd }, status: "SCHEDULED" },
  });

  return (
    <main className="rise">
      <SyncBanner />

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, color: "var(--ink-faint)", fontWeight: 600 }}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <h1 style={{ fontSize: 27, marginTop: 2 }}>Hi, {actor.name.split(" ")[0]}</h1>
      </div>

      <StatGrid>
        <Stat label="Restaurants" value={visits.length} />
        <Stat label="Units due" value={allTasks.length - completed} tone={allTasks.length - completed > 0 ? "warn" : "good"} />
        <Stat label="Completed" value={completed} tone="good" />
      </StatGrid>

      <SectionTitle>Today&rsquo;s visits</SectionTitle>
      {visits.length === 0 ? (
        <EmptyState
          title="Nothing scheduled today"
          body={upcoming > 0 ? `You have ${upcoming} visit${upcoming === 1 ? "" : "s"} coming up.` : "Check Visits for upcoming work."}
          action={<Button href="/tech/visits" variant="secondary">View visits</Button>}
        />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {visits.map((visit) => {
            const done = visit.tasks.filter((t) => t.status === "COMPLETED").length;
            const progress = visit.tasks.length > 0 ? done / visit.tasks.length : 0;
            return (
              <Card key={visit.id} style={{ padding: 0, overflow: "hidden" }}>
                <a href={`/tech/visits/${visit.id}`} className="tap" style={{ display: "block", padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 660 }}>{visit.location.name}</div>
                      <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 2 }}>
                        {visit.organization.name}
                        {visit.location.city ? ` · ${visit.location.city}` : ""}
                      </div>
                    </div>
                    <Pill tone={visit.status === "IN_PROGRESS" ? "warn" : "accent"}>
                      {visit.status === "IN_PROGRESS" ? "In progress" : `${visit.estimatedMinutes} min`}
                    </Pill>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--canvas)", overflow: "hidden" }}>
                      <div style={{ width: `${progress * 100}%`, height: "100%", background: "var(--good)", borderRadius: 999, transition: "width 300ms ease" }} />
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 640, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                      {done}/{visit.tasks.length} units
                    </div>
                  </div>
                </a>
              </Card>
            );
          })}
        </div>
      )}

      <SectionTitle>Quick actions</SectionTitle>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <Button href="/tech/scan" size="lg">Scan a tag</Button>
        <Button href="/tech/inventory" size="lg" variant="secondary">Rapid inventory</Button>
      </div>
      <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-faint)", textAlign: "center" }}>
        Next visit {upcoming > 0 ? "scheduled" : "unscheduled"} · {formatDate(new Date())}
      </div>
    </main>
  );
}
