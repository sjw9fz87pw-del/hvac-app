"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { activeHref, type IconName, type NavItem } from "./nav-active";

export { activeHref };
export type { IconName, NavItem };

/**
 * Icons travel as names, not as elements.
 *
 * These layouts are server components importing from a "use client" module, so
 * a pre-built JSX element crosses the boundary as a client reference and
 * renders nothing. Passing a key and resolving it on the client side is what
 * makes the glyphs actually appear.
 */
const GLYPHS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5V21H3z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  calendar: "M3 7h18v14H3zM8 3v4M16 3v4M3 11h18",
  alert: "M12 3 2 20h20zM12 10v4M12 17v.5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  today: "M3 7h18v14H3zM8 3v4M16 3v4M8 14h4",
  route: "M6 3v12a3 3 0 0 0 3 3h9M15 15l3 3-3 3",
  scan: "M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M7 12h10",
  activity: "M3 12h4l3 8 4-16 3 8h4",
  tag: "m3 12 9-9h9v9l-9 9zM16.5 7.5v.01",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  building: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h.01M15 10h.01M9 13.5h.01M15 13.5h.01",
  pin: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 10h.01",
  people: "M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M18 21a6 6 0 0 0-2-4.5",
  chart: "M3 21h18M7 17v-6M12 17V7M17 17v-9",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4.3 14.5a8 8 0 0 1 0-5l2-.4a6 6 0 0 1 1-1.7l-.7-1.9a8 8 0 0 1 4.3-2.5l1.1 1.7a6 6 0 0 1 2 0l1.1-1.7a8 8 0 0 1 4.3 2.5l-.7 1.9a6 6 0 0 1 1 1.7l2 .4a8 8 0 0 1 0 5l-2 .4a6 6 0 0 1-1 1.7l.7 1.9a8 8 0 0 1-4.3 2.5l-1.1-1.7a6 6 0 0 1-2 0l-1.1 1.7a8 8 0 0 1-4.3-2.5l.7-1.9a6 6 0 0 1-1-1.7z",
};

export function TabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const current = activeHref(pathname, items);
  return (
    <nav
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
        background: "color-mix(in srgb, var(--surface) 88%, transparent)",
        backdropFilter: "blur(18px)", borderTop: "1px solid var(--line)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, maxWidth: 640, margin: "0 auto", padding: "6px 6px 8px" }}>
        {items.map((item) => {
          const active = current === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "grid", justifyItems: "center", gap: 4, padding: "8px 4px 7px",
                color: active ? "var(--accent)" : "var(--ink-faint)",
                fontSize: 10.5, fontWeight: 700, letterSpacing: "0.02em", minHeight: 52,
                // The active tab sits on its own amber-tinted pill.
                background: active ? "var(--accent-soft)" : "transparent",
                border: `1px solid ${active ? "var(--accent-line)" : "transparent"}`,
                borderRadius: 13,
              }}
            >
              <span style={{ display: "grid", placeItems: "center", height: 22 }}>{item.icon ? <Glyph d={GLYPHS[item.icon]} /> : null}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * A slim identity strip. Navigation lives in the bottom tab bar on every shell,
 * so this only carries the mark and whatever the page puts beside it.
 */
export function AppBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header
      style={{
        position: "sticky", top: 0, zIndex: 30,
        background: "color-mix(in srgb, var(--surface) 88%, transparent)",
        backdropFilter: "blur(18px)", borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "10px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 9, whiteSpace: "nowrap" }}>
          <span
            aria-hidden="true"
            style={{
              width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center",
              background: "linear-gradient(180deg, var(--accent-2), var(--accent))",
              color: "#1a0f04", fontWeight: 800, fontSize: 13,
            }}
          >
            E
          </span>
          <span style={{ fontWeight: 750, letterSpacing: "-0.02em" }}>{title}</span>
        </Link>
        <div style={{ flex: 1 }} />
        {right}
      </div>
    </header>
  );
}

/** Render any nav glyph outside the bars — used by the More hub. */
export function NavIcon({ name, size = 21 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={GLYPHS[name]} />
    </svg>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
