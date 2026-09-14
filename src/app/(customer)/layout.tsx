import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { TabBar } from "@/components/ui/nav";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/signin");

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: 82 }}>
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
