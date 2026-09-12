"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui/primitives";

export function SignInForm({ next }: { next: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Sign in failed");
      setBusy(false);
      return;
    }
    // A tap that arrived while signed out is preserved and resumed here.
    window.location.href = next || "/";
  }

  const field: React.CSSProperties = {
    width: "100%", padding: "13px 14px", borderRadius: 12,
    border: "1px solid var(--line)", background: "var(--canvas)", minHeight: 48,
  };

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 400, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700 }}>E</div>
          <div>
            <div style={{ fontWeight: 680, letterSpacing: "-0.02em" }}>Equipment Care</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Preventive maintenance platform</div>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={field} autoComplete="email" />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>Password</span>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={field} autoComplete="current-password" />
          </label>

          {error ? (
            <div style={{ background: "var(--bad-soft)", color: "var(--bad)", padding: "10px 12px", borderRadius: 10, fontSize: 13.5 }}>{error}</div>
          ) : null}

          <div style={{ marginTop: 4 }}>
            <Button type="submit" size="lg" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
