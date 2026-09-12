"use client";

import { useEffect, useState } from "react";
import { Card, Button, PageHeader, Pill } from "@/components/ui/primitives";
import { isNfcSupported, readTagOnce } from "@/lib/nfc/web-nfc";

/**
 * Scan.
 *
 * Tap a tag and the correct asset loads - no searching, no typing. Where Web NFC
 * is unavailable the same screen accepts a scanned QR code or a typed tag id,
 * and all three hit the identical resolver.
 */
export function ScanConsole() {
  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSupported(isNfcSupported()), []);

  async function resolve(payload: string) {
    setError(null);
    const response = await fetch("/api/v1/tags/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Could not resolve that tag"); return; }

    // Tapping straight into the open task is the whole point: one tap from the
    // tag to the checklist.
    window.location.href = body.openTask
      ? `/tech/task/${body.openTask.id}`
      : `/tech/equipment/${body.equipment.id}`;
  }

  async function scan() {
    setScanning(true);
    setError(null);
    try {
      await resolve(await readTagOnce());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <main className="rise">
      <PageHeader title="Scan" subtitle="Tap a tag to open the right equipment instantly" />

      <Card style={{ textAlign: "center", padding: 32 }}>
        <div
          style={{
            width: 132, height: 132, margin: "0 auto 20px", borderRadius: "50%",
            background: scanning ? "var(--accent-soft)" : "var(--canvas)",
            border: `2px solid ${scanning ? "var(--accent)" : "var(--line)"}`,
            display: "grid", placeItems: "center", fontSize: 44,
            transition: "all 260ms ease",
          }}
        >
          📶
        </div>

        {supported ? (
          <>
            <div style={{ fontWeight: 640, fontSize: 17 }}>
              {scanning ? "Hold the phone against the tag" : "Ready to scan"}
            </div>
            <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 6, marginBottom: 18 }}>
              The asset and its open task open automatically.
            </p>
            <Button size="lg" onClick={scan} disabled={scanning}>{scanning ? "Scanning…" : "Scan tag"}</Button>
          </>
        ) : (
          <>
            <Pill tone="warn">NFC not available in this browser</Pill>
            <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 12 }}>
              Scan the QR code on the tag with your camera, or enter the tag id below.
              Both open exactly the same record.
            </p>
          </>
        )}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 660, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          QR or manual entry
        </div>
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Paste the tag URL or id"
          style={{ width: "100%", padding: "13px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--canvas)", minHeight: 48 }}
        />
        <div style={{ marginTop: 10 }}>
          <Button variant="secondary" onClick={() => resolve(manual.trim())} disabled={manual.trim().length < 6}>
            Open equipment
          </Button>
        </div>
      </Card>

      {error ? (
        <Card style={{ marginTop: 14, background: "var(--bad-soft)", borderColor: "transparent", color: "var(--bad)" }}>
          {error}
        </Card>
      ) : null}
    </main>
  );
}
