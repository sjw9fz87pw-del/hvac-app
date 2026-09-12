"use client";

import { useRouter } from "next/navigation";

/** Multi-location groups switch context here; a single-location customer never sees it. */
export function LocationSwitcher({ locations, selected }: {
  locations: { id: string; name: string; city: string | null }[];
  selected: string | null;
}) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
      <Chip active={selected === null} onClick={() => router.push("/home")}>All locations</Chip>
      {locations.map((location) => (
        <Chip key={location.id} active={selected === location.id} onClick={() => router.push(`/home?locationId=${location.id}`)}>
          {location.name}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 15px", borderRadius: 999, whiteSpace: "nowrap", fontSize: 14, fontWeight: 600, cursor: "pointer",
        border: `1px solid ${active ? "transparent" : "var(--line)"}`,
        background: active ? "var(--accent)" : "var(--surface)",
        color: active ? "#fff" : "var(--ink-soft)",
      }}
    >
      {children}
    </button>
  );
}
