import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { ShellBar } from "@/components/ui/shell-bar";
import { homeFor } from "@/lib/auth/routing";
import { TabBar } from "@/components/ui/nav";

const SHELL_LABEL: Record<string, string> = { "/admin": "Dashboard", "/tech": "Today", "/home": "Home" };

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/signin");

  const home = homeFor(actor);

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: 82 }}>
      <ShellBar
        roots={["/home", "/equipment", "/service", "/issues", "/account"]}
        crossShell={home === "/home" ? null : { href: home, label: SHELL_LABEL[home] ?? "Dashboard" }}
      />
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px 18px 8px" }}>{children}</div>
      <TabBar
        items={[
          { href: "/home", label: "Home", icon: "home" },
          { href: "/equipment", label: "Equipment", icon: "grid" },
          { href: "/service", label: "Service", icon: "calendar" },
          { href: "/issues", label: "Issues", icon: "alert" },
          { href: "/account", label: "Account", icon: "user" },
        ]}
      />
    </div>
  );
}
