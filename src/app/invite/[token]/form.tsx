"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui/primitives";

const field: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
};

const label: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 620,
  color: "var(--ink-soft)", marginBottom: 6,
};

const MIN_LENGTH = 10;

export function AcceptInviteForm({ token, valid, firstName, email, companyName }: {
  token: string;
  valid: boolean;
  firstName: string | null;
  email: string | null;
  companyName: string | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= MIN_LENGTH && confirm === password;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);

    const response = await fetch("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (response.ok) {
      // The endpoint signs them in, so go straight to whatever their role sees.
      router.push("/");
      router.refresh();
      return;
    }

    setBusy(false);
    const body = await response.json().catch(() => ({}));
    setError(body.error ?? "Could not set your password");
  }

  const shell: React.CSSProperties = {
    minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px 18px",
  };

  if (!valid) {
    return (
      <main style={shell}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <Card style={{ textAlign: "center", padding: 30 }}>
            <div style={{ fontSize: 38, color: "var(--warn)" }}>!</div>
            <h1 style={{ fontSize: 21, marginTop: 8 }}>This link has expired</h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 10, lineHeight: 1.6 }}>
              Invitation links work once and expire. If you have already set a password,
              sign in instead. Otherwise ask whoever invited you to send a new one.
            </p>
            <div style={{ marginTop: 20 }}>
              <Button href="/signin">Go to sign in</Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main style={shell}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 16, margin: "0 auto 14px",
            display: "grid", placeItems: "center", fontSize: 24, fontWeight: 800,
            background: "var(--accent)", color: "#1a0f04",
          }}>E</div>
          <h1 style={{ fontSize: 23 }}>Welcome{firstName ? `, ${firstName}` : ""}</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 6 }}>
            Choose a password for {companyName}
          </p>
        </div>

        <form onSubmit={submit}>
          <Card>
            <div style={{ marginBottom: 16 }}>
              <span style={label}>Email</span>
              <div style={{ ...field, display: "flex", alignItems: "center", color: "var(--ink-soft)" }}>
                {email}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={label} htmlFor="password">Password</label>
              <input
                id="password" style={field} type={show ? "text" : "password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password" autoFocus
              />
              <p style={{ fontSize: 12.5, color: tooShort ? "var(--warn)" : "var(--ink-faint)", marginTop: 6 }}>
                At least {MIN_LENGTH} characters.
              </p>
            </div>

            <div>
              <label style={label} htmlFor="confirm">Confirm password</label>
              <input
                id="confirm" style={field} type={show ? "text" : "password"}
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
              {mismatch ? (
                <p style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 6 }}>
                  These do not match yet.
                </p>
              ) : null}
            </div>

            <button
              type="button" onClick={() => setShow((v) => !v)}
              style={{
                background: "none", border: "none", color: "var(--accent)", cursor: "pointer",
                fontSize: 13.5, fontWeight: 620, padding: "10px 2px 0", minHeight: 40,
              }}
            >
              {show ? "Hide password" : "Show password"}
            </button>
          </Card>

          {error ? (
            <p style={{ color: "var(--bad)", fontSize: 14, marginTop: 14 }} role="alert">{error}</p>
          ) : null}

          <div style={{ marginTop: 18 }}>
            <Button type="submit" disabled={!ready || busy}>
              {busy ? "Setting up…" : "Set password and sign in"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
