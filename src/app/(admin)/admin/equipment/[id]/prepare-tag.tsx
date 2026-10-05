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
            {busy ? "Preparing…" : "Prepare tag"}
          </Button>
        </div>
        {error ? <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 8 }}>{error}</div> : null}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 620 }}>Tag link</div>
      <CopyLink link={url} />
      <ol style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6, marginTop: 12, paddingLeft: 20 }}>
        <li>In <strong>NFC Tools</strong> (App Store), choose Write → Add a record → URL.</li>
        <li>Paste the link and write it to the tag.</li>
        <li>Tap the tag with your phone and select this unit.</li>
      </ol>
    </div>
  );
}
