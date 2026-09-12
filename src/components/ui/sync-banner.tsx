"use client";

import { useEffect, useState } from "react";
import { pendingCount, flushQueue } from "@/lib/sync/queue";

/**
 * Offline status.
 *
 * Restaurant Wi-Fi and basement cell service both fail routinely, so the app
 * says plainly what is queued and flushes automatically the moment the
 * connection returns.
 */
export function SyncBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const refresh = async () => setPending(await pendingCount());
    void refresh();

    const onOnline = async () => {
      setOnline(true);
      setSyncing(true);
      await flushQueue();
      setSyncing(false);
      void refresh();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = setInterval(refresh, 8000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
    };
  }, []);

  if (online && pending === 0) return null;

  const tone = online ? { bg: "var(--accent-soft)", fg: "var(--accent)" } : { bg: "var(--warn-soft)", fg: "var(--warn)" };

  return (
    <div style={{ background: tone.bg, color: tone.fg, borderRadius: 12, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: "currentColor", flexShrink: 0 }} />
      {!online
        ? `Offline — ${pending} item${pending === 1 ? "" : "s"} saved on this device`
        : syncing
          ? "Syncing…"
          : `${pending} item${pending === 1 ? "" : "s"} waiting to sync`}
    </div>
  );
}
