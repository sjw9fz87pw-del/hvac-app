import { prisma } from "@/lib/db/client";
import { requireActor } from "@/lib/auth/session";
import { organizationScope } from "@/lib/auth/scope";
import { PageHeader, Card, SectionTitle, Pill, titleCase } from "@/components/ui/primitives";
import { NavIcon, type IconName } from "@/components/ui/nav";
import { SignOutButton } from "@/app/(customer)/account/sign-out";
import { ChangePassword } from "@/components/ui/change-password";

/**
 * Everything that does not fit in the bottom bar, laid out to be scanned rather
 * than scrolled. Each destination carries a live count where one is meaningful,
 * so the hub answers "is there anything here for me?" without a tap.
 */
export default async function MorePage() {
  const actor = await requireActor();
  const scope = organizationScope(actor);
  const orgFilter = scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {};

  const [customers, units, technicians, untagged, openIssues] = await Promise.all([
    scope
      ? prisma.customerOrganization.count({ where: { id: { in: scope } } })
      : prisma.customerOrganization.count({ where: { serviceCompanyId: actor.serviceCompanyId } }),
    prisma.equipment.count({ where: { ...orgFilter, archivedAt: null } }),
    prisma.user.count({ where: { serviceCompanyId: actor.serviceCompanyId } }),
    prisma.tag.count({ where: { ...orgFilter, state: "ACTIVE", lockedAt: null } }),
    prisma.issue.count({ where: { ...orgFilter, status: { in: ["OPEN", "TRIAGED", "ASSIGNED", "IN_PROGRESS"] } } }),
  ]);

  const sections: { title: string; items: { href: string; icon: IconName; label: string; hint: string; badge?: { text: string; tone: "warn" | "accent" | "neutral" } }[] }[] = [
    {
      title: "Customers",
      items: [
        { href: "/admin/customers", icon: "building", label: "Groups", hint: "Restaurant groups under management", badge: { text: `${customers}`, tone: "neutral" } },
        { href: "/admin/equipment", icon: "grid", label: "All units", hint: "Every unit across every restaurant, in one list", badge: { text: `${units}`, tone: "neutral" } },
      ],
    },
    {
      title: "Operations",
      items: [
        { href: "/admin/people", icon: "people", label: "People", hint: "Who can sign in, and what each of them sees", badge: { text: `${technicians}`, tone: "neutral" } },
        { href: "/admin/nfc", icon: "tag", label: "NFC", hint: "Tags, pairing, history and QR fallback", ...(untagged > 0 ? { badge: { text: `${untagged} unlocked`, tone: "warn" as const } } : {}) },
        { href: "/admin/reports", icon: "chart", label: "Reports", hint: "Service proof and year-to-date performance" },
      ],
    },
    {
      title: "Setup",
      items: [
        { href: "/admin/settings", icon: "gear", label: "Settings", hint: "Service types, plan overrides and vendors" },
      ],
    },
  ];

  return (
    <main className="rise">
      <PageHeader title="More" subtitle={`Signed in as ${actor.name}`} />

      {openIssues > 0 ? (
        <Card style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 12, borderColor: "var(--accent-line)" }}>
          <span style={{ color: "var(--warn)" }}><NavIcon name="alert" /></span>
          <div style={{ flex: 1, fontSize: 14.5 }}>
            {openIssues} open issue{openIssues === 1 ? "" : "s"} waiting on triage
          </div>
          <a href="/admin/issues" style={{ color: "var(--accent)", fontWeight: 650, fontSize: 14 }}>Review →</a>
        </Card>
      ) : null}

      {sections.map((section) => (
        <section key={section.title}>
          <SectionTitle>{section.title}</SectionTitle>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {section.items.map((item) => (
              <Card key={item.href} style={{ padding: 0 }}>
                <a href={item.href} className="tap" style={{ display: "flex", alignItems: "center", gap: 13, padding: 16 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center",
                      background: "var(--accent-soft)", border: "1px solid var(--accent-line)", color: "var(--accent)",
                    }}
                  >
                    <NavIcon name={item.icon} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 680, fontSize: 15.5 }}>{item.label}</span>
                    <span style={{ display: "block", fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>{item.hint}</span>
                  </span>
                  {item.badge ? <Pill tone={item.badge.tone}>{item.badge.text}</Pill> : null}
                  <span style={{ color: "var(--ink-faint)", flexShrink: 0 }}>›</span>
                </a>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <SectionTitle>Account</SectionTitle>
      <Card style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 680 }}>{actor.name}</div>
        <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>{actor.email}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {actor.roles.map((role) => <Pill key={role} tone="accent">{titleCase(role)}</Pill>)}
        </div>
      </Card>
      <ChangePassword />
      <div style={{ marginTop: 12, marginBottom: 24 }}><SignOutButton /></div>
    </main>
  );
}
