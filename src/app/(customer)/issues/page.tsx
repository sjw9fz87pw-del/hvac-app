import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { tenantWhere } from "@/lib/auth/scope";
import { PageHeader, List, Row, Divider, StatusPill, EmptyState, SectionTitle, formatDate } from "@/components/ui/primitives";
import { STATUS_LABEL } from "@/components/ui/primitives";

export default async function IssuesPage() {
  const actor = await requireActor();

  const issues = await prisma.issue.findMany({
    where: tenantWhere(actor),
    include: { equipment: { select: { id: true, name: true } }, location: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const open = issues.filter((i) => ["OPEN", "TRIAGED", "ASSIGNED", "IN_PROGRESS"].includes(i.status));
  const closed = issues.filter((i) => !open.includes(i));

  return (
    <main className="rise">
      <PageHeader title="Issues" subtitle="Problems reported by your team or found during service" />

      {issues.length === 0 ? (
        <EmptyState
          title="No issues reported"
          body="Report a problem from any equipment page — we'll already know the unit, its model and its history."
        />
      ) : (
        <>
          <SectionTitle>Open · {open.length}</SectionTitle>
          {open.length === 0 ? (
            <EmptyState title="Nothing open" body="Every reported problem has been resolved." />
          ) : (
            <List>
              {open.map((issue, index) => (
                <div key={issue.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    href={`/equipment/${issue.equipmentId}`}
                    title={issue.title}
                    subtitle={`${issue.location.name} · reported ${formatDate(issue.createdAt)}`}
                    right={<StatusPill status={issue.status} />}
                  />
                </div>
              ))}
            </List>
          )}

          {closed.length > 0 ? (
            <>
              <SectionTitle>Resolved</SectionTitle>
              <List>
                {closed.slice(0, 20).map((issue, index) => (
                  <div key={issue.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row
                      href={`/equipment/${issue.equipmentId}`}
                      title={issue.title}
                      subtitle={issue.resolutionNote ?? STATUS_LABEL[issue.status] ?? issue.status}
                      right={<span style={{ fontSize: 13, color: "var(--ink-faint)" }}>{formatDate(issue.resolvedAt ?? issue.updatedAt)}</span>}
                    />
                  </div>
                ))}
              </List>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
