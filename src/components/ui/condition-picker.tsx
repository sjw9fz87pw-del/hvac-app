"use client";

import { CONDITIONS, type Condition } from "./condition";

/**
 * The five conditions as one row of taps.
 *
 * Deliberately not a dropdown: this is used standing in front of a fridge, and
 * a dropdown is two taps and a scroll where this is one tap.
 */
export function ConditionPicker({ value, onChange, disabled }: {
  value: Condition | null;
  onChange: (next: Condition) => void;
  disabled?: boolean;
}) {
  const tone = (t: string, on: boolean) => {
    if (!on) return { bg: "var(--surface-2)", fg: "var(--ink-soft)", border: "var(--line)" };
    if (t === "good") return { bg: "var(--good)", fg: "#06210f", border: "transparent" };
    if (t === "warn") return { bg: "var(--warn)", fg: "#231502", border: "transparent" };
    if (t === "bad") return { bg: "var(--bad)", fg: "#2a0b0b", border: "transparent" };
    return { bg: "var(--ink-faint)", fg: "var(--canvas)", border: "transparent" };
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {CONDITIONS.map((c) => {
        const on = c.value === value;
        const t = tone(c.tone, on);
        return (
          <button
            key={c.value} type="button" disabled={disabled}
            onClick={() => onChange(c.value)} aria-pressed={on} title={c.hint}
            style={{
              padding: "10px 15px", borderRadius: 999, fontSize: 14, fontWeight: 650,
              minHeight: 42, cursor: disabled ? "wait" : "pointer",
              background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
