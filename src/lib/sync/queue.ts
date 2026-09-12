"use client";

/**
 * The offline queue.
 *
 * Service completions and issue reports are written to IndexedDB first and
 * posted to the server second. That ordering is deliberate: a technician in a
 * walk-in with no signal finishes the task, the app confirms it, and the record
 * reaches the server whenever the phone next has a connection - which may be in
 * the parking lot twenty minutes later.
 *
 * Each queued event carries a client-generated id used as its idempotency key,
 * so replaying a batch that was half-applied when the connection dropped
 * produces no duplicates.
 */

const DB_NAME = "pmops-sync";
const STORE = "events";
const VERSION = 1;

export type QueuedEventType = "SERVICE_COMPLETED" | "ISSUE_REPORTED";

export interface QueuedEvent {
  clientEventId: string;
  type: QueuedEventType;
  payload: unknown;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clientEventId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function enqueue(type: QueuedEventType, payload: unknown): Promise<string> {
  const clientEventId = crypto.randomUUID();
  await withStore("readwrite", (store) =>
    store.put({ clientEventId, type, payload, queuedAt: new Date().toISOString(), attempts: 0 } satisfies QueuedEvent),
  );
  return clientEventId;
}

export async function pendingCount(): Promise<number> {
  try {
    return await withStore("readonly", (store) => store.count());
  } catch {
    return 0;
  }
}

export async function listPending(): Promise<QueuedEvent[]> {
  try {
    return (await withStore<QueuedEvent[]>("readonly", (store) => store.getAll() as IDBRequest<QueuedEvent[]>)) ?? [];
  } catch {
    return [];
  }
}

async function remove(clientEventId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(clientEventId) as unknown as IDBRequest<undefined>);
}

export interface FlushResult { applied: number; duplicates: number; failed: number }

/**
 * Post everything queued. Applied and duplicate events are both removed from the
 * queue - a duplicate means the server already has it, which is success.
 */
export async function flushQueue(): Promise<FlushResult> {
  const events = await listPending();
  if (events.length === 0) return { applied: 0, duplicates: 0, failed: 0 };

  const response = await fetch("/api/v1/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: clientId(),
      events: events.map((e) => ({ type: e.type, clientEventId: e.clientEventId, payload: e.payload })),
    }),
  });

  if (!response.ok) return { applied: 0, duplicates: 0, failed: events.length };

  const body = (await response.json()) as {
    applied: number; duplicates: number; failed: number;
    results: { clientEventId: string; status: string; error?: string }[];
  };

  for (const result of body.results) {
    if (result.status === "applied" || result.status === "duplicate") {
      await remove(result.clientEventId);
    } else {
      const event = events.find((e) => e.clientEventId === result.clientEventId);
      if (event) {
        // Kept for retry, with the reason visible rather than failing silently.
        await withStore("readwrite", (store) =>
          store.put({ ...event, attempts: event.attempts + 1, lastError: result.error }),
        );
      }
    }
  }

  return { applied: body.applied, duplicates: body.duplicates, failed: body.failed };
}

/** Stable per device, so a sync batch can be traced back to the phone that sent it. */
export function clientId(): string {
  const key = "pmops-client-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

/**
 * Submit now if we can, queue if we cannot. The caller does not branch on
 * connectivity - it just gets told whether the record is on the server yet.
 */
export async function submitOrQueue(
  type: QueuedEventType,
  endpoint: string,
  payload: unknown,
): Promise<{ synced: boolean; id?: string; error?: string }> {
  const clientEventId = crypto.randomUUID();

  if (navigator.onLine) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": clientEventId },
        body: JSON.stringify(payload),
      });
      if (response.ok) return { synced: true, id: (await response.json()).id };

      const body = await response.json().catch(() => ({}));
      // A rejection the server will keep rejecting (incomplete proof, bad input)
      // must not be queued to retry forever.
      if (response.status >= 400 && response.status < 500) {
        return { synced: false, error: body.error ?? "Rejected", id: undefined };
      }
    } catch {
      // Fall through and queue it.
    }
  }

  await withStore("readwrite", (store) =>
    store.put({ clientEventId, type, payload, queuedAt: new Date().toISOString(), attempts: 0 } satisfies QueuedEvent),
  );
  return { synced: false };
}
