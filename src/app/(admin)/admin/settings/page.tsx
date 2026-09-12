import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { PageHeader, SectionTitle, List, Row, Divider, Card, Pill, titleCase } from "@/components/ui/primitives";

/** Service types and their completion requirements — the configurable proof gates. */
export default async function SettingsPage() {
  const actor = await requireActor();

  const [serviceTypes, plans, vendors] = await Promise.all([
    prisma.serviceType.findMany({
      where: { serviceCompanyId: actor.serviceCompanyId },
      include: { checklistItems: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.maintenancePlan.findMany({
      where: { scope: { in: ["SYSTEM", "CUSTOMER", "LOCATION"] }, active: true },
      include: {
        serviceType: { select: { name: true } },
        organization: { select: { name: true } },
        location: { select: { name: true } },
      },
      orderBy: { scope: "asc" },
      take: 50,
    }),
    prisma.vendor.findMany({ where: { serviceCompanyId: actor.serviceCompanyId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="rise">
      <PageHeader title="Settings" subtitle="Service types, maintenance plans and vendors" />

      <SectionTitle>Service types</SectionTitle>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {serviceTypes.map((serviceType) => (
          <Card key={serviceType.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 640, flex: 1 }}>{serviceType.name}</div>
              <Pill tone="accent">{serviceType.defaultIntervalDays}d</Pill>
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 3 }}>
              {titleCase(serviceType.category)} · ~{serviceType.estimatedMinutes} min
            </div>

            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 12 }}>
              {serviceType.requiresNfcVerification ? <Pill tone="info">Tag verification</Pill> : null}
              {serviceType.requiresBeforePhoto ? <Pill tone="info">Before photo</Pill> : null}
              {serviceType.requiresAfterPhoto ? <Pill tone="info">After photo</Pill> : null}
              {serviceType.requiresChecklist ? <Pill tone="info">Checklist</Pill> : null}
              {serviceType.requiresTechnicianNote ? <Pill tone="info">Note</Pill> : null}
            </div>

            {serviceType.checklistItems.length > 0 ? (
              <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13.5, color: "var(--ink-soft)" }}>
                {serviceType.checklistItems.map((item) => (
                  <li key={item.id}>{item.label}{item.required ? "" : " (optional)"}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        ))}
      </div>

      <SectionTitle>Maintenance plan overrides</SectionTitle>
      <Card style={{ marginBottom: 12, background: "var(--canvas)", borderStyle: "dashed", fontSize: 13.5, color: "var(--ink-soft)" }}>
        Precedence runs asset → location → customer → system template. The most specific active plan wins.
      </Card>
      <List>
        {plans.map((plan, index) => (
          <div key={plan.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={`${plan.serviceType.name} — every ${plan.intervalDays} days`}
              subtitle={
                plan.scope === "SYSTEM" ? `System default${plan.category ? ` for ${titleCase(plan.category)}` : ""}`
                  : plan.scope === "CUSTOMER" ? `Customer override — ${plan.organization?.name}`
                  : `Location override — ${plan.location?.name}`
              }
              right={<Pill tone={plan.scope === "SYSTEM" ? "neutral" : "accent"}>{titleCase(plan.scope)}</Pill>}
            />
          </div>
        ))}
      </List>

      <SectionTitle>Vendors</SectionTitle>
      {vendors.length === 0 ? (
        <Card style={{ fontSize: 14, color: "var(--ink-soft)" }}>
          No outside vendors yet. Issues can be routed to a contractor once vendors are added.
        </Card>
      ) : (
        <List>
          {vendors.map((vendor, index) => (
            <div key={vendor.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={vendor.name}
                subtitle={[vendor.trade ? titleCase(vendor.trade) : null, vendor.phone, vendor.email].filter(Boolean).join(" · ")}
                right={vendor.active ? <Pill tone="good">Active</Pill> : <Pill>Inactive</Pill>}
              />
            </div>
          ))}
        </List>
      )}
    </main>
  );
}
