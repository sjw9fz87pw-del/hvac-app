"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, PageHeader, Pill, SectionTitle, StatusPill } from "@/components/ui/primitives";

export interface UnitRow {
  equipmentId: string;
  name: string;
  assetId: string;
  areaName: string;
  serviceTypeId: string;
  serviceTypeName: string;
  checklist: { label: string; completed: boolean }[];
  status: string;
  nextDueAt: string;
  /** Proof this screen cannot supply. Non-empty means it can't be closed here. */
  blockedBy: string[];
}

const field: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
};

function todayLocal(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function CompleteLocationForm({ locationId, locationName, units, technicianName }: {
  locationId: string;
  locationName: string;
  units: UnitRow[];
  technicianName: string;
}) {
  const router = useRouter();
  const available = units.filter((u) => u.blockedBy.length === 0);
  const blocked = units.filter((u) => u.blockedBy.length > 0);

  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(available.filter((u) => u.status !== "CURRENT").map((u) => u.equipmentId)),
  );
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);
  const [finished, setFinished] = useState(false);

  const key = (u: UnitRow) => u.equipmentId;

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setPicked((current) =>
      current.size === available.length ? new Set() : new Set(available.map(key)),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const chosen = available.filter((u) => picked.has(u.equipmentId));
    if (chosen.length === 0) return;

    setBusy(true);
    setDone(0);
    setFailures([]);

    // Backdating uses the date picked; the time of day is now, so two sweeps on
    // the same day still order correctly in the history.
    const at = new Date(`${date}T00:00:00`);
    const now = new Date();
    at.setHours(now.getHours(), now.getMinutes(), 0, 0);
    const performedAt = at.toISOString();

    const failed: { name: string; reason: string }[] = [];

    for (const unit of chosen) {
      const response = await fetch("/api/v1/services", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          equipmentId: unit.equipmentId,
          serviceTypeId: unit.serviceTypeId,
          performedAt,
          verificationMethod: "MANUAL",
          technicianNotes: note.trim() || null,
          checklist: unit.checklist,
          photos: [],
          issues: [],
        }),
      });

      if (response.ok) {
        setDone((n) => n + 1);
      } else {
        const body = await response.json().catch(() => ({}));
        failed.push({ name: unit.name, reason: body.error ?? `HTTP ${response.status}` });
      }
    }

    setFailures(failed);
    setBusy(false);
    setFinished(true);
    router.refresh();
  }

  if (finished) {
    const ok = done;
    return (
      <main className="rise">
        <PageHeader title={ok > 0 ? "Recorded" : "Nothing recorded"} subtitle={locationName} />
        <Card style={{ textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 40, color: ok > 0 ? "var(--good)" : "var(--warn)" }}>{ok > 0 ? "✓" : "!"}</div>
          <h2 style={{ fontSize: 20, marginTop: 8 }}>
            {ok} unit{ok === 1 ? "" : "s"} marked serviced
          </h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 8 }}>
            Each one now has its own service record and a fresh next-due date.
          </p>
        </Card>

        {failures.length > 0 ? (
          <>
            <SectionTitle>Not recorded</SectionTitle>
            <Card>
              {failures.map((f) => (
                <div key={f.name} style={{ fontSize: 14, marginBottom: 6 }}>
                  <strong>{f.name}</strong>
                  <span style={{ color: "var(--ink-soft)" }}> — {f.reason}</span>
                </div>
              ))}
            </Card>
          </>
        ) : null}

        <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
          <Button href={`/tech/complete/${locationId}`}>Back to this restaurant</Button>
          <Button href="/tech" variant="secondary">Done</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="rise">
      <PageHeader title="Mark serviced" subtitle={locationName} />

      <form onSubmit={submit}>
        <Card>
          <label style={{ display: "block", fontSize: 13, fontWeight: 620, color: "var(--ink-soft)", marginBottom: 6 }} htmlFor="date">
            When was the work done?
          </label>
          <input id="date" type="date" style={field} value={date} max={todayLocal()}
                 onChange={(e) => setDate(e.target.value)} />
          <p style={{ color: "var(--ink-faint)", fontSize: 13, marginTop: 8 }}>
            Next-due dates are counted from this date.
          </p>
        </Card>

        {available.length > 0 ? (
          <>
            <SectionTitle
              action={
                <button type="button" onClick={toggleAll}
                        style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 13.5, fontWeight: 650, cursor: "pointer", padding: 4 }}>
                  {picked.size === available.length ? "Clear all" : "Select all"}
                </button>
              }
            >
              Units · {picked.size} selected
            </SectionTitle>

            <div style={{ display: "grid", gap: 6 }}>
              {available.map((unit) => {
                const on = picked.has(unit.equipmentId);
                return (
                  <button
                    key={unit.equipmentId} type="button" onClick={() => toggle(unit.equipmentId)}
                    aria-pressed={on}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                      padding: "12px 14px", borderRadius: 13, cursor: "pointer", minHeight: 58,
                      background: "var(--surface)",
                      border: `1.5px solid ${on ? "var(--accent)" : "var(--line)"}`,
                    }}
                  >
                    <span aria-hidden style={{
                      width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                      display: "grid", placeItems: "center",
                      background: on ? "var(--accent)" : "transparent",
                      border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`,
                      color: "#1a0f04", fontSize: 14, fontWeight: 800,
                    }}>{on ? "✓" : ""}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 640, fontSize: 14.5 }}>{unit.name}</span>
                      <span style={{ display: "block", color: "var(--ink-soft)", fontSize: 13 }}>
                        {unit.areaName} · {unit.serviceTypeName}
                      </span>
                    </span>
                    <StatusPill status={unit.status} />
                  </button>
                );
              })}
            </div>

            <Card style={{ marginTop: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 620, color: "var(--ink-soft)", marginBottom: 6 }} htmlFor="note">
                Note <span style={{ fontWeight: 400 }}>· optional, internal</span>
              </label>
              <textarea id="note" style={{ ...field, minHeight: 88, resize: "vertical" }}
                        value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder="Anything worth knowing next visit" />
            </Card>

            <Card style={{ marginTop: 14, background: "var(--surface-2)", borderStyle: "dashed" }}>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55, margin: 0 }}>
                You are recording, as <strong>{technicianName}</strong>, that the standard
                checklist was completed on {picked.size} unit{picked.size === 1 ? "" : "s"}.
                These records are marked <strong>unverified</strong> — no tag scan or photos —
                and cannot be edited afterwards, only superseded.
              </p>
            </Card>

            {busy ? (
              <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 14 }}>
                Recording {done} of {picked.size}…
              </p>
            ) : null}

            <div style={{ marginTop: 18 }}>
              <Button type="submit" disabled={busy || picked.size === 0}>
                {busy ? "Recording…" : `Mark ${picked.size} unit${picked.size === 1 ? "" : "s"} serviced`}
              </Button>
            </div>
          </>
        ) : null}
      </form>

      {blocked.length > 0 ? (
        <>
          <SectionTitle>Needs the full flow</SectionTitle>
          <Card>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 10px", lineHeight: 1.55 }}>
              These require proof this screen cannot capture. Open the unit from a visit,
              or change what the job requires in Settings.
            </p>
            {blocked.map((unit) => (
              <div key={`${unit.equipmentId}-${unit.serviceTypeId}`} style={{ fontSize: 14, marginBottom: 8 }}>
                <strong>{unit.name}</strong>
                <span style={{ color: "var(--ink-soft)" }}> — {unit.serviceTypeName} needs {unit.blockedBy.join(", ")}</span>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      {available.length === 0 && blocked.length === 0 ? (
        <Card style={{ marginTop: 14 }}>
          <Pill tone="neutral">No units</Pill>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 8 }}>
            This restaurant has no units on a maintenance schedule yet.
          </p>
        </Card>
      ) : null}
    </main>
  );
}
