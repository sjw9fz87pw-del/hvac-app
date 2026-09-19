import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { roleCopy, roleLabel } from "@/lib/auth/role-copy";
import { awaitingSetup } from "@/lib/auth/invite-service";
import type { Role } from "@/lib/auth/permissions";
import { PageHeader, List, Row, Divider, Pill, SectionTitle, EmptyState, Button, formatDate } from "@/components/ui/primitives";

export default async function PeoplePage() {
  const actor = await requireCapability("user.manage");
  const scope = organizationScope(actor);

  // A customer org owner manages their own people, never ours: scope the list
  // to memberships inside the organizations they can actually see.
  const people = await prisma.user.findMany({
    where: scope
      ? { memberships: { some: { organizationId: { in: scope.length ? scope : ["__none__"] } } } }
      : { serviceCompanyId: actor.serviceCompanyId },
    include: {
      memberships: {
        include: {
          organization: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = people.map((person) => {
    const membership = person.memberships[0];
    const role = (membership?.role ?? "CUSTOMER_STAFF") as Role;
    const copy = roleCopy(role);
    const where = membership?.location?.name
      ?? membership?.organization?.name
      ?? "Your company";
    return { person, role, copy, where, pending: awaitingSetup(person.passwordHash) };
  });

  const team = rows.filter((r) => r.copy.kind === "internal");
  const customers = rows.filter((r) => r.copy.kind === "customer");

  const addButton = (
    <div style={{ width: 130 }}>
      <Button href="/admin/people/new" size="sm">Add person</Button>
    </div>
  );

  function group(title: string, items: typeof rows, empty: string) {
    return (
      <>
        <SectionTitle>{title}</SectionTitle>
        {items.length === 0 ? (
          <EmptyState title={empty} />
        ) : (
          <List>
            {items.map(({ person, copy, where, pending }, index) => (
              <div key={person.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  href={`/admin/people/${person.id}`}
                  title={person.name}
                  subtitle={`${person.email} · ${where}`}
                  right={
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {person.id === actor.userId ? <Pill tone="accent">You</Pill> : null}
                      {!person.active ? <Pill tone="bad">No access</Pill>
                        : pending ? <Pill tone="warn">Invited</Pill>
                        : <Pill tone={copy.kind === "internal" ? "info" : "neutral"}>{copy.label}</Pill>}
                    </div>
                  }
                />
              </div>
            ))}
          </List>
        )}
      </>
    );
  }

  return (
    <main className="rise">
      <PageHeader
        title="People"
        subtitle={`${people.length} ${people.length === 1 ? "person" : "people"} with access`}
        action={addButton}
      />

      {actor.internal ? group("Your team", team, "Nobody on the team yet") : null}
      {group("Restaurant access", customers, "No restaurant staff have been given access yet")}

      <p style={{ color: "var(--ink-faint)", fontSize: 13, marginTop: 22, lineHeight: 1.55 }}>
        Everyone signs in at the same address and lands on the view their role gives them.
        A restaurant manager sees only their own restaurant; a group owner sees every
        restaurant in their group. {roleLabel("TECHNICIAN")}s see today&rsquo;s work.
        Tap anyone to reset them, change what they see, or remove their access.
      </p>
    </main>
  );
}
