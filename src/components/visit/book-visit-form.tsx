"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { zonedInstant, zonedToday } from "@/lib/time/zone";
import { BOOKING_HORIZON_DAYS } from "@/lib/time/calendar";
import { ChoicePill, SLOTS, fieldStyle, labelStyle, slotLabel } from "./choices";

/**
 * Book a visit.
 *
 * The engine decides what a visit *should* cover, but the person booking it
 * often knows better: a visit gets made for reasons no schedule can see. So
 * coverage is a choice — what is due, or everything in the building — and
 * "nothing is due" never blocks a booking.
 *
 * Used by a restaurant's own page and by the schedule, so a visit is booked
 * the same way from either.
 */
export function BookVisitForm({
  locationId, timezone, technicians, defaultTechnicianId, initialDate, initialTime = "09:00",
  counts, allBooked, submitLabel = "Book visit", busyLabel = "Booking…", onBooked,
}: {
  locationId: string;
  /** Times are the restaurant's, not the phone's. */
  timezone: string;
  /** Who can be sent. A visit nobody is assigned to shows on every technician's list. */
  technicians: { id: string; name: string }[];
  defaultTechnicianId: string | null;
  initialDate: string;
  initialTime?: string;
  /** Units a visit on that day would pick up: work due by then, and all work. Never counts work already booked. */
  counts: (date: string) => { due: number; all: number };
  /** Every unit's work is on a booked visit, so there is nothing left to book. */
  allBooked: boolean;
  submitLabel?: string;
  busyLabel?: string;
  onBooked: (booked: { id: string; date: string; time: string }) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const { due, all } = counts(date);
  // Nothing due is the normal state between services, so default to the option
  // that can actually produce a visit rather than to a dead end.
  const [include, setInclude] = useState<"due" | "all">(() => (counts(initialDate).due > 0 ? "due" : "all"));
  const [technicianId, setTechnicianId] = useState(defaultTechnicianId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const covers = include === "due" ? due : all;
  const today = zonedToday(timezone);
  const tomorrow = zonedToday(timezone, 1);

  async function book() {
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
      body: JSON.stringify({
        locationId, scheduledFor: at.toISOString(), horizonDays: BOOKING_HORIZON_DAYS, include,
        technicianId: technicianId || null,
      }),
    });
    setBusy(false);
    if (response.ok) {
      const { id } = await response.json().catch(() => ({ id: "" }));
      onBooked({ id, date, time });
      return;
    }
    setError((await response.json().catch(() => ({}))).error ?? "Could not book the visit");
  }

  return (
    <div>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 2 }}>
        {covers > 0
          ? `${covers} unit${covers === 1 ? "" : "s"}`
          : allBooked
            ? "Every unit here is already on a booked visit. Open that visit to change the day or technician."
            : include === "due"
              ? "Nothing is due by then. Choose All units to book a visit anyway."
              : "No units with work set up here yet."}
      </p>

      <div style={{ marginTop: 12 }}>
        <span style={labelStyle}>Include</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <ChoicePill on={include === "due"} onClick={() => setInclude("due")}>Due · {due}</ChoicePill>
          <ChoicePill on={include === "all"} onClick={() => setInclude("all")}>All units · {all}</ChoicePill>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}>
          <label style={labelStyle} htmlFor={`book-date-${locationId}`}>Date</label>
          <input id={`book-date-${locationId}`} type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ ...fieldStyle, width: "100%" }} />
        </div>
        <div style={{ flex: "1 1 110px" }}>
          <label style={labelStyle} htmlFor={`book-time-${locationId}`}>Time</label>
          <input id={`book-time-${locationId}`} type="time" value={time} onChange={(e) => setTime(e.target.value)}
            style={{ ...fieldStyle, width: "100%" }} />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <ChoicePill on={date === today} onClick={() => setDate(today)}>Today</ChoicePill>
        <ChoicePill on={date === tomorrow} onClick={() => setDate(tomorrow)}>Tomorrow</ChoicePill>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {SLOTS.map((slot) => (
          <ChoicePill key={slot} on={slot === time} onClick={() => setTime(slot)}>{slotLabel(slot)}</ChoicePill>
        ))}
      </div>

      {technicians.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <label style={labelStyle} htmlFor={`book-tech-${locationId}`}>Technician</label>
          <select
            id={`book-tech-${locationId}`} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}
            style={{ ...fieldStyle, width: "100%" }}
          >
            <option value="">Anyone (not assigned)</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      ) : null}

      <div style={{ marginTop: 14, maxWidth: 220 }}>
        <Button onClick={book} disabled={busy || covers === 0}>{busy ? busyLabel : submitLabel}</Button>
      </div>

      {error ? <div role="alert" style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }}>{error}</div> : null}
    </div>
  );
}
