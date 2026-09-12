import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireActor } from "@/lib/auth/session";
import { canAccessAsset } from "@/lib/auth/scope";
import { Card, Pill, Button, StatusPill, formatDate } from "@/components/ui/primitives";
import { photoThumb } from "@/components/ui/equipment-bits";

/**
 * A visit as the technician works it: tasks grouped by area so the restaurant is
 * walked once, with the next incomplete unit always the obvious next tap.
 */
export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      location: true,
      organization: { select: { name: true } },
      tasks: {
        include: {
          serviceType: { select: { name: true, estimatedMinutes: true } },
          equipment: {
            include: {
              area: true,
              photos: { where: { kind: "IDENTIFICATION" }, take: 1 },
              tagAssignments: { where: { unassignedAt: null } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!visit || !canAccessAsset(actor, visit)) notFound();

  const groups = new Map<string, typeof visit.tasks>();
  for (const task of visit.tasks) {
    const key = task.equipment.area?.name ?? "Unassigned";
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }

  const done = visit.tasks.filter((t) => t.status === "COMPLETED").length;
  const nextTask = visit.tasks.find((t) => t.status === "PENDING" || t.status === "IN_PROGRESS");

  return (
    <main className="rise">
      <a href="/tech" style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 600 }}>← Today</a>

      <div style={{ margin: "12px 0 16px" }}>
        <h1 style={{ fontSize: 25 }}>{visit.location.name}</h1>
        <div style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 3 }}>
          {visit.organization.name} · {formatDate(visit.scheduledFor)} · {visit.tasks.length} units
        </div>
      </div>

      {/* Door codes and access notes are internal; this route is technician-only. */}
      {visit.location.accessNotes ? (
        <Card style={{ background: "var(--info-soft)", borderColor: "transparent", marginBottom: 14 }}>
          <Pill tone="info">Access</Pill>
          <p style={{ fontSize: 14.5, marginTop: 8 }}>{visit.location.accessNotes}</p>
        </Card>
      ) : null}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 660 }}>{done} of {visit.tasks.length} complete</div>
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>~{visit.estimatedMinutes} min estimated</div>
          </div>
          <StatusPill status={visit.status} />
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "var(--canvas)", overflow: "hidden", marginTop: 12 }}>
          <div style={{ width: `${visit.tasks.length ? (done / visit.tasks.length) * 100 : 0}%`, height: "100%", background: "var(--good)", borderRadius: 999 }} />
        </div>
      </Card>

      {nextTask ? (
        <div style={{ marginBottom: 20 }}>
          <Button href={`/tech/task/${nextTask.id}`} size="lg">
            {done === 0 ? "Start visit" : "Continue"} — {nextTask.equipment.name}
          </Button>
          <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--ink-faint)", marginTop: 8 }}>
            Or tap the tag on any unit to jump straight to it
          </div>
        </div>
      ) : (
        <Card style={{ background: "var(--good-soft)", borderColor: "transparent", textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 660, color: "var(--good)" }}>All units complete</div>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 4 }}>
            The customer&rsquo;s service report is ready.
          </p>
          <div style={{ marginTop: 14, maxWidth: 240, marginInline: "auto" }}>
            <Button href={`/service/${visit.id}`} variant="secondary">View report</Button>
          </div>
        </Card>
      )}

      {[...groups.entries()].map(([areaName, tasks]) => (
        <section key={areaName} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-faint)", fontWeight: 660, margin: "0 0 10px" }}>
            {areaName} · {tasks.length}
          </h2>
          <div style={{ display: "grid", gap: 8 }}>
            {tasks.map((task) => (
              <Card key={task.id} style={{ padding: 0, opacity: task.status === "COMPLETED" ? 0.62 : 1 }}>
                <a href={`/tech/task/${task.id}`} className="tap" style={{ display: "flex", alignItems: "center", gap: 12, padding: 14 }}>
                  {photoThumb(task.equipment.photos[0]?.blobKey ?? null, task.equipment.name)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 620 }}>{task.equipment.name}</div>
                    <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
                      {task.serviceType.name} · {task.serviceType.estimatedMinutes} min
                    </div>
                  </div>
                  {task.equipment.tagAssignments.length === 0 ? <Pill tone="warn">No tag</Pill> : null}
                  <StatusPill status={task.status} />
                </a>
              </Card>
            ))}
          </div>
        </section>
      ))}
      <div style={{ height: 20 }} />
    </main>
  );
}
