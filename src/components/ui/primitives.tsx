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
        padding: 18,
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
        borderRadius: 999, padding: "4px 11px 4px 8px",
        fontSize: 12, fontWeight: 700, letterSpacing: "0.01em", whiteSpace: "nowrap",
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
    <Card style={{ padding: 16 }}>
      <div className="kicker">{label}</div>
      <div
        style={{
          fontSize: 31, fontWeight: 750, letterSpacing: "-0.035em", marginTop: 7, lineHeight: 1,
          color: tone === "neutral" ? "var(--ink)" : t.fg,
        }}
      >
        {value}
      </div>
      {hint ? <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>{hint}</div> : null}
    </Card>
  );
}

export function StatGrid({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
      <div>
        <h1 style={{ fontSize: 28, lineHeight: 1.1 }}>{title}</h1>
        {subtitle ? <div style={{ color: "var(--ink-soft)", marginTop: 6, fontSize: 14.5 }}>{subtitle}</div> : null}
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
      background: "linear-gradient(180deg, var(--accent-2), var(--accent))",
      color: "#1a0f04",
      border: "1px solid transparent",
      boxShadow: disabled ? "none" : "0 6px 20px rgba(255, 138, 31, 0.24)",
    },
    secondary: { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--line-strong)" },
    ghost: { background: "transparent", color: "var(--ink-soft)", border: "1px solid transparent" },
    danger: { background: "var(--bad-soft)", color: "var(--bad)", border: "1px solid rgba(255,93,85,0.3)" },
  };

  const sizing = {
    sm: { padding: "8px 13px", fontSize: 13.5, minHeight: 38, borderRadius: 11 },
    md: { padding: "11px 16px", fontSize: 14.5, minHeight: 46, borderRadius: 13 },
    lg: { padding: "15px 20px", fontSize: 16, minHeight: 54, borderRadius: 14 },
  }[size];

  const css: CSSProperties = {
    ...palette[variant], ...sizing,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontWeight: 700, letterSpacing: "-0.01em", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1, transition: "opacity 140ms ease, transform 140ms ease",
    width: "100%", maxWidth: "100%", ...style,
  };

  if (href && !disabled) return <a href={href} className="tap" style={css}>{children}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} style={css}>{children}</button>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Card style={{ textAlign: "center", padding: "42px 24px" }}>
      <div style={{ fontSize: 16.5, fontWeight: 700 }}>{title}</div>
      {body ? <p style={{ color: "var(--ink-soft)", marginTop: 7, fontSize: 14.5, maxWidth: 420, marginInline: "auto" }}>{body}</p> : null}
      {action ? <div style={{ marginTop: 18, display: "inline-block", minWidth: 200 }}>{action}</div> : null}
    </Card>
  );
}

export function Row({ title, subtitle, right, href, leading }: {
  title: ReactNode; subtitle?: ReactNode; right?: ReactNode; href?: string; leading?: ReactNode;
}) {
  const inner = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", minHeight: 62 }}>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {subtitle ? (
          <div style={{ color: "var(--ink-soft)", fontSize: 13.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {/* Status pills must never be squeezed: they are nowrap, so a flex shrink
          pushes their content straight out past the clipped card edge. */}
      {right ? <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>{right}</div> : null}
    </div>
  );
  return href ? <a href={href} className="tap" style={{ display: "block" }}>{inner}</a> : inner;
}

export function List({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
      <div style={{ display: "grid" }}>{children}</div>
    </div>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: "var(--line)" }} />;
}

/** Kicker-style section headings, with the accent rule the reference app uses. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "28px 0 11px" }}>
      <h2 className="kicker" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--accent)", flexShrink: 0 }} />
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
