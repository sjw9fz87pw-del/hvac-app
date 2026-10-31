"use client";

import { useState } from "react";
import { Button, StatusPill, List, Row, Divider, EmptyState, Pill } from "@/components/ui/primitives";
import { BookVisitForm } from "@/components/visit/book-visit-form";
import { ChoicePill, SLOTS, fieldStyle, labelStyle, slotLabel } from "@/components/visit/choices";
import { zonedInstant } from "@/lib/time/zone";
import {
  BOOKING_HORIZON_DAYS, addDays, clockLabel, dayTitle, durationLabel, minutesOf, shortDay,
} from "@/lib/time/calendar";
import type { BookableLocation, CalendarVisit, UnfinishedTask } from "./types";

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", fontSize: 14.5, borderTop: "1px solid var(--line)" }}>
      <div style={{ color: "var(--ink-faint)", width: 96, flexShrink: 0 }}>{label}</div>
      <div style={{ fontWeight: 560, minWidth: 0, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

export function timeRange(visit: CalendarVisit): string {
  const start = minutesOf(visit.time);
  return visit.minutes > 0 ? `${clockLabel(start)} – ${clockLabel(start + visit.minutes)}` : clockLabel(start);
}

/**
 * One visit, opened over the calendar: when, who and how far along, and —
 * for the office — moving it, handing it to someone else or calling it off,
 * without leaving the schedule.
 */
export function VisitDetails({ visit, today, technicians, canManage, onSaved, onCancelled }: {
  visit: CalendarVisit;
  today: string;
  technicians: { id: string; name: string }[];
  canManage: boolean;
  onSaved: (change: { date: string; time: string; technician: { id: string; name: string } | null }) => void;
  onCancelled: () => void;
}) {
  const [date, setDate] = useState(visit.date);
  const [time, setTime] = useState(visit.time);
  const [tech, setTech] = useState(visit.technician?.id ?? "");
  const [busy, setBusy] = useState<"save" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const editable = canManage && visit.status !== "COMPLETED";
  const moved = date !== visit.date || time !== visit.time;
  const changed = moved || tech !== (visit.technician?.id ?? "");

  async function send(body: Record<string, unknown>, tag: "save" | "cancel") {
    setBusy(tag);
    setError(null);
    const response = await fetch(`/api/v1/visits/${visit.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(null);
    if (!response.ok) {
      setError((await response.json().catch(() => ({}))).error ?? "That did not save");
      return false;
    }
    return true;
  }

  async function save() {
    const at = zonedInstant(date, time, visit.timezone);
    if (!at) { setError("That is not a valid date and time"); return; }
    const ok = await send({
      ...(moved ? { scheduledFor: at.toISOString() } : {}),
      ...(tech !== (visit.technician?.id ?? "") ? { technicianId: tech || null } : {}),
    }, "save");
    if (ok) onSaved({ date, time, technician: technicians.find((t) => t.id === tech) ?? null });
  }

  return (
    <div>
      <StatusPill status={visit.status} />

      <div style={{ marginTop: 12 }}>
        <Line label="When">{dayTitle(visit.date)}</Line>
        <Line label="Technician">{visit.technician?.name ?? <span style={{ color: "var(--warn)" }}>Not assigned</span>}</Line>
        <Line label="Units">{visit.done} of {visit.units} done</Line>
        {visit.minutes > 0 ? <Line label="Takes about">{durationLabel(visit.minutes)}</Line> : null}
        <Line label="Group">{visit.organizationName}</Line>
      </div>

      {editable ? (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 650, marginBottom: 10 }}>{visit.status === "MISSED" ? "Book it again" : "Move or reassign"}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px" }}>
              <label style={labelStyle} htmlFor="sheet-visit-date">Date</label>
              <input id="sheet-visit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...fieldStyle, width: "100%" }} />
            </div>
            <div style={{ flex: "1 1 110px" }}>
              <label style={labelStyle} htmlFor="sheet-visit-time">Time</label>
              <input id="sheet-visit-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...fieldStyle, width: "100%" }} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <ChoicePill on={date === today} onClick={() => setDate(today)}>Today</ChoicePill>
            <ChoicePill on={date === addDays(today, 1)} onClick={() => setDate(addDays(today, 1))}>Tomorrow</ChoicePill>
            {addDays(visit.date, 7) > addDays(today, 1) ? (
              <ChoicePill on={date === addDays(visit.date, 7)} onClick={() => setDate(addDays(visit.date, 7))}>A week later</ChoicePill>
            ) : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {SLOTS.map((slot) => <ChoicePill key={slot} on={slot === time} onClick={() => setTime(slot)}>{slotLabel(slot)}</ChoicePill>)}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle} htmlFor="sheet-visit-tech">Technician</label>
            <select id="sheet-visit-tech" value={tech} onChange={(e) => setTech(e.target.value)} style={{ ...fieldStyle, width: "100%" }}>
              <option value="">Not assigned</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {error ? <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }}>{error}</p> : null}

          <div style={{ marginTop: 12 }}>
            <Button onClick={save} disabled={!changed || busy !== null}>{busy === "save" ? "Saving…" : "Save changes"}</Button>
          </div>

          {visit.done === 0 ? (
            confirmCancel ? (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontWeight: 640, fontSize: 14 }}>Cancel this visit?</div>
                <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 4 }}>Its units go back to needing a visit.</p>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <div style={{ flex: 1 }}>
                    <Button variant="danger" disabled={busy !== null}
                      onClick={async () => { if (await send({ cancel: true }, "cancel")) onCancelled(); }}>
                      {busy === "cancel" ? "Cancelling…" : "Cancel visit"}
                    </Button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirmCancel(false)}>Keep</Button>
                  </div>
                </div>
              </div>
            ) : (
              <button type="button" className="text-button" style={{ color: "var(--bad)", marginTop: 6 }} onClick={() => setConfirmCancel(true)}>
                Cancel visit
              </button>
            )
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <Button variant="secondary" href={`/admin/schedule/${visit.id}`}>Open the full visit</Button>
      </div>
    </div>
  );
}

/** What a visit to this restaurant on that day would pick up. */
export function bookingCounts(location: BookableLocation, date: string) {
  const by = addDays(date, BOOKING_HORIZON_DAYS);
  return { due: location.due.filter((d) => d <= by).length, all: location.due.length };
}

/** Book a visit from the schedule: pick the restaurant, then the same form as on its page. */
export function BookPanel({ locations, locationId: initialLocationId, date, time, technicians, defaultTechnicianId, onBooked }: {
  locations: BookableLocation[];
  locationId: string | null;
  date: string;
  time: string;
  technicians: { id: string; name: string }[];
  defaultTechnicianId: string | null;
  onBooked: (booked: { id: string; date: string; time: string }) => void;
}) {
  const [locationId, setLocationId] = useState(initialLocationId ?? "");
  const location = locations.find((l) => l.id === locationId) ?? null;
  const groups = [...new Set(locations.map((l) => l.organizationName))];

  if (locations.length === 0) {
    return <EmptyState title="No restaurants yet" body="Add a restaurant first, then book its visits here." />;
  }

  return (
    <div>
      <label style={labelStyle} htmlFor="book-location">Restaurant</label>
      <select id="book-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ ...fieldStyle, width: "100%" }}>
        <option value="">Choose a restaurant</option>
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {locations.filter((l) => l.organizationName === group).map((l) => {
              const { due } = bookingCounts(l, date);
              return <option key={l.id} value={l.id}>{l.name}{due ? ` · ${due} due` : ""}</option>;
            })}
          </optgroup>
        ))}
      </select>

      {location ? (
        <div style={{ marginTop: 12 }}>
          <BookVisitForm
            key={location.id}
            locationId={location.id}
            timezone={location.timezone}
            technicians={technicians}
            defaultTechnicianId={defaultTechnicianId}
            initialDate={date}
            initialTime={time}
            counts={(day) => bookingCounts(location, day)}
            allBooked={location.hasBooked && location.due.length === 0}
            onBooked={onBooked}
          />
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 10 }}>
          The visit picks up the units with work due, or every unit if you choose.
        </p>
      )}
    </div>
  );
}

export function MissedList({ visits, onOpen }: { visits: CalendarVisit[]; onOpen: (visit: CalendarVisit) => void }) {
  if (visits.length === 0) return <EmptyState title="No missed visits" body="Every booked visit so far has been done." />;
  return (
    <>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 10 }}>
        Booked for a day that has passed and not finished. Open one to book it again or call it off.
      </p>
      <List>
        {visits.map((visit, index) => (
          <div key={visit.id}>
            {index > 0 ? <Divider /> : null}
            <button type="button" className="tap sheet-row" onClick={() => onOpen(visit)}>
              <Row
                title={visit.locationName}
                subtitle={`${shortDay(visit.date)} · ${clockLabel(minutesOf(visit.time))} · ${visit.technician?.name ?? "not assigned"} · ${visit.done}/${visit.units} done`}
                right={<Pill tone="bad">Missed</Pill>}
              />
            </button>
          </div>
        ))}
      </List>
    </>
  );
}

export interface OverdueRow { location: BookableLocation; units: number; since: string }

export function OverdueList({ rows, canManage, onBook }: { rows: OverdueRow[]; canManage: boolean; onBook: (locationId: string) => void }) {
  if (rows.length === 0) return <EmptyState title="Nothing overdue" body="All work that has come due is done or booked." />;
  return (
    <>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 10 }}>
        Work past its due date that is not on any visit yet.
      </p>
      <List>
        {rows.map((row, index) => (
          <div key={row.location.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              title={row.location.name}
              subtitle={`${row.units} unit${row.units === 1 ? "" : "s"} · due since ${shortDay(row.since)}`}
              right={canManage
                ? <Button size="sm" style={{ width: "auto" }} onClick={() => onBook(row.location.id)}>Book</Button>
                : <Pill tone="bad">Overdue</Pill>}
            />
          </div>
        ))}
      </List>
    </>
  );
}

export function UnfinishedList({ tasks }: { tasks: UnfinishedTask[] }) {
  if (tasks.length === 0) return <EmptyState title="Nothing left unfinished" />;
  return (
    <>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 10 }}>
        Started on a visit more than a day ago, and never completed with photos and a checklist.
      </p>
      <List>
        {tasks.map((task, index) => (
          <div key={task.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              href={`/admin/schedule/${task.visitId}`}
              title={task.unitName}
              subtitle={`${task.locationName} · started by ${task.technicianName ?? "unknown"}`}
              right={<Pill tone="warn">Open</Pill>}
            />
          </div>
        ))}
      </List>
    </>
  );
}
