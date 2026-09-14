import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { TabBar } from "@/components/ui/nav";

export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  // The technician surface is internal-only; a customer session never renders it.
  if (!actor.internal) redirect("/home");

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: 82 }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px 18px 8px" }}>{children}</div>
      <TabBar
        items={[
          { href: "/tech", label: "Today", icon: "today", exact: true },
          { href: "/tech/visits", label: "Visits", icon: "route" },
          { href: "/tech/scan", label: "Scan", icon: "scan" },
          { href: "/tech/activity", label: "Activity", icon: "activity" },
          { href: "/tech/profile", label: "Profile", icon: "user" },
        ]}
      />
    </div>
  );
}
