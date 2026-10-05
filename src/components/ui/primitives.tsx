/**
 * The design system.
 *
 * Dark, warm, amber-accented. Rounded cards on hairline borders, tiny
 * wide-tracked uppercase kickers, chips led by a colour dot, and a single
 * gradient accent for anything the user acts on.
 *
 * Every export keeps the signature it had before the restyle — the screens and
 * the domain code underneath are untouched.
 */
import type { CSSProperties, ReactNode } from "react";

type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "accent";

const TONE_VARS: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: "var(--ink-soft)", bg: "var(--surface-2)" },
  good: { fg: "var(--good)", bg: "var(--good-soft)" },
  warn: { fg: "var(--warn)", bg: "var(--warn-soft)" },
  bad: { fg: "var(--bad)", bg: "var(--bad-soft)" },
  info: { fg: "var(--info)", bg: "var(--info-soft)" },
  accent: { fg: "var(--accent)", bg: "var(--accent-soft)" },
};

export function Card({ children, style, className, as: As = "div" }: {
  children: ReactNode; style?: CSSProperties; className?: string; as?: "div" | "section" | "article" | "li";
}) {
  return (
    <As
      className={className}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: 16,
        ...style,
      }}
    >
      {children}
    </As>
  );
}

/** Chips carry a leading dot in their own tone — the reference app's tell. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE_VARS[tone];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: t.bg, color: t.fg,
        border: `1px solid ${tone === "neutral" ? "var(--line)" : t.fg}2e`,
        borderRadius: 999, padding: "3px 9px 3px 7px",
        fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: t.fg, flexShrink: 0 }} />
      {children}
    </span>
  );
}

/** Status vocabulary is fixed so the same word never means two things. */
export const STATUS_TONE: Record<string, Tone> = {
  CURRENT: "good", UPCOMING: "good", COMPLETED: "good", ACTIVE: "good", RESOLVED: "good", EXCELLENT: "good", GOOD: "good",
  SCHEDULE_NEEDED: "warn", DUE: "warn", PENDING: "warn", PENDING_SETUP: "warn", IN_PROGRESS: "warn", FAIR: "warn", TRIAGED: "warn", ASSIGNED: "warn",
  OVERDUE: "bad", MISSED: "bad", OPEN: "bad", NEEDS_ATTENTION: "bad", AT_RISK: "bad", REVOKED: "bad", CRITICAL: "bad", OUT_OF_SERVICE: "bad",
  PAUSED: "neutral", ARCHIVED: "neutral", SKIPPED: "neutral", UNASSIGNED: "neutral", CLOSED: "neutral",
  SCHEDULED: "info", LOST: "info",
};

export const STATUS_LABEL: Record<string, string> = {
  UPCOMING: "Current", SCHEDULE_NEEDED: "Schedule needed", DUE: "Due", OVERDUE: "Overdue",
  PAUSED: "Paused", PENDING_SETUP: "Needs service setup", NEEDS_ATTENTION: "Needs attention",
  OUT_OF_SERVICE: "Out of service", IN_PROGRESS: "In progress", NOT_COOLING: "Not cooling",
  MAKING_NOISE: "Making noise", LEAKING: "Leaking", DOOR_PROBLEM: "Door problem",
  ICE_BUILDUP: "Ice build-up", NEEDS_CLEANING: "Needs cleaning", OTHER: "Other",
  WONT_FIX: "Won't fix", AT_RISK: "At risk",
};

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? titleCase(status)}</Pill>;
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export function Stat({ label, value, tone = "neutral", hint }: {
  label: string; value: ReactNode; tone?: Tone; hint?: string;
}) {
  const t = TONE_VARS[tone];
  return (
    <Card style={{ padding: "11px 12px", minWidth: 0 }}>
      <div
        style={{
          fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1,
          color: tone === "neutral" ? "var(--ink)" : t.fg,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4, lineHeight: 1.25 }}>{label}</div>
      {hint ? <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2, lineHeight: 1.3 }}>{hint}</div> : null}
    </Card>
  );
}

export function StatGrid({ children, min = 76 }: { children: ReactNode; min?: number }) {
  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 23, lineHeight: 1.15 }}>{title}</h1>
        {subtitle ? <div style={{ color: "var(--ink-soft)", marginTop: 3, fontSize: 14 }}>{subtitle}</div> : null}
      </div>
      {action}
    </header>
  );
}

export function Button({ children, variant = "primary", size = "md", type = "button", onClick, disabled, href, style }: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
  style?: CSSProperties;
}) {
  const palette: Record<string, CSSProperties> = {
    // Amber-to-gold gradient with near-black text: the one loud element per screen.
    primary: {
      background: "var(--accent)",
      color: "#1a0f04",
      border: "1px solid transparent",
    },
    secondary: { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--line-strong)" },
    ghost: { background: "transparent", color: "var(--ink-soft)", border: "1px solid transparent" },
    danger: { background: "var(--bad-soft)", color: "var(--bad)", border: "1px solid rgba(255,93,85,0.3)" },
  };

  const sizing = {
    sm: { padding: "7px 12px", fontSize: 13.5, minHeight: 36, borderRadius: 9 },
    md: { padding: "10px 15px", fontSize: 14.5, minHeight: 44, borderRadius: 10 },
    lg: { padding: "13px 18px", fontSize: 15.5, minHeight: 50, borderRadius: 11 },
  }[size];

  const css: CSSProperties = {
    ...palette[variant], ...sizing,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontWeight: 650, letterSpacing: "-0.005em", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1, transition: "opacity 140ms ease, transform 140ms ease",
    width: "100%", maxWidth: "100%", ...style,
  };

  if (href && !disabled) return <a href={href} className="tap" style={css}>{children}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} style={css}>{children}</button>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Card style={{ textAlign: "center", padding: "26px 20px" }}>
      <div style={{ fontSize: 15, fontWeight: 650 }}>{title}</div>
      {body ? <p style={{ color: "var(--ink-soft)", marginTop: 5, fontSize: 14, maxWidth: 400, marginInline: "auto" }}>{body}</p> : null}
      {action ? <div style={{ marginTop: 14, display: "inline-block", minWidth: 180 }}>{action}</div> : null}
    </Card>
  );
}

export function Row({ title, subtitle, right, href, leading }: {
  title: ReactNode; subtitle?: ReactNode; right?: ReactNode; href?: string; leading?: ReactNode;
}) {
  const inner = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", minHeight: 54 }}>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {subtitle ? (
          <div style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {/* Status pills must never be squeezed: they are nowrap, so a flex shrink
          pushes their content straight out past the clipped card edge. */}
      {right ? (
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end",
          gap: 6,
          // Two pills plus a long name do not fit a narrow phone in one line;
          // wrapping keeps them on screen instead of pushing the row off it.
          flexWrap: "wrap", maxWidth: "52%",
        }}>{right}</div>
      ) : null}
    </div>
  );
  return href ? <a href={href} className="tap" style={{ display: "block" }}>{inner}</a> : inner;
}

export function List({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
      {/* minmax(0, 1fr), not the default. A grid item's min-width is `auto`,
          meaning it refuses to shrink below its content — so a row with a long
          name and two status pills grows past the card and off the screen
          instead of the name ellipsising. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" }}>{children}</div>
    </div>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: "var(--line)" }} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "22px 0 8px" }}>
      <h2 style={{ fontSize: 13, fontWeight: 650, color: "var(--ink-soft)", letterSpacing: "0.01em" }}>
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Maintenance Health — explicitly not a claim about mechanical condition. */
export function HealthRing({ score, band }: { score: number; band: string }) {
  const tone = STATUS_TONE[band] ?? "neutral";
  const color = TONE_VARS[tone].fg;
  const circumference = 2 * Math.PI * 42;
  return (
    <div style={{ position: "relative", width: 108, height: 108, flexShrink: 0 }}>
      <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
        <circle cx="54" cy="54" r="42" fill="none" stroke="var(--surface-2)" strokeWidth="9" />
        <circle
          cx="54" cy="54" r="42" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          transform="rotate(-90 54 54)"
          style={{ filter: `drop-shadow(0 0 7px ${color}55)` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 750, letterSpacing: "-0.035em", color }}>{score}</div>
      </div>
    </div>
  );
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Date plus time of day, for anything with an appointment attached.
 *
 * A visit at 07:00 and one at 17:00 are very different plans, so a screen that
 * shows only the date is asking someone to guess — or to ring and ask.
 *
 * The timezone must be passed in, and it is the restaurant's, not the
 * reader's. These strings are rendered on the server, where the local zone is
 * UTC — so a two o'clock visit silently displayed as six o'clock. It is also
 * the right answer regardless: a visit happens at the restaurant's wall clock,
 * whoever is looking and from wherever.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone?: string,
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const zone = timeZone ? { timeZone } : {};
  return [
    date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...zone }),
    date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", ...zone }),
  ].join(" · ");
}

export function relativeDays(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

/**
 * A collapsible group — the units inside a restaurant's area, say. Built on
 * native <details> so it works before hydration and stays keyboard- and
 * screen-reader-navigable without any state of our own.
 */
export function Disclosure({ title, meta, right, defaultOpen = false, children }: {
  title: ReactNode; meta?: ReactNode; right?: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="disclosure" style={{ marginBottom: 10 }}>
      <summary
        className="tap"
        style={{
          display: "flex", alignItems: "center", gap: 12, listStyle: "none", cursor: "pointer",
          padding: "14px 16px", minHeight: 60,
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)",
        }}
      >
        <svg className="disclosure-caret" width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
             style={{ flexShrink: 0, color: "var(--accent)" }} aria-hidden>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 15 }}>{title}</div>
          {meta ? <div style={{ color: "var(--ink-soft)", fontSize: 13.5, marginTop: 2 }}>{meta}</div> : null}
        </div>
        {right ? (
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end",
          gap: 6,
          // Two pills plus a long name do not fit a narrow phone in one line;
          // wrapping keeps them on screen instead of pushing the row off it.
          flexWrap: "wrap", maxWidth: "52%",
        }}>{right}</div>
      ) : null}
      </summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  );
}
