import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { PageHeader, Card, SectionTitle, List, Row, Divider, Pill } from "@/components/ui/primitives";
import { SignOutButton } from "./sign-out";
import { titleCase } from "@/components/ui/primitives";

export default async function AccountPage() {
  const actor = await requireActor();
  const scope = organizationScope(actor);

  const locations = await prisma.restaurantLocation.findMany({
    where: {
      ...(scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {}),
      ...(actor.locationIds ? { id: { in: [...actor.locationIds] } } : {}),
    },
    include: { organization: { select: { name: true } }, _count: { select: { equipment: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <main className="rise">
      <PageHeader title="Account" />

      <Card>
        <div style={{ fontWeight: 660, fontSize: 17 }}>{actor.name}</div>
        <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>{actor.email}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {actor.roles.map((role) => <Pill key={role} tone="accent">{titleCase(role)}</Pill>)}
        </div>
      </Card>

      <SectionTitle>Your locations</SectionTitle>
      <List>
        {locations.map((location, index) => (
          <div key={location.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={location.name}
              subtitle={location.organization.name}
              right={<span style={{ fontSize: 13.5, color: "var(--ink-faint)" }}>{location._count.equipment} assets</span>}
            />
          </div>
        ))}
      </List>

      <SectionTitle>Notifications</SectionTitle>
      <Card>
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
          You&rsquo;ll be notified about upcoming and completed service, issues found and resolved, and overdue maintenance.
          Overdue items are digested into one daily summary per location rather than one message per unit.
        </p>
      </Card>

      <div style={{ marginTop: 24, marginBottom: 20 }}><SignOutButton /></div>
    </main>
  );
}
