"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Back, and a way out of someone else's area.
 *
 * Two problems this solves. Detail pages had small inline text links back to
 * their parent, and only nine of them did — everywhere else you were left with
 * the browser's gesture. And the three shells each carry only their own tabs,
 * so following a link across one (an admin opening Rapid Inventory, a
 * technician opening an equipment passport) stranded you with a tab bar full of
 * destinations that are not yours.
 *
 * One bar handles both: a real Back button on anything that is not a tab root,
 * and a link home when the shell you are in is not the one your role belongs to.
 */
export function ShellBar({
  roots,
  crossShell,
}: {
  /** The tab destinations of this shell; no Back button is shown on them. */
  roots: string[];
  crossShell: { href: string; label: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const atRoot = roots.includes(pathname);
  if (atRoot && !crossShell) return null;

  /** One segment up — used when there is no history to go back to. */
  const parent = pathname.split("/").slice(0, -1).join("/") || "/";

  const goBack = () => {
    // A tag tap or a shared link opens with no history behind it, so falling
    // back to the parent route keeps the button from leaving the app entirely.
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(parent);
  };

  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 35,
        background: "color-mix(in srgb, var(--surface) 92%, transparent)",
        backdropFilter: "blur(18px)",
        borderBottom: `1px solid ${crossShell ? "var(--accent-line)" : "var(--line)"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 1240, margin: "0 auto", padding: "6px 12px" }}>
        {!atRoot ? (
          <button
            onClick={goBack}
            aria-label="Go back"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              minHeight: 40, padding: "8px 14px 8px 10px", borderRadius: 11,
              background: "var(--surface-2)", border: "1px solid var(--line-strong)",
              color: "var(--ink)", fontWeight: 650, fontSize: 14.5, cursor: "pointer",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
        ) : null}

        <div style={{ flex: 1 }} />

        {crossShell ? (
          <a
            href={crossShell.href}
            className="tap"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              minHeight: 40, padding: "8px 13px", borderRadius: 11,
              background: "var(--accent-soft)", border: "1px solid var(--accent-line)",
              color: "var(--accent)", fontWeight: 650, fontSize: 14,
            }}
          >
            {crossShell.label}
          </a>
        ) : null}
      </div>
    </div>
  );
}
