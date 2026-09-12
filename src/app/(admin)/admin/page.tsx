import { requireActor } from "@/lib/auth/session";
import { commandCenter } from "@/lib/api/dashboards";
import { Card, Stat, StatGrid, SectionTitle, List, Row, Divider, Pill, EmptyState, StatusPill } from "@/components/ui/primitives";

/**
 * The internal command center.
 *
 * Two halves: what is happening today, and everything that needs a human to
 * intervene. Exceptions are surfaced rather than buried - an asset without a tag
 * or a service closed without proof is a problem you should not have to go
 * looking for.
 */
export default async function CommandCenter() {
  const actor = await requireActor();
  const data = await commandCenter(actor);

  const exceptions = [
    { label: "Overdue service", value: data.exceptions.overdueAssets, href: "/admin/equipment?status=OVERDUE", tone: "bad" as const },
    { label: "Missed visits", value: data.exceptions.missedVisits, href: "/admin/schedule?status=missed", tone: "bad" as const },
    { label: "Customer-reported problems", value: data.exceptions.customerReportedProblems, href: "/admin/issues?source=CUSTOMER", tone: "warn" as const },
    { label: "Assets without NFC tags", value: data.exceptions.assetsWithoutTags, href: "/admin/nfc?filter=untagged", tone: "warn" as const },
    { label: "Awaiting verification", value: data.exceptions.assetsAwaitingVerification, href: "/admin/equipment?status=PENDING_SETUP", tone: "warn" as const },
    { label: "Failed NFC pairings (24h)", value: data.exceptions.failedTagPairings, href: "/admin/nfc?filter=failed", tone: "bad" as const },
    { label: "Incomplete service proof", value: data.exceptions.incompleteProof, href: "/admin/schedule?status=incomplete", tone: "bad" as const },
  ];

  const needsAttention = exceptions.filter((e) => e.value > 0);

  return (
    <main className="rise">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13.5, color: "var(--ink-faint)", fontWeight: 600 }}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <h1 style={{ fontSize: 27, marginTop: 2 }}>Command center</h1>
      </div>

      <StatGrid min={160}>
        <Stat label="Restaurants today" value={data.today.restaurants.length} />
        <Stat label="Equipment scheduled" value={data.today.equipmentScheduled} />
        <Stat label="Technicians working" value={data.today.techniciansWorking} />
        <Stat label="Completed" value={data.today.servicesCompleted} tone="good" />
        <Stat label="Remaining" value={data.today.servicesRemaining} tone={data.today.servicesRemaining > 0 ? "warn" : "good"} />
      </StatGrid>

      <SectionTitle>Today&rsquo;s restaurants</SectionTitle>
      {data.today.restaurants.length === 0 ? (
        <EmptyState title="No visits scheduled today" body="Generate a visit from Schedule to cover what's due." />
      ) : (
        <List>
          {data.today.restaurants.map((restaurant, index) => (
            <div key={restaurant.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/admin/schedule/${restaurant.id}`}
                title={restaurant.name}
                subtitle={`${restaurant.organizationName} · ${restaurant.completed}/${restaurant.taskCount} units${restaurant.technician ? ` · ${restaurant.technician}` : " · unassigned"}`}
                right={<StatusPill status={restaurant.status} />}
              />
            </div>
          ))}
        </List>
      )}

      <SectionTitle>Needs attention</SectionTitle>
      {needsAttention.length === 0 ? (
        <Card style={{ background: "var(--good-soft)", borderColor: "transparent" }}>
          <div style={{ fontWeight: 660, color: "var(--good)" }}>Nothing outstanding</div>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 4 }}>
            No overdue work, no missed visits, no untagged assets, no incomplete proof.
          </p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
          {needsAttention.map((item) => (
            <Card key={item.label} style={{ padding: 0 }}>
              <a href={item.href} className="tap" style={{ display: "flex", alignItems: "center", gap: 12, padding: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: "var(--ink-soft)", fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 25, fontWeight: 680, letterSpacing: "-0.03em", color: `var(--${item.tone})` }}>{item.value}</div>
                </div>
                <span style={{ color: "var(--ink-faint)" }}>›</span>
              </a>
            </Card>
          ))}
        </div>
      )}

      {data.exceptions.technicianExceptions.length > 0 ? (
        <>
          <SectionTitle>Technician exceptions</SectionTitle>
          <List>
            {data.exceptions.technicianExceptions.map((exception, index) => (
              <div key={`${exception.technicianId}-${index}`}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={exception.technicianName}
                  subtitle={exception.issue}
                  right={<Pill tone="warn">Follow up</Pill>}
                />
              </div>
            ))}
          </List>
        </>
      ) : null}
    </main>
  );
}
