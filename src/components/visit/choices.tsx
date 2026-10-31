"use client";

/** Shared pieces of the booking and rescheduling forms. */

export const fieldStyle: React.CSSProperties = {
  padding: "11px 13px", borderRadius: 11, border: "1px solid var(--line)",
  background: "var(--surface-2)", minHeight: 44,
};

export const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12.5, fontWeight: 620,
  color: "var(--ink-soft)", marginBottom: 5,
};

/** The times a restaurant visit actually happens, one tap each. */
export const SLOTS = ["07:00", "09:00", "11:00", "14:00"];

export function slotLabel(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** Shared look for the pill choices: time slots, days and coverage alike. */
export function ChoicePill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      style={{
        padding: "8px 13px", borderRadius: 999, fontSize: 13.5, fontWeight: 620,
        minHeight: 38, cursor: "pointer",
        border: `1px solid ${on ? "transparent" : "var(--line)"}`,
        background: on ? "var(--accent)" : "var(--surface-2)",
        color: on ? "var(--on-accent)" : "var(--ink-soft)",
      }}
    >
      {children}
    </button>
  );
}
