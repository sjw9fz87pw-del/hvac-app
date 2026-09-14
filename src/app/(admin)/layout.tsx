import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { ShellBar } from "@/components/ui/shell-bar";
import { homeFor } from "@/lib/auth/routing";
import { AppBar, TabBar } from "@/components/ui/nav";
import { GlobalSearch } from "@/components/ui/global-search";

/**
 * The admin shell.
 *
 * Ten destinations used to sit in a horizontally scrolling top bar, which meant
 * half of them were always off-screen. The five reached most often are now
 * thumb-height at the bottom, matching the customer and technician shells, and
 * the rest live in a browsable More hub.
 */
const SHELL_LABEL: Record<string, string> = { "/admin": "Dashboard", "/tech": "Today", "/home": "Home" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  if (!actor.internal) redirect("/home");

  const home = homeFor(actor);

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: 86 }}>
      <ShellBar
        roots={["/admin", "/admin/equipment", "/admin/schedule", "/admin/issues", "/admin/more"]}
        crossShell={home === "/admin" ? null : { href: home, label: SHELL_LABEL[home] ?? "Dashboard" }}
      />
      <AppBar title="Equipment Care" />
      <GlobalSearch />
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 20px 8px" }}>{children}</div>
      <TabBar
        items={[
          { href: "/admin", label: "Dashboard", icon: "home", exact: true },
          { href: "/admin/equipment", label: "Equipment", icon: "grid" },
          { href: "/admin/schedule", label: "Schedule", icon: "calendar" },
          { href: "/admin/issues", label: "Issues", icon: "alert" },
          { href: "/admin/more", label: "More", icon: "more", fallback: true },
        ]}
      />
    </div>
  );
}
