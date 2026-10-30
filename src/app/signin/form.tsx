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
    border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
  };

  return (
    <main className="page-scroll signin-page">
      <div className="signin-layout">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="signin-logo"
          src="/brand/logo-full.svg"
          alt="Axios Equipment Care. People. Equipment. A stronger tomorrow."
          width={452} height={334}
        />

        <Card className="signin-card" style={{ padding: 26 }}>
          <h1 style={{ fontSize: 21 }}>Sign in</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 4, marginBottom: 18 }}>
            Welcome back. Use the email you were invited with.
          </p>

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

        {/* The tagline, said in full: what each of its three words stands for here. */}
        <ul className="signin-points">
          {PILLARS.map((pillar) => (
            <li key={pillar.title}>
              <span className="signin-dot" aria-hidden="true" />
              <div>
                <div className="signin-point-title">{pillar.title}</div>
                <div className="signin-point-body">{pillar.body}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

const PILLARS = [
  { title: "People", body: "Your team and your restaurants, each seeing exactly what they need." },
  { title: "Equipment", body: "Every unit's record, schedule and proof of service in one place." },
  { title: "A stronger tomorrow", body: "Maintenance done on time, before something breaks." },
];
