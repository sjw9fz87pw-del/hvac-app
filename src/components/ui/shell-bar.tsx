"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GlobalSearch } from "./global-search";

/**
 * The one bar at the top of every screen.
 *
 * It used to be two — a Back bar, then a brand bar, then a search box below
 * both — which spent a third of a phone screen before any content. Now: the
 * brand on a tab root, Back everywhere else, and search as an icon.
 *
 * Back falls back to the parent route when there is no history, because a tag
 * tap or a shared link opens a page with nothing behind it.
 */
export function ShellBar({
  roots,
  crossShell,
  home,
  search = false,
}: {
  /** The tab destinations of this shell; Back is not shown on them. */
  roots: string[];
  /** Shown when the person is in a shell that is not their own. */
  crossShell: { href: string; label: string } | null;
  /** Where the brand mark links to. */
  home: string;
  search?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const atRoot = roots.includes(pathname);

  const parent = pathname.split("/").slice(0, -1).join("/") || "/";
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(parent);
  };

  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        {atRoot ? (
          <Link href={home} className="brand">
            <span className="brand-mark" aria-hidden="true">E</span>
            <span>Equipment Care</span>
          </Link>
        ) : (
          <button onClick={goBack} className="back-button" aria-label="Go back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
        )}

        <div style={{ flex: 1 }} />

        {crossShell ? (
          <Link href={crossShell.href} className="cross-shell">{crossShell.label}</Link>
        ) : null}
        {search ? <GlobalSearch compact /> : null}
      </div>
    </header>
  );
}
