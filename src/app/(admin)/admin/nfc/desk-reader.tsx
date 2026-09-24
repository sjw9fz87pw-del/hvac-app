"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Divider, List, Pill, Row } from "@/components/ui/primitives";
import { createTag, isInMacApp, pairPhaseLabel, type CreatePhase, type PairPhase } from "@pmops/nfc-writer";
import { deskReader, pairWithReader, rememberDeskReader, rememberedDeskReader, tagApi } from "@/lib/nfc/writer";

/**
 * The USB reader on the office computer, inside the NFC console.
 *
 * - "Create tag" writes and verifies a blank tag as stock for one customer,
 *   linked to nothing yet, so a batch can be made ahead of time.
 * - "Assets without a tag" pairs each unit in place: a blank tag is written
 *   first, a created one is just read and linked. Every tag goes on a unit
 *   that already exists; nothing here creates units.
 * - "Scan a tag" reads whatever tag is on the reader and opens it, the same as
 *   tapping it with a phone.
 */

type ReaderState =
  | { state: "idle" }
  | { state: "connecting" }
  | { state: "ready"; reader: string }
  | { state: "unavailable"; hint: string };

// One reader per computer, shared by the bar and the list.
let current: ReaderState = { state: "idle" };
const listeners = new Set<() => void>();
function setReader(next: ReaderState) {
  current = next;
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function connect() {
  setReader({ state: "connecting" });
  const status = await deskReader.probe();
  if (deskReader.isSupported() && status.reader) {
    rememberDeskReader();
    setReader({ state: "ready", reader: status.reader });
  } else {
    setReader({ state: "unavailable", hint: status.hint ?? "No reader found." });
  }
}

function useReader(): ReaderState {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

export interface CustomerOption { id: string; name: string }

export function DeskReaderBar({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const reader = useReader();
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [creating, setCreating] = useState<CreatePhase | "starting" | null>(null);
  const [created, setCreated] = useState(0);
  const [createNote, setCreateNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function create() {
    setCreateNote(null);
    setScanError(null);
    setCreating("starting");
    try {
      await createTag({ organizationId: customerId, writer: deskReader, api: tagApi, onPhase: setCreating });
      setCreated((n) => n + 1);
      const name = customers.find((c) => c.id === customerId)?.name ?? "this customer";
      setCreateNote({ ok: true, text: `Tag created for ${name}. Take it off and put the next blank tag on, or pair it to a unit below.` });
    } catch (e) {
      setCreateNote({ ok: false, text: `${e instanceof Error ? e.message : "Could not create the tag."} Nothing was saved as usable.` });
    } finally {
      setCreating(null);
    }
  }

  // The Mac app always has its reader; a browser that has used the reader
  // before reconnects without being asked.
  useEffect(() => {
    if (current.state === "idle" && (isInMacApp() || rememberedDeskReader())) void connect();
  }, []);

  async function scan() {
    setScanError(null);
    setScanning(true);
    try {
      const url = await deskReader.readOnce(15_000);
      const path = new URL(url).pathname;
      if (!path.startsWith("/t/")) throw new Error("That tag is not one of ours.");
      router.push(path);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Could not read the tag.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <Card style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 650, fontSize: 14.5 }}>USB reader</span>
          {reader.state === "ready" ? <Pill tone="good">Connected</Pill> : null}
          {reader.state === "unavailable" ? <Pill tone="warn">Not found</Pill> : null}
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4, lineHeight: 1.5 }}>
          {reader.state === "ready"
            ? `${reader.reader}. Put a tag flat on it to create, pair or scan.`
            : reader.state === "unavailable"
              ? reader.hint
              : "Create, pair and scan tags with the reader plugged into this computer."}
        </p>
        {scanError ? <p style={{ fontSize: 13, color: "var(--bad)", marginTop: 4 }}>{scanError}</p> : null}
        {createNote ? (
          <p style={{ fontSize: 13, color: createNote.ok ? "var(--ink-soft)" : "var(--bad)", marginTop: 4 }}>
            {createNote.text}{createNote.ok && created > 1 ? ` ${created} created so far.` : ""}
          </p>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {reader.state === "ready" ? (
          <>
            {customers.length > 1 ? (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                aria-label="Customer the new tag is for"
                style={{ minHeight: 38, borderRadius: 11, padding: "0 10px", background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--line-strong)", fontSize: 13.5 }}
              >
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : null}
            <Button size="sm" onClick={create} disabled={creating !== null || scanning || !customerId}>
              {creating === null ? "Create tag" : creating === "starting" ? "Starting…" : pairPhaseLabel(creating, "desk-reader")}
            </Button>
            <Button size="sm" variant="secondary" onClick={scan} disabled={scanning || creating !== null}>
              {scanning ? "Reading…" : "Scan a tag"}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={connect} disabled={reader.state === "connecting"}>
            {reader.state === "connecting" ? "Looking…" : reader.state === "unavailable" ? "Try again" : "Connect reader"}
          </Button>
        )}
      </div>
    </Card>
  );
}

export interface UntaggedUnit {
  id: string;
  organizationId: string;
  name: string;
  subtitle: string;
}

export function UntaggedPairList({ units }: { units: UntaggedUnit[] }) {
  const reader = useReader();
  const [lock, setLock] = useState(true);
  const [busy, setBusy] = useState<{ id: string; phase: PairPhase | null } | null>(null);
  const [paired, setPaired] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ready = reader.state === "ready";

  async function pair(unit: UntaggedUnit) {
    setErrors(({ [unit.id]: _, ...rest }) => rest);
    setBusy({ id: unit.id, phase: null });
    try {
      const outcome = await pairWithReader({
        organizationId: unit.organizationId,
        unitId: unit.id,
        lock,
        onPhase: (phase) => setBusy({ id: unit.id, phase }),
      });
      setPaired((p) => ({ ...p, [unit.id]: outcome.lockNote }));
    } catch (e) {
      setErrors((x) => ({ ...x, [unit.id]: `${e instanceof Error ? e.message : "Pairing failed"} Nothing was linked.` }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {ready ? (
        <label style={{ display: "flex", alignItems: "center", gap: 9, margin: "0 0 10px", fontSize: 13.5, cursor: "pointer" }}>
          <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span>Lock each tag so it cannot be rewritten <span style={{ color: "var(--ink-faint)" }}>— permanent</span></span>
        </label>
      ) : null}
      <List>
        {units.map((unit, index) => {
          const done = unit.id in paired;
          const mine = busy?.id === unit.id;
          const right = done ? (
            <Pill tone="good">Paired</Pill>
          ) : ready ? (
            <div style={{ width: 150 }}>
              <Button size="sm" onClick={() => pair(unit)} disabled={busy !== null}>
                {mine ? (busy.phase ? pairPhaseLabel(busy.phase, "desk-reader") : "Starting…") : "Pair with reader"}
              </Button>
            </div>
          ) : (
            <Pill tone="warn">Pair a tag →</Pill>
          );
          const note = errors[unit.id] ?? (done && paired[unit.id] ? `Paired, but not locked: ${paired[unit.id]}` : null);
          return (
            <div key={unit.id}>
              {index > 0 ? <Divider /> : null}
              {/* With the reader connected the row pairs in place; without it, it
                  opens the unit page, which can pair from a phone. */}
              <Row href={ready ? undefined : `/admin/equipment/${unit.id}`} title={unit.name} subtitle={unit.subtitle} right={right} />
              {note ? (
                <p style={{ fontSize: 13, color: errors[unit.id] ? "var(--bad)" : "var(--ink-soft)", margin: "-6px 16px 12px" }}>{note}</p>
              ) : null}
            </div>
          );
        })}
      </List>
    </>
  );
}
