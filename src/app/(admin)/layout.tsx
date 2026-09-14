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
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/customers", label: "Customers" },
          { href: "/admin/locations", label: "Locations" },
          { href: "/admin/equipment", label: "Equipment" },
          { href: "/admin/schedule", label: "Schedule" },
          { href: "/admin/technicians", label: "Technicians" },
          { href: "/admin/issues", label: "Issues" },
          { href: "/admin/reports", label: "Reports" },
          { href: "/admin/nfc", label: "NFC" },
          { href: "/admin/settings", label: "Settings" },
        ]}
      />
      <GlobalSearch />
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 20px 60px" }}>{children}</div>
    </div>
  );
}
