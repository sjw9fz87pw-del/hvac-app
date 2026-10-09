"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui/primitives";
import { zonedInstant, zonedToday } from "@/lib/time/zone";

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

/** Shared look for the pill choices: time slots and coverage alike. */
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      style={{
        padding: "8px 13px", borderRadius: 999, fontSize: 13.5, fontWeight: 620,
        minHeight: 38, cursor: "pointer",
        border: `1px solid ${on ? "transparent" : "var(--line)"}`,
        background: on ? "var(--accent)" : "var(--surface-2)",
        color: on ? "#1a0f04" : "var(--ink-soft)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Book a visit.
 *
 * The engine decides what a visit *should* cover, but the person booking it
 * often knows better: a visit gets made for reasons no schedule can see. So
 * coverage is a choice — what is due, or everything in the building — and
 * "nothing is due" never blocks a booking.
 */
export function GenerateVisit({ locationId, dueCount, unitCount, allBooked, timezone, technicians, defaultTechnicianId }: {
  locationId: string;
  /** Units with due work that is not already on a booked visit. */
  dueCount: number;
  /** Units with any work that is not already on a booked visit. */
  unitCount: number;
  /** Every unit's work is on a booked visit, so there is nothing left to book. */
  allBooked: boolean;
  /** Times are the restaurant's, not the phone's. */
  timezone: string;
  /** Who can be sent. A visit nobody is assigned to shows on every technician's list. */
  technicians: { id: string; name: string }[];
  defaultTechnicianId: string | null;
}) {
  const router = useRouter();
  // Tomorrow where the restaurant is — not tomorrow in UTC, which is already
  // the day after by evening in New York.
  const [date, setDate] = useState(() => zonedToday(timezone, 1));
  const [time, setTime] = useState("09:00");
  // Nothing due is the normal state between services, so default to the option
  // that can actually produce a visit rather than to a dead end.
  const [include, setInclude] = useState<"due" | "all">(dueCount > 0 ? "due" : "all");
  const [technicianId, setTechnicianId] = useState(defaultTechnicianId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const covers = include === "due" ? dueCount : unitCount;

  async function generate() {
    setBusy(true);
    setError(null);
    const at = zonedInstant(date, time, timezone);
    if (!at) {
      setBusy(false);
      setError("That is not a valid date and time");
      return;
    }

    const response = await fetch("/api/v1/visits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locationId, scheduledFor: at.toISOString(), horizonDays: 14, include, technicianId: technicianId || null }),
    });
    setBusy(false);
    if (response.ok) { router.refresh(); return; }
    setError((await response.json().catch(() => ({}))).error ?? "Could not generate a visit");
  }

  return (
    <Card>
      <div style={{ fontWeight: 640 }}>Schedule a visit</div>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 2 }}>
        {covers > 0
          ? `${covers} unit${covers === 1 ? "" : "s"}`
          : allBooked
            ? "Every unit here is already on a booked visit. Open it above to change the day or technician."
            : include === "due"
              ? "Nothing is due. Choose All units to book a visit anyway."
              : "No units with work set up here yet."}
      </p>

      <div style={{ marginTop: 12 }}>
        <span style={labelStyle}>Include</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Pill on={include === "due"} onClick={() => setInclude("due")}>
            Due · {dueCount}
          </Pill>
          <Pill on={include === "all"} onClick={() => setInclude("all")}>
            All units · {unitCount}
          </Pill>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
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
        {SLOTS.map((slot) => (
          <Pill key={slot} on={slot === time} onClick={() => setTime(slot)}>{slotLabel(slot)}</Pill>
        ))}
      </div>

      {technicians.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <label style={labelStyle} htmlFor="visit-technician">Technician</label>
          <select
            id="visit-technician" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}
            style={{ ...fieldStyle, width: "100%" }}
          >
            <option value="">Anyone (not assigned)</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      ) : null}

      <div style={{ marginTop: 14, maxWidth: 200 }}>
        <Button onClick={generate} disabled={busy || covers === 0}>
          {busy ? "Generating…" : "Generate visit"}
        </Button>
      </div>

      {error ? <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }}>{error}</div> : null}
    </Card>
  );
}
