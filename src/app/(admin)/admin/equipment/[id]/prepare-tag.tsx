"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { CopyLink } from "@/components/ui/copy-link";

/**
 * The iPhone route to a written tag.
 *
 * An iPhone can read a tag perfectly well — it just cannot write one from a
 * browser, and no setting changes that. So the app hands over the one thing
 * only it can produce, the signed URL, and lets a free NFC writer app do the
 * radio work. Tapping the finished tag lands back in the app, where the tap
 * itself proves the chip carries this token and the pairing can be completed.
 */
export function PrepareTag({ equipmentId, organizationId }: { equipmentId: string; organizationId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/tags/mint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId, label: `Prepared for ${equipmentId.slice(-6)}` }),
    });
    setBusy(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error ?? "Could not prepare a tag"); return; }
    setUrl(body.url);
  }

  if (!url) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ maxWidth: 230 }}>
          <Button onClick={prepare} disabled={busy} variant="secondary">
            {busy ? "Preparing…" : "Prepare a tag to write"}
          </Button>
        </div>
        {error ? <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 8 }}>{error}</div> : null}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 620 }}>Write this to the tag</div>
      <CopyLink link={url} />
      <ol style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6, marginTop: 12, paddingLeft: 20 }}>
        <li>Install <strong>NFC Tools</strong> from the App Store — free, no account.</li>
        <li>Open it, choose <strong>Write</strong> → <strong>Add a record</strong> → <strong>URL</strong>.</li>
        <li>Paste the link above, then <strong>Write</strong>, and hold the tag to the top of the phone.</li>
        <li>Come back here and <strong>tap the finished tag</strong> — it opens the app and asks which unit it belongs to.</li>
      </ol>
      <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 8, lineHeight: 1.5 }}>
        Nothing is linked until you tap it. Until then the tag is blank stock, and the link above
        works on its own if you would rather print it as a QR code.
      </p>
    </div>
  );
}
