"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { List, Row, Divider, Pill, StatusPill, Card, Button } from "@/components/ui/primitives";
import { UnitPhoto } from "@/components/ui/unit-photo";
import { ConditionPicker } from "@/components/ui/condition-picker";
import { conditionCopy, type Condition } from "@/components/ui/condition";

export interface UnitRow {
  id: string;
  name: string;
  assetId: string;
  model: string | null;
  status: string;
  pendingSetup: boolean;
  tagged: boolean;
  condition: Condition;
  photoBlobKey: string | null;
}

/**
 * A restaurant's units, with the option to work on several at once.
 *
 * Selection is off until you ask for it. Tapping a row normally opens the
 * unit, which is what it does ninety-nine times out of a hundred; turning
 * Select on changes every row into a checkbox for as long as that lasts. A
 * list that is permanently in selection mode makes the common action harder to
 * serve the rare one.
 */
export function UnitList({ units, canEdit, canRemove }: { units: UnitRow[]; canEdit: boolean; canRemove: boolean }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [refused, setRefused] = useState<string[]>([]);
  // Removed rows leave the list at once; the server refresh follows behind.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function stop() {
    setSelecting(false);
    setPicked(new Set());
    setError(null);
    setConfirming(false);
  }

  /**
   * Remove the selected units.
   *
   * One request each rather than a bulk endpoint, because each unit is judged
   * on its own history and the refusals are the useful part of the answer: a
   * unit that has been serviced is kept and said so by name, while the rest
   * still go. An all-or-nothing delete would leave someone re-picking twelve
   * units to get rid of the two that were typed twice.
   */
  async function removePicked() {
    setBusy(true);
    setError(null);
    setDone(null);
    setRefused([]);

    const chosen = units.filter((u) => picked.has(u.id));
    const kept: string[] = [];
    const gone = new Set<string>();
    let removed = 0;

    for (const unit of chosen) {
      const response = await fetch(`/api/v1/equipment/${unit.id}`, { method: "DELETE" });
      if (response.ok) { removed++; gone.add(unit.id); continue; }
      const body = await response.json().catch(() => ({}));
      kept.push(`${unit.name} — ${body.error ?? "could not be removed"}`);
    }

    setBusy(false);
    setRemovedIds((current) => new Set([...current, ...gone]));
    setRefused(kept);
    if (removed > 0) setDone(`${removed} unit${removed === 1 ? "" : "s"} removed`);
    if (removed === 0 && kept.length === 0) setError("Nothing was removed");
    stop();
    router.refresh();
  }

  async function apply(condition: Condition) {
    if (picked.size === 0) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const response = await fetch("/api/v1/equipment/bulk", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ equipmentIds: [...picked], condition }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "That did not save");
      return;
    }
    const body = await response.json();
    setDone(`${body.updated} unit${body.updated === 1 ? "" : "s"} set to ${conditionCopy(condition).label.toLowerCase()}`);
    stop();
    router.refresh();
  }

  const shownUnits = units.filter((u) => !removedIds.has(u.id));
  const allPicked = picked.size === shownUnits.length && shownUnits.length > 0;

  return (
    <div>
      {canEdit ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => (selecting ? stop() : setSelecting(true))}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "8px 2px",
              minHeight: 40, color: "var(--accent)", fontSize: 13.5, fontWeight: 650,
            }}
          >
            {selecting ? "Cancel" : "Select units"}
          </button>
          {selecting ? (
            <button
              type="button"
              onClick={() => setPicked(allPicked ? new Set() : new Set(shownUnits.map((u) => u.id)))}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: "8px 2px",
                minHeight: 40, color: "var(--ink-soft)", fontSize: 13.5, fontWeight: 650,
              }}
            >
              {allPicked ? "Clear all" : "Select all"}
            </button>
          ) : null}
        </div>
      ) : null}

      {done ? <p style={{ color: "var(--good)", fontSize: 13.5, marginBottom: 10 }}>{done}</p> : null}

      {refused.length > 0 ? (
        <Card style={{ marginBottom: 10, borderColor: "var(--warn-line)" }}>
          <div style={{ fontWeight: 640, fontSize: 14 }}>Kept, because they have history</div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            {refused.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </Card>
      ) : null}

      <List>
        {shownUnits.map((unit, index) => {
          const on = picked.has(unit.id);
          const condition = conditionCopy(unit.condition);
          const inner = (
            <Row
              leading={
                selecting ? (
                  <span aria-hidden style={{
                    width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                    display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800,
                    background: on ? "var(--accent)" : "transparent",
                    border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`,
                    color: "#1a0f04",
                  }}>{on ? "✓" : ""}</span>
                ) : (
                  <UnitPhoto
                    equipmentId={unit.id}
                    blobKey={unit.photoBlobKey}
                    name={unit.name}
                    canEdit={canEdit}
                  />
                )
              }
              href={selecting ? undefined : `/admin/equipment/${unit.id}`}
              title={unit.name}
              subtitle={[unit.assetId, unit.model, condition.label].filter(Boolean).join(" · ")}
              right={
                <>
                  {!unit.tagged ? <Pill tone="warn">No tag</Pill> : null}
                  <StatusPill status={unit.pendingSetup ? "PENDING_SETUP" : unit.status} />
                </>
              }
            />
          );
          return (
            <div
              key={unit.id}
              onClick={selecting ? () => toggle(unit.id) : undefined}
              style={selecting ? { cursor: "pointer", background: on ? "var(--accent-soft)" : undefined } : undefined}
            >
              {index > 0 ? <Divider /> : null}
              {inner}
            </div>
          );
        })}
      </List>

      {/* The action bar only exists while something is selected. */}
      {selecting && picked.size > 0 ? (
        <Card style={{ marginTop: 12, borderColor: "var(--accent-line)" }}>
          <div style={{ fontWeight: 650, fontSize: 15 }}>
            {picked.size} unit{picked.size === 1 ? "" : "s"} selected
          </div>
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: "6px 0 12px" }}>
            Set them all to:
          </p>
          <ConditionPicker value={null} onChange={apply} disabled={busy} />
          {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }} role="alert">{error}</p> : null}

          {canRemove ? (
            confirming ? (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontWeight: 640, fontSize: 14 }}>
                  Remove {picked.size} unit{picked.size === 1 ? "" : "s"}?
                </div>
                <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 5, lineHeight: 1.5 }}>
                  This cannot be undone. Anything that has been serviced is kept and named
                  below instead — archive those if the machine is gone.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <div style={{ width: 150 }}>
                    <Button onClick={removePicked} disabled={busy}>
                      {busy ? "Removing…" : "Yes, remove"}
                    </Button>
                  </div>
                  <div style={{ width: 110 }}>
                    <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>Keep</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <button
                  type="button" onClick={() => setConfirming(true)} disabled={busy}
                  style={{
                    background: "none", border: "none", padding: "8px 2px", minHeight: 40,
                    color: "var(--bad)", fontSize: 13.5, fontWeight: 650, cursor: "pointer",
                  }}
                >
                  Remove {picked.size === 1 ? "this unit" : `these ${picked.size} units`}
                </button>
              </div>
            )
          ) : null}

          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={stop} disabled={busy}>Cancel</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
