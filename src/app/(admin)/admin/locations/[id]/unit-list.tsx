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
export function UnitList({ units, canEdit }: { units: UnitRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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

  const allPicked = picked.size === units.length && units.length > 0;

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
              onClick={() => setPicked(allPicked ? new Set() : new Set(units.map((u) => u.id)))}
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

      <List>
        {units.map((unit, index) => {
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
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={stop} disabled={busy}>Cancel</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
