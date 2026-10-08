"use client";

export const INTERVAL_PRESETS = [30, 60, 90, 180, 365];

export function presetLabel(n: number): string {
  if (n === 365) return "1 year";
  if (n % 30 === 0) return `${n / 30} month${n === 30 ? "" : "s"}`;
  return `${n} days`;
}

/** Common intervals one tap away, and any number of days for the rest. */
export function IntervalPicker({ value, onChange }: { value: string; onChange: (days: string) => void }) {
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {INTERVAL_PRESETS.map((n) => {
          const on = String(n) === value;
          return (
            <button
              key={n} type="button" onClick={() => onChange(String(n))} aria-pressed={on}
              style={{
                padding: "8px 13px", borderRadius: 999, fontSize: 13.5, fontWeight: 600,
                minHeight: 38, cursor: "pointer",
                border: `1px solid ${on ? "transparent" : "var(--line)"}`,
                background: on ? "var(--accent)" : "var(--surface-2)",
                color: on ? "#1a0f04" : "var(--ink-soft)",
              }}
            >
              {presetLabel(n)}
            </button>
          );
        })}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--ink-soft)" }}>
        Every
        <input
          type="number" min={1} max={3650} inputMode="numeric" value={value}
          onChange={(e) => onChange(e.target.value)} aria-label="Days between services"
          style={{
            width: 96, padding: "10px 12px", borderRadius: 10,
            border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 44,
          }}
        />
        days
      </label>
    </div>
  );
}

/** A usable interval, or null. */
export function parseDays(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : null;
}
