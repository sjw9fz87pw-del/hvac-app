import Link from "next/link";

/**
 * Multi-location groups switch context here; a single-location customer never sees it.
 *
 * The strip runs to the screen edges, so a name cut off at the right reads as
 * "scroll for more" rather than as a clipped button.
 */
export function LocationSwitcher({ locations, selected }: {
  locations: { id: string; name: string; city: string | null }[];
  selected: string | null;
}) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px", padding: "0 16px 4px", scrollbarWidth: "none" }}>
      <Chip href="/home" active={selected === null}>All locations</Chip>
      {locations.map((location) => (
        <Chip key={location.id} href={`/home?locationId=${location.id}`} active={selected === location.id}>
          {location.name}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ children, active, href }: { children: React.ReactNode; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      style={{
        padding: "9px 15px", borderRadius: 999, whiteSpace: "nowrap", fontSize: 14, fontWeight: 600, flexShrink: 0,
        border: `1px solid ${active ? "transparent" : "var(--line)"}`,
        background: active ? "var(--accent)" : "var(--surface-2)",
        color: active ? "#1a0f04" : "var(--ink-soft)",
      }}
    >
      {children}
    </Link>
  );
}
