"use client";

import { useState } from "react";
import { Card, Button, Pill } from "@/components/ui/primitives";

const INTERVALS = [30, 60, 90, 180, 365];

/**
 * Verifying a customer-added asset.
 *
 * This is the moment a unit someone photographed on their phone becomes
 * something we have committed to maintaining, so it is ours to do, not theirs.
 */
export function VerifyEquipment({ equipmentId, equipmentName, serviceTypes }: {
  equipmentId: string;
  equipmentName: string;
  serviceTypes: { id: string; name: string; defaultIntervalDays: number }[];
}) {
  const [serviceTypeId, setServiceTypeId] = useState(serviceTypes[0]?.id ?? "");
  const [intervalDays, setIntervalDays] = useState(serviceTypes[0]?.defaultIntervalDays ?? 30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/v1/equipment/${equipmentId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ maintenance: [{ serviceTypeId, intervalDays }] }),
    });
    setBusy(false);
    if (response.ok) { window.location.reload(); return; }
    setError((await response.json().catch(() => ({}))).error ?? "Verification failed");
  }

  return (
    <Card style={{ borderColor: "var(--warn)" }}>
      <Pill tone="warn">Awaiting service setup</Pill>
      <div style={{ fontWeight: 640, marginTop: 10 }}>Verify {equipmentName}</div>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4 }}>
        The customer added this unit. Confirm the details and set its maintenance schedule — it starts generating
        preventive work as soon as you do.
      </p>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={serviceTypeId}
          onChange={(e) => {
            setServiceTypeId(e.target.value);
            const match = serviceTypes.find((s) => s.id === e.target.value);
            if (match) setIntervalDays(match.defaultIntervalDays);
          }}
          style={{ padding: "11px 13px", borderRadius: 11, border: "1px solid var(--line)", background: "var(--canvas)", minHeight: 44 }}
        >
          {serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <div style={{ display: "flex", gap: 6 }}>
          {INTERVALS.map((days) => (
            <button
              key={days}
              onClick={() => setIntervalDays(days)}
              style={{
                padding: "11px 13px", borderRadius: 11, fontSize: 14, fontWeight: 620, cursor: "pointer", minHeight: 44,
                border: `1px solid ${intervalDays === days ? "transparent" : "var(--line)"}`,
                background: intervalDays === days ? "var(--accent)" : "var(--canvas)",
                color: intervalDays === days ? "#fff" : "var(--ink-soft)",
              }}
            >
              {days}d
            </button>
          ))}
        </div>

        <div style={{ width: 190 }}>
          <Button onClick={verify} disabled={busy || !serviceTypeId}>{busy ? "Verifying…" : "Verify & schedule"}</Button>
        </div>
      </div>

      {error ? <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }}>{error}</div> : null}
    </Card>
  );
}
