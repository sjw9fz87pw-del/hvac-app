import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { ShellBar } from "@/components/ui/shell-bar";
import { homeFor } from "@/lib/auth/routing";
import { TabBar } from "@/components/ui/nav";

const SHELL_LABEL: Record<string, string> = { "/admin": "Dashboard", "/tech": "Today", "/home": "Home" };

export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  // The technician surface is internal-only; a customer session never renders it.
  if (!actor.internal) redirect("/home");

  const home = homeFor(actor);

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: 82 }}>
      <ShellBar
        roots={["/tech", "/tech/visits", "/tech/scan", "/tech/activity", "/tech/profile"]}
        crossShell={home === "/tech" ? null : { href: home, label: SHELL_LABEL[home] ?? "Dashboard" }}
      />
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
