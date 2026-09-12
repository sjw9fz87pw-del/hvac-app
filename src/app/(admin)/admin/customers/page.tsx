import { requireCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { organizationScope } from "@/lib/auth/scope";
import { PageHeader, List, Row, Divider, Pill, EmptyState } from "@/components/ui/primitives";

export default async function CustomersPage() {
  const actor = await requireCapability("org.read");
  const scope = organizationScope(actor);

  const organizations = await prisma.customerOrganization.findMany({
    where: scope ? { id: { in: scope.length ? scope : ["__none__"] } } : { serviceCompanyId: actor.serviceCompanyId },
    include: {
      locations: { where: { active: true }, select: { id: true } },
      _count: { select: { equipment: true, issues: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="rise">
      <PageHeader title="Customers" subtitle={`${organizations.length} restaurant group${organizations.length === 1 ? "" : "s"} under management`} />

      {organizations.length === 0 ? (
        <EmptyState title="No customers yet" />
      ) : (
        <List>
          {organizations.map((organization, index) => (
            <div key={organization.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                href={`/admin/customers/${organization.id}`}
                title={organization.name}
                subtitle={`${organization.locations.length} location${organization.locations.length === 1 ? "" : "s"} · ${organization._count.equipment} assets`}
                right={organization._count.issues > 0 ? <Pill tone="warn">{organization._count.issues} issues</Pill> : <Pill tone="good">Clear</Pill>}
              />
            </div>
          ))}
        </List>
      )}
    </main>
  );
}
