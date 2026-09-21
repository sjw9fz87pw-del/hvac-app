"use client";

import { useState } from "react";
import { Button, Card, Pill } from "@/components/ui/primitives";

/**
 * Whether invitations can actually be delivered, and a way to prove it.
 *
 * Without this, the first evidence that email is misconfigured is somebody
 * never receiving an invitation — which looks identical to them not having got
 * round to it.
 */
export function EmailStatus({ configured, provider, ownEmail }: {
  configured: boolean;
  provider: string | null;
  ownEmail: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function test() {
    setBusy(true);
    setResult(null);
    const response = await fetch("/api/v1/settings/test-email", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    setResult(
      response.ok
        ? { ok: true, message: `Sent to ${body.to}. Check your inbox, and your spam folder.` }
        : { ok: false, message: body.error ?? "Could not send" },
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {configured
          ? <Pill tone="good">Email is on{provider === "smtp" ? " · your mailbox" : provider === "resend" ? " · Resend" : ""}</Pill>
          : <Pill tone="warn">Email is off</Pill>}
      </div>

      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 10, lineHeight: 1.6 }}>
        {configured
          ? "Invitations and password resets are emailed automatically. Send yourself a test to be sure."
          : "Invitations still work — the screen shows a link to pass on by hand. Set SMTP_USER and SMTP_PASSWORD in Netlify to have them emailed instead."}
      </p>

      {configured ? (
        <div style={{ marginTop: 14 }}>
          <Button variant="secondary" disabled={busy} onClick={test}>
            {busy ? "Sending…" : `Send a test to ${ownEmail}`}
          </Button>
        </div>
      ) : null}

      {result ? (
        <p
          role="alert"
          style={{
            marginTop: 12, fontSize: 13.5, lineHeight: 1.55,
            color: result.ok ? "var(--good)" : "var(--bad)",
            wordBreak: "break-word",
          }}
        >
          {result.message}
        </p>
      ) : null}
    </Card>
  );
}
