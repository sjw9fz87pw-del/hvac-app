import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { TabBar, Icons } from "@/components/ui/nav";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/signin");

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: 82 }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px 18px 8px" }}>{children}</div>
      <TabBar
        items={[
          { href: "/home", label: "Home", icon: Icons.home },
          { href: "/equipment", label: "Equipment", icon: Icons.grid },
          { href: "/service", label: "Service", icon: Icons.calendar },
          { href: "/issues", label: "Issues", icon: Icons.alert },
          { href: "/account", label: "Account", icon: Icons.user },
        ]}
      />
    </div>
  );
}
