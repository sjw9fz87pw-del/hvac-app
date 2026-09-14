"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui/primitives";

/**
 * Self-service password change.
 *
 * Present on both the customer Account page and the technician Profile page,
 * because an account whose password can only be set by someone else is not
 * really the holder's account.
 */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const field: React.CSSProperties = {
    width: "100%", padding: "13px 14px", borderRadius: 12,
    border: "1px solid var(--line)", background: "var(--canvas)", minHeight: 48,
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (next !== confirm) { setError("The new passwords do not match"); return; }
    setBusy(true);
    const response = await fetch("/api/v1/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setBusy(false);
    if (response.ok) { setDone(true); return; }
    setError((await response.json().catch(() => ({}))).error ?? "Could not change the password");
  }

  if (done) {
    return (
      <Card style={{ background: "var(--good-soft)", borderColor: "transparent" }}>
        <div style={{ fontWeight: 660, color: "var(--good)" }}>Password changed</div>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 5 }}>
          Every other signed-in device has been signed out.
        </p>
      </Card>
    );
  }

  if (!open) {
    return <Button variant="secondary" onClick={() => setOpen(true)}>Change password</Button>;
  }

  return (
    <Card>
      <div style={{ fontWeight: 640, marginBottom: 12 }}>Change password</div>
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input type="password" required placeholder="Current password" autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)} style={field} />
        <input type="password" required placeholder="New password (12+ characters)" autoComplete="new-password"
          value={next} onChange={(e) => setNext(e.target.value)} style={field} />
        <input type="password" required placeholder="Confirm new password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} style={field} />

        {error ? <div style={{ color: "var(--bad)", fontSize: 13.5 }}>{error}</div> : null}

        <p style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>
          Changing it signs out every other device.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={busy || next.length < 12}>{busy ? "Saving…" : "Change password"}</Button>
        </div>
      </form>
    </Card>
  );
}
