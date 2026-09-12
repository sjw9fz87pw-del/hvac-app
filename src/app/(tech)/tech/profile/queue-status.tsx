"use client";

import { useEffect, useState } from "react";
import { Card, Button, formatDate } from "@/components/ui/primitives";
import { listPending, flushQueue, type QueuedEvent } from "@/lib/sync/queue";

/**
 * What is still on the device. Made visible rather than hidden, so a technician
 * can see that a completion in a basement walk-in is safely stored and not lost.
 */
export function QueueStatus() {
  const [events, setEvents] = useState<QueuedEvent[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setEvents(await listPending());
  useEffect(() => { void refresh(); }, []);

  if (events.length === 0) {
    return (
      <Card style={{ color: "var(--ink-soft)", fontSize: 14 }}>
        Everything on this device has synced. Work completed without signal is stored here until it does.
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ fontWeight: 640 }}>{events.length} item{events.length === 1 ? "" : "s"} waiting</div>
      <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 8 }}>
        {events.map((event) => (
          <li key={event.clientEventId} style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
            {event.type === "SERVICE_COMPLETED" ? "Service completion" : "Issue report"} · queued {formatDate(event.queuedAt)}
            {event.lastError ? <span style={{ color: "var(--bad)" }}> — {event.lastError}</span> : null}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 14 }}>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => { setBusy(true); await flushQueue(); await refresh(); setBusy(false); }}
        >
          {busy ? "Syncing…" : "Sync now"}
        </Button>
      </div>
    </Card>
  );
}
