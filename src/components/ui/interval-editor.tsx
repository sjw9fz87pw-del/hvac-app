"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui/primitives";
import { IntervalPicker, parseDays } from "./interval-picker";

export interface IntervalRow {
  serviceTypeId: string;
  name: string;
  /** What applies here today, whether inherited or set at this level. */
  effectiveDays: number;
  /** True when an override exists at this exact level. */
  overridden: boolean;
  inheritedFrom: string;
  /** How many units this job is on, where this editor is shown. */
  unitCount?: number;
}

/**
 * Set how often a job happens for a whole restaurant, a group, or by default.
 *
 * The override can always be cleared, which hands the decision back to the
 * level above — an override you cannot undo is a trap rather than a setting.
 */
export function IntervalEditor({ rows, scope, organizationId, locationId, canRemove = false }: {
  rows: IntervalRow[];
  scope: "SYSTEM" | "CUSTOMER" | "LOCATION";
  organizationId?: string;
  locationId?: string;
  /** Offer removing the job itself — company-wide, so only for whoever owns settings. */
  canRemove?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function remove(row: IntervalRow) {
    setBusy(`remove-${row.serviceTypeId}`);
    setError(null);
    const response = await fetch(`/api/v1/service-types/${row.serviceTypeId}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) { setError(body.error ?? "Could not remove the job"); return; }
    setEditing(null);
    setConfirmRemove(null);
    setNotice(body.outcome === "retired"
      ? `${row.name} removed. Its past records are kept.`
      : `${row.name} removed.`);
    router.refresh();
  }

  async function save(serviceTypeId: string, intervalDays: number | null, tag: string) {
    setBusy(tag);
    setError(null);
    const response = await fetch("/api/v1/plans", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope, serviceTypeId, organizationId, locationId, intervalDays }),
    });
    setBusy(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "That did not save");
      return;
    }
    setEditing(null);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5 }} role="alert">{error}</p> : null}
      {notice ? <p style={{ color: "var(--good)", fontSize: 13.5 }}>{notice}</p> : null}

      {rows.map((row) => {
        const open = editing === row.serviceTypeId;
        return (
          <Card key={row.serviceTypeId}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 15 }}>{row.name}</div>
                <div style={{ color: "var(--ink-soft)", fontSize: 13.5, marginTop: 2 }}>
                  Every {row.effectiveDays} days
                </div>
                <div style={{ color: "var(--ink-faint)", fontSize: 12.5, marginTop: 2 }}>
                  {row.overridden ? "Set here" : `From the ${row.inheritedFrom.toLowerCase()} default`}
                  {row.unitCount !== undefined
                    ? ` · ${row.unitCount === 0 ? "not on any units" : `on ${row.unitCount} unit${row.unitCount === 1 ? "" : "s"}`}`
                    : ""}
                </div>
              </div>
            </div>

            {!open ? (
              <button
                type="button"
                onClick={() => { setDays(String(row.effectiveDays)); setEditing(row.serviceTypeId); setConfirmRemove(null); setNotice(null); }}
                style={{
                  marginTop: 8, background: "none", border: "none", cursor: "pointer",
                  color: "var(--accent)", fontSize: 13.5, fontWeight: 650, padding: "8px 2px", minHeight: 40,
                }}
              >
                Change
              </button>
            ) : (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <IntervalPicker value={days} onChange={setDays} />
                <p style={{ color: "var(--ink-faint)", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
                  Next due dates are recalculated from each unit's last service. Units with their own interval are unaffected.
                </p>

                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  <Button disabled={busy !== null || !parseDays(days)}
                          onClick={() => save(row.serviceTypeId, parseDays(days), row.serviceTypeId)}>
                    {busy === row.serviceTypeId ? "Saving…" : "Save"}
                  </Button>
                  {row.overridden ? (
                    <Button variant="secondary" disabled={busy !== null}
                            onClick={() => save(row.serviceTypeId, null, `clear-${row.serviceTypeId}`)}>
                      {busy === `clear-${row.serviceTypeId}` ? "Clearing…" : "Use the default instead"}
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={() => { setEditing(null); setConfirmRemove(null); }}>Cancel</Button>
                </div>

                {canRemove ? (
                  confirmRemove === row.serviceTypeId ? (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                      <div style={{ fontWeight: 640, fontSize: 14 }}>Remove {row.name}?</div>
                      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                        It is removed from every restaurant and no longer scheduled. Past service records are kept.
                      </p>
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <div style={{ flex: 1 }}>
                          <Button variant="danger" disabled={busy !== null} onClick={() => remove(row)}>
                            {busy === `remove-${row.serviceTypeId}` ? "Removing…" : "Remove job"}
                          </Button>
                        </div>
                        <div style={{ flex: 1 }}>
                          <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirmRemove(null)}>Keep</Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button" onClick={() => setConfirmRemove(row.serviceTypeId)}
                      style={{
                        marginTop: 10, background: "none", border: "none", cursor: "pointer",
                        color: "var(--bad)", fontSize: 13.5, fontWeight: 650, padding: "8px 2px", minHeight: 40,
                      }}
                    >
                      Remove this job
                    </button>
                  )
                ) : null}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
