import { requireActor } from "@/lib/auth/session";
import { PageHeader, Card, SectionTitle, Pill, titleCase } from "@/components/ui/primitives";
import { SignOutButton } from "@/app/(customer)/account/sign-out";
import { QueueStatus } from "./queue-status";

export default async function ProfilePage() {
  const actor = await requireActor();

  return (
    <main className="rise">
      <PageHeader title="Profile" />

      <Card>
        <div style={{ fontWeight: 660, fontSize: 17 }}>{actor.name}</div>
        <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>{actor.email}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {actor.roles.map((role) => <Pill key={role} tone="accent">{titleCase(role)}</Pill>)}
        </div>
      </Card>

      <SectionTitle>Offline queue</SectionTitle>
      <QueueStatus />

      <div style={{ marginTop: 24, marginBottom: 20 }}><SignOutButton /></div>
    </main>
  );
}
