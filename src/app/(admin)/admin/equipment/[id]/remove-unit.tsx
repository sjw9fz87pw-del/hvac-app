"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui/primitives";

interface Check {
  deletable: boolean;
  blockers: string[];
  pendingTasks: number;
  hasTag: boolean;
  archived: boolean;
}

/**
 * Removing one unit.
 *
 * Two different things wear the same word. A unit typed twice should vanish;
 * a machine that was replaced should be archived, because the service records
 * naming it are the product and deleting them would be lying about what was
 * done. Which one applies is decided by the history, not by the person — so
 * the screen asks the server first and then offers the single action that
 * will actually work, rather than a delete button that fails on press.
 */
export function RemoveUnit({ equipmentId, unitName, locationId }: {
  equipmentId: string;
  unitName: string;
  locationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || check) return;
    fetch(`/api/v1/equipment/${equipmentId}/removal-check`)
      .then((r) => r.json())
      .then((body) => setCheck(body))
      .catch(() => setError("Could not work out whether this unit can be removed"));
  }, [open, check, equipmentId]);

  async function remove() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/v1/equipment/${equipmentId}`, { method: "DELETE" });
    if (response.ok) {
      // A full load, not a client navigation: the page this component is
      // sitting on describes a unit that no longer exists, and the router
      // would be re-rendering it underneath us.
      window.location.assign(`/admin/locations/${locationId}`);
      return;
    }
    setBusy(false);
    setError((await response.json().catch(() => ({}))).error ?? "Could not remove this unit");
  }

  async function archive() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/v1/equipment/${equipmentId}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || "Removed by an administrator", releaseTag: true }),
    });
    setBusy(false);
    if (response.ok) { setOpen(false); router.refresh(); return; }
    setError((await response.json().catch(() => ({}))).error ?? "Could not archive this unit");
  }

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        style={{
          background: "none", border: "none", padding: "10px 2px", minHeight: 44,
          color: "var(--bad)", fontSize: 13.5, fontWeight: 650, cursor: "pointer",
        }}
      >
        Remove this unit
      </button>
    );
  }

  return (
    <Card style={{ marginTop: 10, borderColor: "var(--bad)" }}>
      {!check ? (
        <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>Checking what is recorded against it…</div>
      ) : check.deletable ? (
        <>
          <div style={{ fontWeight: 640 }}>Delete {unitName}?</div>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.5 }}>
            Nothing has been recorded against this unit, so it can go completely. This cannot be undone.
            {check.hasTag ? " Its tag goes back to unassigned stock rather than being destroyed." : ""}
            {check.pendingTasks > 0
              ? ` ${check.pendingTasks} scheduled task${check.pendingTasks === 1 ? "" : "s"} will be cancelled.`
              : ""}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <div style={{ width: 150 }}>
              <Button onClick={remove} disabled={busy}>{busy ? "Removing…" : "Yes, delete"}</Button>
            </div>
            <div style={{ width: 110 }}>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Keep</Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 640 }}>This one gets archived, not deleted</div>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.5 }}>
            It has {check.blockers.join(", ")}. Those records name this unit, so deleting it would
            change what the history says was done. Archiving stops it being scheduled and takes it
            off the list, and keeps the record intact.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? e.g. replaced, scrapped, sold"
            style={{
              width: "100%", marginTop: 12, padding: "11px 13px", borderRadius: 11,
              border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 44,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ width: 150 }}>
              <Button onClick={archive} disabled={busy}>{busy ? "Archiving…" : "Archive it"}</Button>
            </div>
            <div style={{ width: 110 }}>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Keep</Button>
            </div>
          </div>
        </>
      )}
      {error ? <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }}>{error}</div> : null}
    </Card>
  );
}
