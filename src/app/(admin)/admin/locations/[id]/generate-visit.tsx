"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui/primitives";

const fieldStyle: React.CSSProperties = {
  padding: "11px 13px", borderRadius: 11, border: "1px solid var(--line)",
  background: "var(--surface-2)", minHeight: 44,
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12.5, fontWeight: 620,
  color: "var(--ink-soft)", marginBottom: 5,
};

/** The times a restaurant visit actually happens, one tap each. */
const SLOTS = ["07:00", "09:00", "11:00", "14:00"];

function slotLabel(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/**
 * Visits are generated from what is actually due, not hand-picked. The operator
 * chooses when; the engine decides which assets it covers.
 */
export function GenerateVisit({ locationId, dueCount }: { locationId: string; dueCount: number }) {
  const router = useRouter();
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    // Built from the local date and time, so the visit lands at the hour the
    // person picked in their own timezone rather than in UTC.
    const at = new Date(`${date}T${time}:00`);
    if (Number.isNaN(at.getTime())) {
      setBusy(false);
      setError("That is not a valid date and time");
      return;
    }

    const response = await fetch("/api/v1/visits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locationId, scheduledFor: at.toISOString(), horizonDays: 14 }),
    });
    setBusy(false);
    if (response.ok) { router.refresh(); return; }
    setError((await response.json().catch(() => ({}))).error ?? "Could not generate a visit");
  }

  return (
    <Card>
      <div style={{ fontWeight: 640 }}>Schedule a visit</div>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 3 }}>
        {dueCount > 0
          ? `${dueCount} asset${dueCount === 1 ? " is" : "s are"} due or overdue. A visit covers everything due within 14 days, grouped by area.`
          : "Nothing is currently due here."}
      </p>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle} htmlFor="visit-date">Date</label>
          <input id="visit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="visit-time">Time</label>
          <input id="visit-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={fieldStyle} />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {SLOTS.map((slot) => {
          const on = slot === time;
          return (
            <button
              key={slot} type="button" onClick={() => setTime(slot)} aria-pressed={on}
              style={{
                padding: "8px 13px", borderRadius: 999, fontSize: 13.5, fontWeight: 620,
                minHeight: 38, cursor: "pointer",
                border: `1px solid ${on ? "transparent" : "var(--line)"}`,
                background: on ? "var(--accent)" : "var(--surface-2)",
                color: on ? "#1a0f04" : "var(--ink-soft)",
              }}
            >
              {slotLabel(slot)}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 14, maxWidth: 200 }}>
        <Button onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate visit"}</Button>
      </div>

      {error ? <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }}>{error}</div> : null}
    </Card>
  );
}
