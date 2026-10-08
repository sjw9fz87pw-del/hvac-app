"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "./primitives";
import { IntervalPicker, parseDays } from "./interval-picker";

export interface JobOption {
  id: string;
  name: string;
  /** What applies where this panel is shown: the unit's, the restaurant's or the company's. */
  effectiveDays: number;
}

export interface UnitOption {
  id: string;
  name: string;
  area: string | null;
}

const NEW = "__new__";

const field: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: 10,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 44,
};
const label: React.CSSProperties = {
  display: "block", fontSize: 12.5, fontWeight: 620, color: "var(--ink-soft)", marginBottom: 6,
};

/**
 * Add a job: a new one by name, or an existing one, onto whichever units.
 *
 * One panel in three places. With `units` it asks which of them (a
 * restaurant); with `unitId` it is about that one unit; with neither it only
 * defines the job (Settings). Defining a job needs the right to change company
 * settings; putting one on units needs the right to manage schedules — a
 * person may hold either, so each half appears only when it can succeed.
 */
export function AddJob({ jobs, units, unitId, canCreate, canAttach }: {
  jobs: JobOption[];
  units?: UnitOption[];
  unitId?: string;
  canCreate: boolean;
  canAttach: boolean;
}) {
  const router = useRouter();
  const attaches = canAttach && (Boolean(unitId) || Boolean(units?.length));
  const offerExisting = attaches && jobs.length > 0;

  const firstChoice = canCreate ? NEW : jobs[0]?.id ?? NEW;
  const firstDays = String(jobs.find((j) => j.id === firstChoice)?.effectiveDays ?? 90);

  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>(firstChoice);
  const [name, setName] = useState("");
  const [days, setDays] = useState(firstDays);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // A confirmation that outlives the moment it describes turns into a false
  // statement — "added to this unit" next to a job just removed from it.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), 5000);
    return () => clearTimeout(timer);
  }, [done]);

  if (!canCreate && !offerExisting) return null;

  const creating = choice === NEW;
  const existing = jobs.find((j) => j.id === choice);
  const interval = parseDays(days);
  const targets = unitId ? [unitId] : [...picked];
  const allPicked = Boolean(units?.length) && picked.size === units!.length;

  function choose(value: string) {
    setChoice(value);
    const job = jobs.find((j) => j.id === value);
    setDays(String(job?.effectiveDays ?? 90));
    setError(null);
  }

  function reset() {
    setOpen(false); setName(""); setDays(firstDays); setPicked(new Set()); setError(null);
    setChoice(firstChoice);
  }

  const ready = Boolean(interval) && (creating ? name.trim().length >= 2 : targets.length > 0);

  async function submit() {
    if (!interval) return;
    setBusy(true);
    setError(null);
    setDone(null);

    let jobId = existing?.id ?? null;
    let jobName = existing?.name ?? name.trim();

    if (creating) {
      const response = await fetch("/api/v1/service-types", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, intervalDays: interval }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBusy(false);
        setError(body.error === "Validation failed" ? body.detail?.[0]?.message ?? body.error : body.error ?? "Could not add the job");
        return;
      }
      jobId = body.id;
      jobName = body.name;
    }

    let summary = attaches ? `${jobName} added` : `${jobName} added. Put it on units from a restaurant's page.`;
    if (attaches && targets.length > 0 && jobId) {
      const response = await fetch("/api/v1/equipment/jobs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          equipmentIds: targets,
          serviceTypeId: jobId,
          // A new job's interval is already its default. For an existing one,
          // only a changed interval becomes a setting of its own on each unit.
          intervalDays: creating || interval === existing?.effectiveDays ? null : interval,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBusy(false);
        setError(creating
          ? `${jobName} was created, but could not be added to the units: ${body.error ?? "unknown error"}`
          : body.error ?? "Could not add the job");
        router.refresh();
        return;
      }
      summary = unitId
        ? `${jobName} added to this unit`
        : `${jobName} added to ${body.added} unit${body.added === 1 ? "" : "s"}` +
          (body.alreadyHad ? ` · ${body.alreadyHad} already had it` : "");
    }

    setBusy(false);
    setDone(summary);
    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <div style={{ marginTop: 10 }}>
        {done ? <p style={{ color: "var(--good)", fontSize: 13.5, marginBottom: 6 }}>{done}</p> : null}
        <button
          type="button" onClick={() => { setDone(null); setOpen(true); }}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: "8px 2px", minHeight: 40,
            color: "var(--accent)", fontSize: 14, fontWeight: 650,
          }}
        >
          + Add a job
        </button>
      </div>
    );
  }

  return (
    <Card style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 650 }}>Add a job</div>

      {offerExisting ? (
        <div style={{ marginTop: 12 }}>
          <label style={label} htmlFor="job-choice">Job</label>
          <select id="job-choice" value={choice} onChange={(e) => choose(e.target.value)} style={field}>
            {canCreate ? <option value={NEW}>New job…</option> : null}
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.name}</option>)}
          </select>
        </div>
      ) : null}

      {creating ? (
        <div style={{ marginTop: 12 }}>
          <label style={label} htmlFor="job-name">Name</label>
          <input
            id="job-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
            placeholder="e.g. Hood filter replacement" style={field} autoFocus
          />
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <span style={label}>How often</span>
        <IntervalPicker value={days} onChange={setDays} />
      </div>

      {attaches && units?.length && !unitId ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ ...label, marginBottom: 0 }}>Units</span>
            <button
              type="button"
              onClick={() => setPicked(allPicked ? new Set() : new Set(units.map((u) => u.id)))}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 13, fontWeight: 650, padding: "6px 2px" }}
            >
              {allPicked ? "Clear all" : "Select all"}
            </button>
          </div>
          <div style={{ display: "grid", gap: 2, marginTop: 4, maxHeight: 280, overflowY: "auto" }}>
            {units.map((unit) => {
              const on = picked.has(unit.id);
              return (
                <label key={unit.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", cursor: "pointer", fontSize: 14 }}>
                  <input
                    type="checkbox" checked={on} style={{ width: 18, height: 18 }}
                    onChange={() => setPicked((current) => {
                      const next = new Set(current);
                      if (next.has(unit.id)) next.delete(unit.id); else next.add(unit.id);
                      return next;
                    })}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>{unit.name}</span>
                  {unit.area ? <span style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>{unit.area}</span> : null}
                </label>
              );
            })}
          </div>
          {creating && picked.size === 0 ? (
            <p style={{ color: "var(--ink-faint)", fontSize: 12.5, marginTop: 4 }}>
              No units selected — the job is created and can be added to units later.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }} role="alert">{error}</p> : null}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <div style={{ flex: 1 }}>
          <Button onClick={submit} disabled={busy || !ready}>{busy ? "Adding…" : "Add job"}</Button>
        </div>
        <div style={{ flex: 1 }}>
          <Button variant="secondary" onClick={reset} disabled={busy}>Cancel</Button>
        </div>
      </div>
    </Card>
  );
}
