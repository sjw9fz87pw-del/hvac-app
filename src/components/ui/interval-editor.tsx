"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui/primitives";

export interface IntervalRow {
  serviceTypeId: string;
  name: string;
  /** What applies here today, whether inherited or set at this level. */
  effectiveDays: number;
  /** True when an override exists at this exact level. */
  overridden: boolean;
  inheritedFrom: string;
}

const PRESETS = [30, 60, 90, 180, 365];

function presetLabel(n: number): string {
  if (n === 365) return "1 year";
  if (n % 30 === 0) return `${n / 30} month${n === 30 ? "" : "s"}`;
  return `${n} days`;
}

/**
 * Set how often a job happens for a whole restaurant, a group, or by default.
 *
 * The override can always be cleared, which hands the decision back to the
 * level above — an override you cannot undo is a trap rather than a setting.
 */
export function IntervalEditor({ rows, scope, organizationId, locationId }: {
  rows: IntervalRow[];
  scope: "SYSTEM" | "CUSTOMER" | "LOCATION";
  organizationId?: string;
  locationId?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
                </div>
              </div>
            </div>

            {!open ? (
              <button
                type="button"
                onClick={() => { setDays(String(row.effectiveDays)); setEditing(row.serviceTypeId); }}
                style={{
                  marginTop: 8, background: "none", border: "none", cursor: "pointer",
                  color: "var(--accent)", fontSize: 13.5, fontWeight: 650, padding: "8px 2px", minHeight: 40,
                }}
              >
                Change
              </button>
            ) : (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
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
                        {presetLabel(n)}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="number" min={1} max={3650} inputMode="numeric" value={days}
                  onChange={(e) => setDays(e.target.value)} aria-label="Days between services"
                  style={{
                    width: "100%", padding: "13px 14px", borderRadius: 12,
                    border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
                  }}
                />
                <p style={{ color: "var(--ink-faint)", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
                  Every unit that follows this setting has its next visit recalculated from when
                  it was last serviced. Units with their own schedule keep it.
                </p>

                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  <Button disabled={busy !== null || !days || Number(days) < 1}
                          onClick={() => save(row.serviceTypeId, Number(days), row.serviceTypeId)}>
                    {busy === row.serviceTypeId ? "Saving…" : "Save"}
                  </Button>
                  {row.overridden ? (
                    <Button variant="secondary" disabled={busy !== null}
                            onClick={() => save(row.serviceTypeId, null, `clear-${row.serviceTypeId}`)}>
                      {busy === `clear-${row.serviceTypeId}` ? "Clearing…" : "Use the default instead"}
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
