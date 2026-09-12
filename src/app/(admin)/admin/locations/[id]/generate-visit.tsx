"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui/primitives";

/**
 * Visits are generated from what is actually due, not hand-picked. The operator
 * chooses a date; the engine decides which assets it covers.
 */
export function GenerateVisit({ locationId, dueCount }: { locationId: string; dueCount: number }) {
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/visits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locationId, scheduledFor: new Date(`${date}T09:00:00`).toISOString(), horizonDays: 14 }),
    });
    setBusy(false);
    if (response.ok) { window.location.reload(); return; }
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
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: "11px 13px", borderRadius: 11, border: "1px solid var(--line)", background: "var(--canvas)", minHeight: 44 }}
        />
        <div style={{ width: 170 }}>
          <Button onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate visit"}</Button>
        </div>
      </div>
      {error ? <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }}>{error}</div> : null}
    </Card>
  );
}
