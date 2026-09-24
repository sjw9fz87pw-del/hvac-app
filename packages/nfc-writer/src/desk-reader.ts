/**
 * `TagWriter` for a USB NFC reader plugged into the office computer (an
 * ACR122U on the Mac mini, for instance).
 *
 * A web page cannot talk to USB itself, so something native owns the reader
 * and this writer is its client. There are two, answering the same four
 * operations (status, write, read, lock) with the same JSON:
 *
 * - The Clearline Mac app (`desktop/mac`), which shows the site in its own
 *   window and has the reader built in. Reached through
 *   `window.webkit.messageHandlers.deskReader`; no permission prompt, nothing
 *   else to run.
 * - The local bridge (`desk-reader/desk_reader.py`) on `127.0.0.1:8766`, for
 *   using the site in an ordinary browser.
 *
 * The Mac app wins when present. The flow in `./pair` drives either exactly as
 * it drives a phone.
 *
 * `isSupported()` has to answer synchronously and asking the reader is not, so
 * the answer comes from the last `probe()`. In a browser nothing is probed on
 * its own: Chrome asks the person before a site reaches this computer, and a
 * phone has no business being asked at all. The screen decides when.
 *
 * The tag sits still on the reader for the whole pairing, so the uid seen at
 * write time is passed back on the read-back that follows it and on the lock.
 * If someone swaps tags in between, the reader refuses instead of verifying or
 * locking the wrong one. A read that does not follow a write (scanning a tag
 * to look it up) takes whatever tag is there.
 */
import { NfcUnsupportedError, type LockOutcome, type NfcBlocker, type TagWriter } from "./writer";

export const DESK_READER_URL = "http://127.0.0.1:8766";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type DeskReaderOp = "status" | "write" | "read" | "lock";

export interface DeskReaderResult {
  ok?: boolean;
  error?: string;
  uid?: string;
  url?: string;
  type?: string;
  locked?: boolean;
  reason?: string;
  unsupported?: boolean;
  reader?: string | null;
  tag?: { uid?: string; type?: string } | null;
  hint?: string | null;
}

/**
 * How an operation reaches the reader. Throws only when the reader's owner
 * cannot be reached at all; a failed operation comes back as a result.
 */
export type DeskReaderTransport = (
  op: DeskReaderOp,
  args: { url?: string; waitMs?: number; uid?: string | null },
  timeoutMs: number,
) => Promise<DeskReaderResult>;

export interface DeskReaderOptions {
  /** How to reach the reader. Defaults to the Mac app when inside it, else the local bridge. */
  transport?: DeskReaderTransport;
  /** For the local bridge: where it listens, and the `fetch` to use. */
  baseUrl?: string;
  fetch?: Fetch;
  /** How long `probe()` waits before deciding nothing is there. */
  probeTimeoutMs?: number;
}

export interface DeskReaderStatus {
  /** Something that owns the reader answered. */
  bridge: boolean;
  /** Name of the USB reader it sees, or null. */
  reader: string | null;
  /** The tag on the reader right now, if any. */
  tag: { uid: string; type: string } | null;
  /** What to tell the person when something is missing. */
  hint: string | null;
}

export interface DeskReaderWriter extends TagWriter {
  /** Ask what is plugged in. Updates what `isSupported()` returns. Never throws. */
  probe(): Promise<DeskReaderStatus>;
}

/** A tag has this long to be put on the reader before a write gives up. */
const WRITE_WAIT_MS = 20_000;
/** Slack on top of the reader's own wait, so it times out first and says why. */
const SLACK_MS = 5_000;

const NOT_RUNNING =
  "No NFC reader/writer connection here. This page is open in a web browser: open the Clearline app on this computer instead (Applications → Clearline), where the reader/writer connects on its own.";

class Unreachable extends Error {}

interface ReplyHandler { postMessage(message: unknown): Promise<unknown> }

function macAppHandler(): ReplyHandler | null {
  const g = globalThis as unknown as { webkit?: { messageHandlers?: { deskReader?: ReplyHandler } } };
  return g.webkit?.messageHandlers?.deskReader ?? null;
}

/** True inside the Clearline Mac app, where the reader is always there to ask. */
export function isInMacApp(): boolean {
  return macAppHandler() !== null;
}

/** The Mac app's built-in reader, through its WebKit message handler. */
export function macAppTransport(handler: () => ReplyHandler | null = macAppHandler): DeskReaderTransport {
  return async (op, args, timeoutMs) => {
    const h = handler();
    if (!h) throw new Unreachable(NOT_RUNNING);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return (await Promise.race([
        h.postMessage({ op, ...args }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("The reader did not answer.")), timeoutMs); }),
      ])) as DeskReaderResult;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** The local bridge over HTTP. */
export function httpTransport(opts: { baseUrl?: string; fetch?: Fetch } = {}): DeskReaderTransport {
  const base = (opts.baseUrl ?? DESK_READER_URL).replace(/\/$/, "");
  const doFetch: Fetch = opts.fetch ?? ((input, init) => fetch(input, init));

  return async (op, args, timeoutMs) => {
    let path: string;
    let init: RequestInit;
    if (op === "status") {
      path = "/status";
      init = { method: "GET" };
    } else if (op === "read") {
      const params = new URLSearchParams({ waitMs: String(args.waitMs ?? 0) });
      if (args.uid) params.set("uid", args.uid);
      path = `/read?${params}`;
      init = { method: "GET" };
    } else {
      path = `/${op}`;
      const body = op === "write" ? { url: args.url, waitMs: args.waitMs } : { uid: args.uid ?? null };
      init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, { ...init, signal: controller.signal });
    } catch {
      throw new Unreachable(NOT_RUNNING);
    } finally {
      clearTimeout(timer);
    }
    const result = (await response.json().catch(() => ({}))) as DeskReaderResult;
    if (!response.ok && !result.error) result.error = `The NFC reader/writer answered ${response.status}.`;
    return result;
  };
}

export function createDeskReaderWriter(opts: DeskReaderOptions = {}): DeskReaderWriter {
  const http = httpTransport(opts);
  const mac = macAppTransport();
  // Decided per call: the Mac app injects its handler after the page starts.
  const transport: DeskReaderTransport =
    opts.transport ?? (opts.fetch ? http : (op, args, t) => (isInMacApp() ? mac : http)(op, args, t));
  const probeTimeoutMs = opts.probeTimeoutMs ?? 1_500;

  let available = false;
  /** The tag the last write or read went to, until it is locked. */
  let writtenUid: string | null = null;
  /** The next read is the read-back of that write. */
  let readBackPending = false;

  async function call(op: DeskReaderOp, args: Parameters<DeskReaderTransport>[1], timeoutMs: number) {
    try {
      return await transport(op, args, timeoutMs);
    } catch (error) {
      if (error instanceof Unreachable) available = false;
      throw error;
    }
  }

  return {
    kind: "desk-reader",

    isSupported: () => available,

    blocker(): NfcBlocker {
      return available ? null : "desktop";
    },

    async probe(): Promise<DeskReaderStatus> {
      try {
        const body = await call("status", {}, probeTimeoutMs);
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
      readBackPending = false;
      const result = await call("write", { url, waitMs: timeoutMs }, timeoutMs + SLACK_MS);
      if (!result.ok) throw new Error(result.error ?? "The NFC reader/writer could not write the tag.");
      writtenUid = result.uid ?? null;
      readBackPending = true;
    },

    async readOnce(timeoutMs = WRITE_WAIT_MS) {
      if (!available) throw new NfcUnsupportedError(NOT_RUNNING);
      const uid = readBackPending ? writtenUid : null;
      readBackPending = false;
      const result = await call("read", { waitMs: timeoutMs, uid }, timeoutMs + SLACK_MS);
      if (!result.ok || !result.url) throw new Error(result.error ?? "No tag on the reader.");
      // A lock that follows goes to this tag and no other.
      writtenUid = result.uid ?? writtenUid;
      return result.url;
    },

    canLock: () => available,

    async lock(timeoutMs = 15_000): Promise<LockOutcome> {
      if (!available) return { locked: false, reason: NOT_RUNNING, unsupported: true };
      try {
        const uid = writtenUid;
        writtenUid = null;
        const result = await call("lock", { uid }, timeoutMs);
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
