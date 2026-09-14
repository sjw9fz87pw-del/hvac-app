import { homeFor } from "@/lib/auth/routing";
import type { Actor } from "@/lib/auth/session";

const SHELL_LABEL: Record<string, string> = {
  "/admin": "Dashboard",
  "/tech": "Today",
  "/home": "Home",
};

/**
 * A way back out of somebody else's area.
 *
 * The three shells each carry their own bottom tabs, so following a link across
 * one — an admin opening Rapid Inventory, a technician opening an equipment
 * passport — leaves you with a tab bar full of destinations that are not yours
 * and no route home. This renders only when the shell you are in is not the one
 * your role belongs to, so a technician in the technician shell never sees it.
 */
export function ShellReturn({ actor, shellRoot }: { actor: Actor; shellRoot: string }) {
  const home = homeFor(actor);
  if (home === shellRoot) return null;

  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 35,
        background: "color-mix(in srgb, var(--surface) 92%, transparent)",
        backdropFilter: "blur(18px)", borderBottom: "1px solid var(--accent-line)",
      }}
    >
      <a
        href={home}
        className="tap"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          maxWidth: 1240, margin: "0 auto", padding: "10px 20px",
          color: "var(--accent)", fontWeight: 650, fontSize: 14,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>←</span>
        Back to {SHELL_LABEL[home] ?? "your dashboard"}
      </a>
    </div>
  );
}
