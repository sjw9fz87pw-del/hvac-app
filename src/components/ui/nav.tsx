"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

/**
 * Icons travel as names, not as elements.
 *
 * These layouts are server components importing from a "use client" module, so
 * a pre-built JSX element crosses the boundary as a client reference and
 * renders nothing. Passing a key and resolving it on the client side is what
 * makes the glyphs actually appear.
 */
export type IconName =
  | "home" | "grid" | "calendar" | "alert" | "user"
  | "today" | "route" | "scan" | "activity" | "tag";

export interface NavItem { href: string; label: string; icon?: IconName }

/** Bottom tab bar for the two mobile-first experiences. */
export function TabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
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
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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

/** Admin uses a compact top bar rather than a giant sidebar. */
export function TopNav({ items, title }: { items: NavItem[]; title: string }) {
  const pathname = usePathname();
  return (
    <header
      style={{
        position: "sticky", top: 0, zIndex: 30,
        background: "color-mix(in srgb, var(--surface) 88%, transparent)",
        backdropFilter: "blur(18px)", borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "10px 20px", display: "flex", alignItems: "center", gap: 18 }}>
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
        <div style={{ display: "flex", gap: 2, overflowX: "auto", flex: 1 }}>
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "8px 13px", borderRadius: 11, fontSize: 14, fontWeight: 650, whiteSpace: "nowrap",
                  color: active ? "var(--accent)" : "var(--ink-soft)",
                  background: active ? "var(--accent-soft)" : "transparent",
                  border: `1px solid ${active ? "var(--accent-line)" : "transparent"}`,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}

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
};

function Glyph({ d }: { d: string }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
