"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

export interface NavItem { href: string; label: string; icon: ReactNode }

/** Bottom tab bar for the two mobile-first experiences. */
export function TabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
        background: "color-mix(in srgb, var(--surface) 92%, transparent)",
        backdropFilter: "blur(14px)", borderTop: "1px solid var(--line)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, maxWidth: 640, margin: "0 auto" }}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "grid", justifyItems: "center", gap: 3, padding: "9px 4px 11px",
                color: active ? "var(--accent)" : "var(--ink-faint)", fontSize: 11, fontWeight: 600, minHeight: 56,
              }}
            >
              <span style={{ display: "grid", placeItems: "center", height: 24 }}>{item.icon}</span>
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
        background: "color-mix(in srgb, var(--surface) 92%, transparent)",
        backdropFilter: "blur(14px)", borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "10px 20px", display: "flex", alignItems: "center", gap: 18 }}>
        <Link href="/admin" style={{ fontWeight: 700, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{title}</Link>
        <div style={{ display: "flex", gap: 2, overflowX: "auto", flex: 1 }}>
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "8px 12px", borderRadius: 10, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap",
                  color: active ? "var(--accent)" : "var(--ink-soft)",
                  background: active ? "var(--accent-soft)" : "transparent",
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

export const Icons = {
  home: <Glyph d="M3 10.5 12 3l9 7.5V21H3z" />,
  grid: <Glyph d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  calendar: <Glyph d="M3 7h18v14H3zM8 3v4M16 3v4M3 11h18" />,
  alert: <Glyph d="M12 3 2 20h20zM12 10v4M12 17v.5" />,
  user: <Glyph d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />,
  today: <Glyph d="M3 7h18v14H3zM8 3v4M16 3v4M8 14h4" />,
  route: <Glyph d="M6 3v12a3 3 0 0 0 3 3h9M15 15l3 3-3 3" />,
  scan: <Glyph d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M7 12h10" />,
  activity: <Glyph d="M3 12h4l3 8 4-16 3 8h4" />,
  tag: <Glyph d="m3 12 9-9h9v9l-9 9zM16.5 7.5v.01" />,
};

function Glyph({ d }: { d: string }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
