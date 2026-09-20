"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Pill, StatusPill, formatDate } from "@/components/ui/primitives";

export interface ScheduleRow {
  id: string;
  serviceTypeName: string;
  intervalDays: number;
  intervalSource: string;
  nextDueAt: string;
  lastServiceAt: string | null;
  status: string;
  paused: boolean;
}

const field: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
};

const label: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 620, color: "var(--ink-soft)", marginBottom: 6,
};

/** Common cadences, so the usual answer is one tap rather than typing. */
const PRESETS = [30, 60, 90, 180, 365];

function toDateInput(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function EditSchedule({ schedule, canEdit }: { schedule: ScheduleRow; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(String(schedule.intervalDays));
  const [due, setDue] = useState(toDateInput(schedule.nextDueAt));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inherited = schedule.intervalSource !== "ASSET";

  async function save(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    setError(null);
    const response = await fetch(`/api/v1/schedules/${schedule.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "That did not save");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 15 }}>{schedule.serviceTypeName}</div>
          <div style={{ color: "var(--ink-soft)", fontSize: 13.5, marginTop: 3 }}>
            Every {schedule.intervalDays} days · next {formatDate(schedule.nextDueAt)}
          </div>
          <div style={{ color: "var(--ink-faint)", fontSize: 12.5, marginTop: 2 }}>
            {inherited ? `From the ${schedule.intervalSource.toLowerCase()} default` : "Set for this unit"}
            {schedule.lastServiceAt ? ` · last done ${formatDate(schedule.lastServiceAt)}` : " · never serviced"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <StatusPill status={schedule.status} />
        </div>
      </div>

      {canEdit && !open ? (
        <button
          type="button" onClick={() => setOpen(true)}
          style={{
            marginTop: 10, background: "none", border: "none", cursor: "pointer",
            color: "var(--accent)", fontSize: 13.5, fontWeight: 650, padding: "8px 2px", minHeight: 40,
          }}
        >
          Change schedule
        </button>
      ) : null}

      {open ? (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <span style={label}>How often</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {PRESETS.map((n) => {
              const on = String(n) === days;
              return (
                <button
                  key={n} type="button" onClick={() => setDays(String(n))} aria-pressed={on}
                  style={{
                    padding: "9px 14px", borderRadius: 999, fontSize: 14, fontWeight: 600,
                    minHeight: 40, cursor: "pointer",
                    border: `1px solid ${on ? "transparent" : "var(--line)"}`,
                    background: on ? "var(--accent)" : "var(--surface-2)",
                    color: on ? "#1a0f04" : "var(--ink-soft)",
                  }}
                >
                  {n === 365 ? "1 year" : n % 30 === 0 ? `${n / 30} month${n === 30 ? "" : "s"}` : `${n} days`}
                </button>
              );
            })}
          </div>
          <input
            style={field} type="number" min={1} max={3650} inputMode="numeric"
            value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days between services"
          />
          <p style={{ color: "var(--ink-faint)", fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
            Counted from when the work was last done, so the next visit moves with it.
          </p>

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor={`due-${schedule.id}`}>Next due</label>
            <input id={`due-${schedule.id}`} style={field} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <p style={{ color: "var(--ink-faint)", fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
              Moves this visit only. The cadence above stays as it is.
            </p>
          </div>

          {error ? (
            <p style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }} role="alert">{error}</p>
          ) : null}

          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <Button
              disabled={busy !== null || !days || Number(days) < 1}
              onClick={() => save(
                {
                  intervalDays: Number(days),
                  ...(due !== toDateInput(schedule.nextDueAt) ? { nextDueAt: new Date(`${due}T00:00:00`).toISOString() } : {}),
                },
                "save",
              )}
            >
              {busy === "save" ? "Saving…" : "Save schedule"}
            </Button>

            {!inherited ? (
              <Button variant="secondary" disabled={busy !== null} onClick={() => save({ intervalDays: null }, "clear")}>
                {busy === "clear" ? "Clearing…" : "Use the default instead"}
              </Button>
            ) : null}

            <Button variant="secondary" disabled={busy !== null}
                    onClick={() => save({ paused: !schedule.paused }, "pause")}>
              {busy === "pause" ? "Saving…" : schedule.paused ? "Resume scheduling" : "Pause scheduling"}
            </Button>

            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {schedule.paused && !open ? (
        <div style={{ marginTop: 10 }}><Pill tone="warn">Paused — not being scheduled</Pill></div>
      ) : null}
    </Card>
  );
}
