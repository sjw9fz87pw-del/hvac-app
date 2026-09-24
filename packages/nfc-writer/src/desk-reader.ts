/**
 * `TagWriter` for a USB NFC reader plugged into the computer the app is open on
 * (an ACR122U on the office Mac mini, for instance).
 *
 * A web page cannot talk to USB directly, so a small local bridge
 * (`desk-reader/desk_reader.py`) owns the reader and answers on
 * `http://127.0.0.1:8766`. This writer is that bridge's client and nothing
 * more: the flow in `./pair` drives it exactly as it drives a phone.
 *
 * `isSupported()` has to answer synchronously, and asking the bridge is a
 * network call, so the answer comes from the last `probe()`. Nothing is probed
 * on its own: from a public page Chrome asks the person before it lets a site
 * reach this computer, and a phone has no business being asked at all. The
 * screen decides when to probe.
 *
 * The tag sits still on the reader for the whole pairing, so the uid seen at
 * write time is passed back on the read-back and the lock. If someone swaps
 * tags in between, the bridge refuses instead of locking the wrong one.
 */
import { NfcUnsupportedError, type LockOutcome, type NfcBlocker, type TagWriter } from "./writer";

export const DESK_READER_URL = "http://127.0.0.1:8766";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface DeskReaderOptions {
  /** Where the bridge listens. */
  baseUrl?: string;
  fetch?: Fetch;
  /** How long `probe()` waits for the bridge before deciding it is not there. */
  probeTimeoutMs?: number;
}

export interface DeskReaderStatus {
  /** The bridge answered. */
  bridge: boolean;
  /** Name of the USB reader the bridge sees, or null. */
  reader: string | null;
  /** The tag on the reader right now, if any. */
  tag: { uid: string; type: string } | null;
  /** What to tell the person when something is missing. */
  hint: string | null;
}

export interface DeskReaderWriter extends TagWriter {
  /** Ask the bridge what is plugged in. Updates what `isSupported()` returns. Never throws. */
  probe(): Promise<DeskReaderStatus>;
}

interface BridgeResult {
  ok?: boolean;
  error?: string;
  uid?: string;
  url?: string;
  locked?: boolean;
  reason?: string;
  unsupported?: boolean;
}

/** A tag has this long to be put on the reader before a write gives up. */
const WRITE_WAIT_MS = 20_000;
/** Slack on top of the bridge's own wait, so the bridge times out first and says why. */
const HTTP_SLACK_MS = 5_000;

const NOT_RUNNING =
  "The desk reader is not running on this computer. Start it with `python3 packages/nfc-writer/desk-reader/desk_reader.py`, then try again.";

export function createDeskReaderWriter(opts: DeskReaderOptions = {}): DeskReaderWriter {
  const base = (opts.baseUrl ?? DESK_READER_URL).replace(/\/$/, "");
  const doFetch: Fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const probeTimeoutMs = opts.probeTimeoutMs ?? 1_500;

  let available = false;
  /** The tag the last successful write went to. */
  let writtenUid: string | null = null;

  async function call(path: string, init: RequestInit, timeoutMs: number): Promise<BridgeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, { ...init, signal: controller.signal });
    } catch {
      available = false;
      throw new Error(NOT_RUNNING);
    } finally {
      clearTimeout(timer);
    }
    const body = (await response.json().catch(() => ({}))) as BridgeResult;
    if (!response.ok && !body.error) body.error = `The desk reader answered ${response.status}.`;
    return body;
  }

  function post(path: string, body: unknown, timeoutMs: number) {
    return call(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, timeoutMs);
  }

  return {
    kind: "desk-reader",

    isSupported: () => available,

    blocker(): NfcBlocker {
      return available ? null : "desktop";
    },

    async probe(): Promise<DeskReaderStatus> {
      try {
        const body = (await call("/status", { method: "GET" }, probeTimeoutMs)) as BridgeResult & {
          reader?: string | null;
          tag?: { uid?: string; type?: string } | null;
          hint?: string;
        };
        available = Boolean(body.reader);
        return {
          bridge: true,
          reader: body.reader ?? null,
          tag: body.tag ? { uid: body.tag.uid ?? "", type: body.tag.type ?? "unknown" } : null,
          hint: body.hint ?? body.error ?? null,
        };
      } catch {
        available = false;
        return { bridge: false, reader: null, tag: null, hint: NOT_RUNNING };
      }
    },

    async write(url, timeoutMs = WRITE_WAIT_MS) {
      if (!available) throw new NfcUnsupportedError(NOT_RUNNING);
      writtenUid = null;
      const result = await post("/write", { url, waitMs: timeoutMs }, timeoutMs + HTTP_SLACK_MS);
      if (!result.ok) throw new Error(result.error ?? "The desk reader could not write the tag.");
      writtenUid = result.uid ?? null;
    },

    async readOnce(timeoutMs = WRITE_WAIT_MS) {
      if (!available) throw new NfcUnsupportedError(NOT_RUNNING);
      const params = new URLSearchParams({ waitMs: String(timeoutMs) });
      if (writtenUid) params.set("uid", writtenUid);
      const result = await call(`/read?${params}`, { method: "GET" }, timeoutMs + HTTP_SLACK_MS);
      if (!result.ok || !result.url) throw new Error(result.error ?? "No tag on the reader.");
      return result.url;
    },

    canLock: () => available,

    async lock(timeoutMs = 15_000): Promise<LockOutcome> {
      if (!available) return { locked: false, reason: NOT_RUNNING, unsupported: true };
      try {
        const result = await post("/lock", { uid: writtenUid }, timeoutMs);
        if (result.locked) return { locked: true };
        return {
          locked: false,
          reason: result.reason ?? result.error ?? "The tag could not be locked.",
          ...(result.unsupported ? { unsupported: true } : {}),
        };
      } catch (error) {
        return { locked: false, reason: error instanceof Error ? error.message : "The tag could not be locked." };
      }
    },
  };
}
