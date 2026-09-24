"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui/primitives";

interface UnitOption { id: string; name: string; locationName: string; areaName: string | null; tagged: boolean }

/**
 * "You just tapped a tag that isn't on anything yet — what is it stuck to?"
 *
 * Deliberately asked at tap time rather than when the tag was prepared: people
 * write a handful of tags and then walk round sticking them on, and the tag
 * that ends up on the walk-in is whichever one came off the strip next.
 */
export function ClaimTag({ payload, units }: { payload: string; units: UnitOption[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const shown = filter.trim()
    ? units.filter((u) => `${u.name} ${u.locationName} ${u.areaName ?? ""}`.toLowerCase().includes(filter.toLowerCase()))
    : units;

  async function claim(unit: UnitOption) {
    setBusy(unit.id);
    setError(null);
    const response = await fetch("/api/v1/tags/pair-by-tap", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ payload, equipmentId: unit.id }),
    });
    if (response.ok) {
      // Reload this same tag URL rather than jumping to the unit: resolution
      // now succeeds, and it is resolution that knows where each role belongs
      // — a technician with the unit on today's visit lands on the job, not on
      // a page about the machine. It also proves the tag works, which is the
      // question the person is actually asking.
      window.location.assign(window.location.pathname);
      return;
    }
    setBusy(null);
    setError((await response.json().catch(() => ({}))).error ?? "Could not link the tag");
  }

  return (
    <Card style={{ maxWidth: 460, padding: 22 }}>
      <div style={{ fontSize: 30 }}>🏷️</div>
      <h1 style={{ fontSize: 20, marginTop: 8 }}>New tag — what is it on?</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
        This tag is written but not linked to anything yet. Pick the unit it is stuck to.
      </p>

      {units.length > 6 ? (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search units"
          style={{
            width: "100%", marginTop: 14, padding: "11px 13px", borderRadius: 11,
            border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 44,
          }}
        />
      ) : null}

      <div style={{ marginTop: 14, display: "grid", gap: 8, maxHeight: "50vh", overflowY: "auto" }}>
        {shown.map((unit) => (
          <button
            key={unit.id}
            type="button"
            onClick={() => claim(unit)}
            disabled={busy !== null}
            style={{
              textAlign: "left", padding: "12px 14px", borderRadius: 12, minHeight: 52,
              border: "1px solid var(--line)", background: "var(--surface-2)",
              cursor: busy ? "default" : "pointer", opacity: busy && busy !== unit.id ? 0.5 : 1,
            }}
          >
            <div style={{ fontWeight: 620 }}>{busy === unit.id ? "Linking…" : unit.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 2 }}>
              {unit.locationName}{unit.areaName ? ` · ${unit.areaName}` : ""}
              {/* Said plainly: choosing this one retires whatever is on it now. */}
              {unit.tagged ? " · replaces its current tag" : ""}
            </div>
          </button>
        ))}
        {shown.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "var(--ink-faint)" }}>Nothing matches that.</div>
        ) : null}
      </div>

      {error ? <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 12 }}>{error}</div> : null}
    </Card>
  );
}
