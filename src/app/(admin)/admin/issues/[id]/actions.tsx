"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui/primitives";

/**
 * Triage, assignment and vendor routing.
 *
 * Routing to an outside trade is what lets the company coordinate a restaurant's
 * whole equipment care without employing every trade: a technician flags an
 * unusual compressor noise while cleaning a coil, and the same issue can be
 * handed to a refrigeration contractor with all its context intact.
 */
export function IssueActions({ issueId, status, assignedToId, vendorId, technicians, vendors, canAssign, canResolve }: {
  issueId: string;
  status: string;
  assignedToId: string | null;
  vendorId: string | null;
  technicians: { id: string; name: string }[];
  vendors: { id: string; name: string; trade: string | null }[];
  canAssign: boolean;
  canResolve: boolean;
}) {
  const [assignee, setAssignee] = useState(assignedToId ?? "");
  const [vendor, setVendor] = useState(vendorId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolved = status === "RESOLVED" || status === "CLOSED";

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/v1/issues/${issueId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (response.ok) { window.location.reload(); return; }
    setError((await response.json().catch(() => ({}))).error ?? "Update failed");
  }

  const control: React.CSSProperties = {
    padding: "11px 13px", borderRadius: 11, border: "1px solid var(--line)",
    background: "var(--canvas)", minHeight: 44, flex: 1, minWidth: 170,
  };

  return (
    <Card>
      <div style={{ fontWeight: 640, marginBottom: 12 }}>Actions</div>

      {canAssign && !resolved ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={control}>
              <option value="">Assign to our team…</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div style={{ width: 130 }}>
              <Button size="sm" variant="secondary" disabled={busy || !assignee} onClick={() => patch({ assignedToId: assignee })}>
                Assign
              </Button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} style={control}>
              <option value="">Route to an outside vendor…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.trade ? ` — ${v.trade.toLowerCase()}` : ""}</option>)}
            </select>
            <div style={{ width: 130 }}>
              <Button size="sm" variant="secondary" disabled={busy || !vendor} onClick={() => patch({ vendorId: vendor, status: "ASSIGNED" })}>
                Route
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {canResolve && !resolved ? (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was done? This note is shown to the customer."
            rows={2}
            style={{ width: "100%", padding: 12, borderRadius: 11, border: "1px solid var(--line)", background: "var(--canvas)", resize: "vertical" }}
          />
          <div style={{ marginTop: 10, width: 180 }}>
            <Button size="sm" disabled={busy} onClick={() => patch({ status: "RESOLVED", resolutionNote: note || null })}>
              {busy ? "Saving…" : "Mark resolved"}
            </Button>
          </div>
        </div>
      ) : null}

      {resolved ? (
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
          This issue is {status.toLowerCase()}. The customer has been notified.
        </p>
      ) : null}

      {error ? <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }}>{error}</div> : null}
    </Card>
  );
}
