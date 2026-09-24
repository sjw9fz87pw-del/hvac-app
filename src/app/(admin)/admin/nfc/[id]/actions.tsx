"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui/primitives";
import { replaceUnitTag, type ReplacePhase } from "@pmops/nfc-writer";
import { tagApi, tagWriter } from "@/lib/nfc/writer";

/**
 * Replace, unpair and revoke.
 *
 * Replacement mints and verifies the new tag before the old one is revoked, in
 * one server-side transaction - the asset is never left without an identity, and
 * the old tag's history stays attached to it.
 */
export function TagActions({ tagId, equipmentId, equipmentName, organizationId, canRevoke }: {
  tagId: string; equipmentId: string; equipmentName: string; organizationId: string; canRevoke: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "replacing" | "confirm-unpair" | "confirm-revoke">("idle");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function replace() {
    setBusy(true);
    setError(null);
    const writer = tagWriter();
    const label: Record<ReplacePhase, string> = {
      minting: "Minting a replacement identifier…",
      writing: "Hold the new blank tag against the phone…",
      verifying: "Reading the tag back to verify…",
      replacing: "Revoking the old tag and pairing the new one…",
      locking: "Locking the replacement so it cannot be rewritten…",
    };
    try {
      await replaceUnitTag({
        organizationId,
        unitId: equipmentId,
        reason,
        lock: writer.canLock(),
        writer,
        api: tagApi,
        onPhase: (phase) => setStatus(label[phase]),
      });
      setStatus("Replaced. The old tag is revoked and its history retained.");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replacement failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function unpair(revoke: boolean) {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/tags/unpair", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ equipmentId, reason: reason || (revoke ? "Revoked" : "Returned to stock"), revoke }),
    });
    setBusy(false);
    if (response.ok) window.location.reload();
    else setError((await response.json()).error ?? "Operation failed");
  }

  const field: React.CSSProperties = {
    width: "100%", padding: "12px 13px", borderRadius: 11,
    border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 46, marginTop: 10,
  };

  return (
    <Card>
      <div style={{ fontWeight: 640, marginBottom: 3 }}>Tag operations</div>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
        Paired to <strong>{equipmentName}</strong> · tag {tagId.slice(0, 10)}
      </p>

      {status ? (
        <div style={{ marginTop: 12, background: "var(--accent-soft)", color: "var(--accent)", padding: 12, borderRadius: 10, fontSize: 13.5 }}>
          {status}
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 12, background: "var(--bad-soft)", color: "var(--bad)", padding: 12, borderRadius: 10, fontSize: 13.5 }}>
          {error}
        </div>
      ) : null}

      {mode !== "idle" ? (
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (recorded in the audit log)" style={field} />
      ) : null}

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginTop: 12 }}>
        {mode === "idle" ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setMode("replacing")} disabled={!tagWriter().isSupported()}>
              Replace tag
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMode("confirm-unpair")}>Unpair</Button>
            {canRevoke ? <Button variant="danger" size="sm" onClick={() => setMode("confirm-revoke")}>Revoke</Button> : null}
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => { setMode("idle"); setError(null); setStatus(null); }}>Cancel</Button>
            <Button
              size="sm"
              variant={mode === "confirm-revoke" ? "danger" : "primary"}
              disabled={busy}
              onClick={() => (mode === "replacing" ? replace() : unpair(mode === "confirm-revoke"))}
            >
              {busy ? "Working…"
                : mode === "replacing" ? "Write new tag"
                : mode === "confirm-revoke" ? "Revoke permanently" : "Confirm unpair"}
            </Button>
          </>
        )}
      </div>

      {!tagWriter().isSupported() ? (
        <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 10 }}>
          Replacing a tag requires a device that can write NFC (Chrome on Android). Unpair and revoke work anywhere.
        </p>
      ) : null}
    </Card>
  );
}
