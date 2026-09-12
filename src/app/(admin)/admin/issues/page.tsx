import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { PageHeader, SectionTitle, List, Row, Divider, Pill, StatusPill, EmptyState, Stat, StatGrid, formatDate } from "@/components/ui/primitives";

export default async function AdminIssues({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const actor = await requireCapability("issue.read");
  const { source } = await searchParams;
  const scope = organizationScope(actor);

  const issues = await prisma.issue.findMany({
    where: {
      ...(scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {}),
      ...(source === "CUSTOMER" ? { source: "CUSTOMER" as const } : {}),
    },
    include: {
      equipment: { select: { id: true, name: true } },
      location: { select: { name: true } },
      organization: { select: { name: true } },
      reportedBy: { select: { name: true } },
      vendor: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { severity: "asc" }, { createdAt: "desc" }],
    take: 150,
  });

  const open = issues.filter((i) => ["OPEN", "TRIAGED", "ASSIGNED", "IN_PROGRESS"].includes(i.status));
  const fromCustomers = open.filter((i) => i.source === "CUSTOMER").length;
  const fromTechs = open.filter((i) => i.source === "TECHNICIAN").length;

  return (
    <main className="rise">
      <PageHeader title="Issues" subtitle="Problems reported by customers and found during service" />

      <StatGrid min={150}>
        <Stat label="Open" value={open.length} tone={open.length > 0 ? "warn" : "good"} />
        <Stat label="From customers" value={fromCustomers} />
        <Stat label="Found by technicians" value={fromTechs} tone="info" />
        <Stat label="Critical" value={open.filter((i) => i.severity === "CRITICAL").length} tone="bad" />
      </StatGrid>

      <SectionTitle>Open issues</SectionTitle>
      {open.length === 0 ? (
        <EmptyState title="Nothing open" body="Every reported problem has been resolved or closed." />
      ) : (
        <List>
          {open.map((issue, index) => (
            <div key={issue.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/admin/issues/${issue.id}`}
                title={issue.title}
                subtitle={`${issue.organization.name} · ${issue.location.name} · ${issue.source === "CUSTOMER" ? "customer" : "technician"} · ${formatDate(issue.createdAt)}${issue.vendor ? ` · routed to ${issue.vendor.name}` : ""}`}
                right={
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {issue.severity === "CRITICAL" || issue.severity === "HIGH" ? <Pill tone="bad">{issue.severity}</Pill> : null}
                    <StatusPill status={issue.status} />
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
