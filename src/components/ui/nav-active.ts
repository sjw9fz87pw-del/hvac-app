/**
 * Navigation types and the active-tab rule.
 *
 * Kept out of the component module because it is pure: it is worth testing on
 * its own, and a test should not have to pull a React tree in to do it.
 */

export type IconName =
  | "home" | "grid" | "calendar" | "alert" | "user"
  | "today" | "route" | "scan" | "activity" | "tag"
  | "more" | "building" | "pin" | "people" | "chart" | "gear" | "check";

export interface NavItem {
  href: string;
  label: string;
  icon?: IconName;
  /** Active only on this exact path — for root tabs like /admin. */
  exact?: boolean;
  /** Claims any path no other tab matches — the More hub. */
  fallback?: boolean;
}

/**
 * Which tab is active for a path.
 *
 *   1. An exact match always wins.
 *   2. Otherwise the longest prefix match among tabs that accept sub-paths.
 *   3. Otherwise the fallback tab, if there is one.
 *
 * Root tabs like /admin are marked `exact` so they stop claiming every page
 * beneath them — the bug a naive startsWith produces on any shell with a root
 * tab. Destinations that live behind More therefore light up More, not the
 * dashboard.
 */
export function activeHref(pathname: string, items: readonly NavItem[]): string | null {
  const exact = items.find((item) => item.href === pathname);
  if (exact) return exact.href;

  let best: NavItem | null = null;
  for (const item of items) {
    if (item.exact) continue;
    if (!pathname.startsWith(`${item.href}/`)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  if (best) return best.href;

  return items.find((item) => item.fallback)?.href ?? null;
}
