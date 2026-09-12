import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { TopNav } from "@/components/ui/nav";
import { GlobalSearch } from "@/components/ui/global-search";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  if (!actor.internal) redirect("/home");

  return (
    <div style={{ minHeight: "100dvh" }}>
      <TopNav
        title="Equipment Care"
        items={[
          { href: "/admin", label: "Dashboard", icon: null },
          { href: "/admin/customers", label: "Customers", icon: null },
          { href: "/admin/locations", label: "Locations", icon: null },
          { href: "/admin/equipment", label: "Equipment", icon: null },
          { href: "/admin/schedule", label: "Schedule", icon: null },
          { href: "/admin/technicians", label: "Technicians", icon: null },
          { href: "/admin/issues", label: "Issues", icon: null },
          { href: "/admin/reports", label: "Reports", icon: null },
          { href: "/admin/nfc", label: "NFC", icon: null },
          { href: "/admin/settings", label: "Settings", icon: null },
        ]}
      />
      <GlobalSearch />
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 20px 60px" }}>{children}</div>
    </div>
  );
}
