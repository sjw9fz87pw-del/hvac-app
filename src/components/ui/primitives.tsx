/**
 * The design system.
 *
 * Rounded cards, generous spacing, one accent, four status colors. Every
 * interactive element clears a 44px touch target because this is used one-handed
 * on a phone in a kitchen.
 */
import type { CSSProperties, ReactNode } from "react";

type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "accent";

const TONE_VARS: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: "var(--ink-soft)", bg: "var(--canvas)" },
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

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE_VARS[tone];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: t.bg, color: t.fg,
        borderRadius: 999, padding: "3px 10px",
        fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap",
      }}
    >
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
      <div style={{ fontSize: 12.5, color: "var(--ink-faint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 680, letterSpacing: "-0.03em", marginTop: 6, color: tone === "neutral" ? "var(--ink)" : t.fg }}>
        {value}
      </div>
      {hint ? <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>{hint}</div> : null}
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
    <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
      <div>
        <h1 style={{ fontSize: 26, lineHeight: 1.15 }}>{title}</h1>
        {subtitle ? <div style={{ color: "var(--ink-soft)", marginTop: 4, fontSize: 14.5 }}>{subtitle}</div> : null}
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
  const palette = {
    primary: { background: "var(--accent)", color: "#fff", border: "1px solid transparent" },
    secondary: { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)" },
    ghost: { background: "transparent", color: "var(--ink-soft)", border: "1px solid transparent" },
    danger: { background: "var(--bad-soft)", color: "var(--bad)", border: "1px solid transparent" },
  }[variant];

  const sizing = { sm: { padding: "8px 12px", fontSize: 13.5, minHeight: 38 }, md: { padding: "11px 16px", fontSize: 14.5, minHeight: 44 }, lg: { padding: "15px 20px", fontSize: 16, minHeight: 52 } }[size];

  const css: CSSProperties = {
    ...palette, ...sizing,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "transform 120ms ease, opacity 120ms ease",
    width: "100%", maxWidth: "100%", ...style,
  };

  if (href && !disabled) return <a href={href} className="tap" style={css}>{children}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} style={css}>{children}</button>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Card style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ fontSize: 16, fontWeight: 640 }}>{title}</div>
      {body ? <p style={{ color: "var(--ink-soft)", marginTop: 6, fontSize: 14.5, maxWidth: 420, marginInline: "auto" }}>{body}</p> : null}
      {action ? <div style={{ marginTop: 16, display: "inline-block", minWidth: 200 }}>{action}</div> : null}
    </Card>
  );
}

export function Row({ title, subtitle, right, href, leading }: {
  title: ReactNode; subtitle?: ReactNode; right?: ReactNode; href?: string; leading?: ReactNode;
}) {
  const inner = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", minHeight: 60 }}>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {subtitle ? <div style={{ color: "var(--ink-soft)", fontSize: 13.5, marginTop: 1 }}>{subtitle}</div> : null}
      </div>
      {right}
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

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "26px 0 10px" }}>
      <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-faint)", fontWeight: 660 }}>{children}</h2>
      {action}
    </div>
  );
}

/** Maintenance Health - explicitly not a claim about mechanical condition. */
export function HealthRing({ score, band }: { score: number; band: string }) {
  const tone = STATUS_TONE[band] ?? "neutral";
  const color = TONE_VARS[tone].fg;
  const circumference = 2 * Math.PI * 42;
  return (
    <div style={{ position: "relative", width: 108, height: 108, flexShrink: 0 }}>
      <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
        <circle cx="54" cy="54" r="42" fill="none" stroke="var(--line)" strokeWidth="9" />
        <circle
          cx="54" cy="54" r="42" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          transform="rotate(-90 54 54)"
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-0.03em", color }}>{score}</div>
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
