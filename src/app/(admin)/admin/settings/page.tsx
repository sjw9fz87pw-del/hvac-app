import { requireActor } from "@/lib/auth/session";
import { RequirementsEditor } from "./requirements";
import { IntervalEditor, type IntervalRow } from "@/components/ui/interval-editor";
import { AddJob } from "@/components/ui/add-job";
import { EmailStatus } from "./email-status";
import { emailConfigured, emailProvider } from "@/lib/email/send";
import { prisma } from "@/lib/db/client";
import { PageHeader, SectionTitle, List, Row, Divider, Card, Pill, titleCase } from "@/components/ui/primitives";

/** Service types and their completion requirements — the configurable proof gates. */
export default async function SettingsPage() {
  const actor = await requireActor();
  // Proof gates are only editable by someone who holds settings.manage.
  const canEdit = actor.capabilities.has("settings.manage");

  const [serviceTypes, plans, vendors] = await Promise.all([
    // Removed jobs with history are kept for their records, but are not work.
    prisma.serviceType.findMany({
      where: { serviceCompanyId: actor.serviceCompanyId, active: true },
      include: {
        checklistItems: { orderBy: { sortOrder: "asc" } },
        _count: { select: { schedules: { where: { equipment: { archivedAt: null } } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.maintenancePlan.findMany({
      where: { scope: { in: ["SYSTEM", "CUSTOMER", "LOCATION"] }, active: true, serviceType: { active: true } },
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
      <PageHeader title="Settings" />

      <SectionTitle>Email</SectionTitle>
      <EmailStatus configured={emailConfigured()} provider={emailProvider()} ownEmail={actor.email} />

      <SectionTitle>How often each job is done</SectionTitle>
      <Card style={{ marginBottom: 12, background: "var(--surface-2)", borderStyle: "dashed", fontSize: 13.5, color: "var(--ink-soft)" }}>
        Default intervals. Restaurants and individual units can override them.
      </Card>
      {canEdit ? (
        <>
          <IntervalEditor
            scope="SYSTEM"
            canRemove
            rows={serviceTypes.map((t): IntervalRow => ({
              serviceTypeId: t.id,
              name: t.name,
              effectiveDays: t.defaultIntervalDays,
              overridden: false,
              inheritedFrom: "SYSTEM",
              unitCount: t._count.schedules,
            }))}
          />
          {/* Defined here; put on units from each restaurant's page. */}
          <AddJob jobs={[]} canCreate canAttach={false} />
        </>
      ) : null}

      <SectionTitle>Completion requirements</SectionTitle>
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

            {canEdit ? (
              <RequirementsEditor
                serviceTypeId={serviceType.id}
                initial={{
                  requiresNfcVerification: serviceType.requiresNfcVerification,
                  requiresBeforePhoto: serviceType.requiresBeforePhoto,
                  requiresAfterPhoto: serviceType.requiresAfterPhoto,
                  requiresChecklist: serviceType.requiresChecklist,
                  requiresTechnicianNote: serviceType.requiresTechnicianNote,
                }}
              />
            ) : (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 12 }}>
                {serviceType.requiresNfcVerification ? <Pill tone="info">Tag verification</Pill> : null}
                {serviceType.requiresBeforePhoto ? <Pill tone="info">Before photo</Pill> : null}
                {serviceType.requiresAfterPhoto ? <Pill tone="info">After photo</Pill> : null}
                {serviceType.requiresChecklist ? <Pill tone="info">Checklist</Pill> : null}
                {serviceType.requiresTechnicianNote ? <Pill tone="info">Note</Pill> : null}
              </div>
            )}

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
      <Card style={{ marginBottom: 12, background: "var(--surface-2)", borderStyle: "dashed", fontSize: 13.5, color: "var(--ink-soft)" }}>
        Unit settings override restaurant, group and default settings.
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
          No vendors added.
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
