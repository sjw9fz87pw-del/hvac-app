import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { ShellBar } from "@/components/ui/shell-bar";
import { homeFor } from "@/lib/auth/routing";
import { TabBar } from "@/components/ui/nav";
import type { NavItem } from "@/components/ui/nav-active";

/**
 * The admin shell.
 *
 * Ten destinations used to sit in a horizontally scrolling top bar, which meant
 * half of them were always off-screen. The five reached most often are now
 * thumb-height at the bottom, matching the customer and technician shells, and
 * the rest live in a browsable More hub.
 */
const SHELL_LABEL: Record<string, string> = { "/admin": "Dashboard", "/tech": "Today", "/home": "Home" };

/**
 * The tabs, and therefore the pages that are roots.
 *
 * The back bar hides itself on a root, so it needs the same list the tab
 * bar renders. Written twice, the two drifted the moment a tab changed and
 * a root grew a pointless Back button — so it is written once.
 */
const TABS: NavItem[] = [
          { href: "/admin", label: "Dashboard", icon: "home", exact: true },
          { href: "/admin/locations", label: "Restaurants", icon: "pin" },
          { href: "/admin/schedule", label: "Schedule", icon: "calendar" },
          { href: "/admin/issues", label: "Issues", icon: "alert" },
          { href: "/admin/more", label: "More", icon: "more", fallback: true },
        ];

const TAB_ROOTS = TABS.map((tab) => tab.href);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  if (!actor.internal) redirect("/home");

  const home = homeFor(actor);

  return (
    <div className="app-shell">
      <ShellBar
        roots={TAB_ROOTS}
        home="/admin"
        search
        crossShell={home === "/admin" ? null : { href: home, label: SHELL_LABEL[home] ?? "Dashboard" }}
      />
      <div className="app-scroll">
        <div className="page">{children}</div>
      </div>
      <TabBar items={TABS} />
    </div>
  );
}
