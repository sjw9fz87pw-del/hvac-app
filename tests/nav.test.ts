import { describe, expect, it } from "vitest";
import { activeHref, type NavItem } from "@/components/ui/nav-active";

/**
 * Which tab lights up is pure, and wrong answers are quietly disorienting
 * rather than loud, so it is worth pinning down.
 */
const ADMIN: NavItem[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/equipment", label: "Equipment" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/issues", label: "Issues" },
  { href: "/admin/more", label: "More", fallback: true },
];

const TECH: NavItem[] = [
  { href: "/tech", label: "Today", exact: true },
  { href: "/tech/visits", label: "Visits" },
  { href: "/tech/scan", label: "Scan" },
];

describe("active tab", () => {
  it("matches a tab exactly", () => {
    expect(activeHref("/admin", ADMIN)).toBe("/admin");
    expect(activeHref("/admin/equipment", ADMIN)).toBe("/admin/equipment");
  });

  it("keeps a root tab from claiming everything beneath it", () => {
    // The whole reason `exact` exists: /admin must not own /admin/equipment.
    expect(activeHref("/admin/equipment", ADMIN)).not.toBe("/admin");
    expect(activeHref("/tech/visits", TECH)).toBe("/tech/visits");
    expect(activeHref("/tech/visits", TECH)).not.toBe("/tech");
  });

  it("follows a tab into its detail pages", () => {
    expect(activeHref("/admin/equipment/eq_123", ADMIN)).toBe("/admin/equipment");
    expect(activeHref("/tech/visits/v_1", TECH)).toBe("/tech/visits");
  });

  it("sends anything unclaimed to the fallback tab", () => {
    // These live behind More, so More should light up — not the dashboard.
    for (const path of ["/admin/customers", "/admin/locations", "/admin/nfc", "/admin/reports", "/admin/settings"]) {
      expect(activeHref(path, ADMIN), path).toBe("/admin/more");
    }
  });

  it("prefers the longest match when tabs nest", () => {
    const items: NavItem[] = [{ href: "/a", label: "A" }, { href: "/a/b", label: "B" }];
    expect(activeHref("/a/b/c", items)).toBe("/a/b");
  });

  it("returns null when nothing matches and there is no fallback", () => {
    expect(activeHref("/elsewhere", TECH)).toBeNull();
  });
});
