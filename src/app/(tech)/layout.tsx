import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { ShellBar } from "@/components/ui/shell-bar";
import { homeFor } from "@/lib/auth/routing";
import { TabBar } from "@/components/ui/nav";
import type { NavItem } from "@/components/ui/nav-active";

const SHELL_LABEL: Record<string, string> = { "/admin": "Dashboard", "/tech": "Today", "/home": "Home" };

/**
 * The tabs, and therefore the pages that are roots.
 *
 * The back bar hides itself on a root, so it needs the same list the tab
 * bar renders. Written twice, the two drifted the moment a tab changed and
 * a root grew a pointless Back button — so it is written once.
 */
const TABS: NavItem[] = [
          { href: "/tech", label: "Today", icon: "today", exact: true },
          { href: "/tech/visits", label: "Visits", icon: "route" },
          { href: "/tech/scan", label: "Scan", icon: "scan" },
          { href: "/tech/complete", label: "Done", icon: "check" },
          { href: "/tech/profile", label: "Profile", icon: "user" },
        ];

const TAB_ROOTS = TABS.map((tab) => tab.href);

export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  // The technician surface is internal-only; a customer session never renders it.
  if (!actor.internal) redirect("/home");

  const home = homeFor(actor);

  return (
    <div className="app-shell">
      <ShellBar
        roots={TAB_ROOTS}
        crossShell={home === "/tech" ? null : { href: home, label: SHELL_LABEL[home] ?? "Dashboard" }}
      />
      <div className="app-scroll">
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px 18px 24px" }}>{children}</div>
      </div>
      <TabBar items={TABS} />
    </div>
  );
}
