import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { TabBar, Icons } from "@/components/ui/nav";

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
          { href: "/tech", label: "Today", icon: Icons.today },
          { href: "/tech/visits", label: "Visits", icon: Icons.route },
          { href: "/tech/scan", label: "Scan", icon: Icons.scan },
          { href: "/tech/activity", label: "Activity", icon: Icons.activity },
          { href: "/tech/profile", label: "Profile", icon: Icons.user },
        ]}
      />
    </div>
  );
}
