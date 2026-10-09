"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui/primitives";
import { zonedParts, zonedInstant } from "@/lib/time/zone";

const field: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 44,
};
const label: React.CSSProperties = {
  display: "block", fontSize: 12.5, fontWeight: 620, color: "var(--ink-soft)", marginBottom: 5,
};

export function ManageVisit({ visitId, scheduledFor, timezone, technicianId, technicians, anyDone }: {
  visitId: string;
  scheduledFor: string;
  timezone: string;
  technicianId: string | null;
  technicians: { id: string; name: string }[];
  anyDone: boolean;
}) {
  const router = useRouter();
  const start = zonedParts(scheduledFor, timezone);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [tech, setTech] = useState(technicianId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const changed = date !== start.date || time !== start.time || tech !== (technicianId ?? "");

  async function send(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    setError(null);
    setSaved(false);
    const response = await fetch(`/api/v1/visits/${visitId}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "That did not save");
      return false;
    }
    router.refresh();
    return true;
  }

  async function save() {
    const at = zonedInstant(date, time, timezone);
    if (!at) { setError("That is not a valid date and time"); return; }
    const ok = await send({
      ...(date !== start.date || time !== start.time ? { scheduledFor: at.toISOString() } : {}),
      ...(tech !== (technicianId ?? "") ? { technicianId: tech || null } : {}),
    }, "save");
    if (ok) setSaved(true);
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 650 }}>Manage visit</div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}>
          <label style={label} htmlFor="visit-date">Date</label>
          <input id="visit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
        </div>
        <div style={{ flex: "1 1 110px" }}>
          <label style={label} htmlFor="visit-time">Time</label>
          <input id="visit-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={field} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={label} htmlFor="visit-tech">Technician</label>
        <select id="visit-tech" value={tech} onChange={(e) => setTech(e.target.value)} style={field}>
          <option value="">Not assigned</option>
          {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }} role="alert">{error}</p> : null}
      {saved && !changed ? <p style={{ color: "var(--good)", fontSize: 13.5, marginTop: 10 }}>Saved</p> : null}

      <div style={{ marginTop: 12 }}>
        <Button onClick={save} disabled={!changed || busy !== null}>{busy === "save" ? "Saving…" : "Save changes"}</Button>
      </div>

      {!anyDone ? (
        confirmCancel ? (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 640, fontSize: 14 }}>Cancel this visit?</div>
            <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 4 }}>
              Its units go back to needing a visit.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <Button variant="danger" disabled={busy !== null} onClick={() => send({ cancel: true }, "cancel")}>
                  {busy === "cancel" ? "Cancelling…" : "Cancel visit"}
                </Button>
              </div>
              <div style={{ flex: 1 }}>
                <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirmCancel(false)}>Keep</Button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button" onClick={() => setConfirmCancel(true)}
            style={{
              marginTop: 8, background: "none", border: "none", cursor: "pointer",
              color: "var(--bad)", fontSize: 13.5, fontWeight: 650, padding: "8px 2px", minHeight: 40,
            }}
          >
            Cancel visit
          </button>
        )
      ) : null}
    </Card>
  );
}
