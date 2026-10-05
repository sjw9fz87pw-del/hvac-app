/**
 * Web NFC implementation of `TagWriter`.
 *
 * `NDEFReader` exists on Chrome for Android and essentially nowhere else, so
 * capability is detected rather than assumed. The browser is reached only
 * through a `WebNfcEnvironment`, read fresh on every call, which is what lets
 * the tests drive this with a fake reader and lets it be imported during server
 * rendering without touching `window`.
 */
import { detectBlocker } from "./blocker";
import { NfcUnsupportedError, type LockOutcome, type TagWriter } from "./writer";

export interface NdefRecordLike { recordType: string; data?: DataView }
export interface NdefMessageLike { records: NdefRecordLike[] }
export interface NdefReadingEventLike extends Event { message: NdefMessageLike }
export interface NdefReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: { records: { recordType: string; data: string }[] }, options?: { signal?: AbortSignal }): Promise<void>;
  /** Chrome 100+. Absent on older builds, hence `canLock`. */
  makeReadOnly?(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: "reading", listener: (event: NdefReadingEventLike) => void): void;
  addEventListener(type: "readingerror", listener: () => void): void;
}
export type NdefReaderCtor = new () => NdefReaderLike;

export interface WebNfcEnvironment {
  inBrowser: boolean;
  NDEFReader: NdefReaderCtor | null;
  userAgent: string;
  maxTouchPoints: number;
}

/** What the real browser reports. Safe to call on the server. */
export function browserEnvironment(): WebNfcEnvironment {
  const inBrowser = typeof window !== "undefined";
  const g = globalThis as unknown as { NDEFReader?: NdefReaderCtor };
  return {
    inBrowser,
    NDEFReader: inBrowser ? g.NDEFReader ?? null : null,
    userAgent: inBrowser ? navigator.userAgent : "",
    maxTouchPoints: inBrowser ? navigator.maxTouchPoints ?? 0 : 0,
  };
}

function decodeUrlRecord(message: NdefMessageLike): string | null {
  for (const record of message.records) {
    if (record.recordType !== "url" && record.recordType !== "absolute-url") continue;
    if (!record.data) continue;
    return new TextDecoder().decode(record.data);
  }
  return null;
}

export function createWebNfcWriter(env: () => WebNfcEnvironment = browserEnvironment): TagWriter {
  function reader(): NdefReaderCtor | null {
    const e = env();
    return e.inBrowser ? e.NDEFReader : null;
  }

  function canLock(): boolean {
    const Ctor = reader();
    return Boolean(Ctor && typeof Ctor.prototype?.makeReadOnly === "function");
  }

  return {
    kind: "web-nfc",

    isSupported: () => reader() !== null,

    blocker() {
      const e = env();
      return detectBlocker({
        inBrowser: e.inBrowser,
        hasReader: e.NDEFReader !== null,
        userAgent: e.userAgent,
        maxTouchPoints: e.maxTouchPoints,
      });
    },

    async write(url, timeoutMs = 25_000) {
      const Ctor = reader();
      if (!Ctor) throw new NfcUnsupportedError();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        await new Ctor().write({ records: [{ recordType: "url", data: url }] }, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    },

    readOnce(timeoutMs = 25_000) {
      const Ctor = reader();
      if (!Ctor) return Promise.reject(new NfcUnsupportedError());

      const controller = new AbortController();
      const instance = new Ctor();

      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          controller.abort();
          reject(new Error("No tag detected. Hold the phone against the tag and try again."));
        }, timeoutMs);

        instance.addEventListener("reading", (event) => {
          const url = decodeUrlRecord(event.message);
          clearTimeout(timer);
          controller.abort();
          if (url) resolve(url);
          else reject(new Error("That tag is not one of ours."));
        });
        instance.addEventListener("readingerror", () => {
          clearTimeout(timer);
          controller.abort();
          reject(new Error("Could not read the tag. Try repositioning the phone."));
        });

        instance.scan({ signal: controller.signal }).catch((error) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error("NFC scan failed"));
        });
      });
    },

    canLock,

    async lock(timeoutMs = 15_000): Promise<LockOutcome> {
      const Ctor = reader();
      if (!Ctor) return { locked: false, reason: "This device cannot write NFC tags.", unsupported: true };
      if (!canLock()) {
        return {
          locked: false,
          unsupported: true,
          reason: "This browser cannot lock tags. The tag works, but can still be rewritten.",
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        await new Ctor().makeReadOnly!({ signal: controller.signal });
        return { locked: true };
      } catch (error) {
        return {
          locked: false,
          reason: error instanceof Error ? error.message : "The tag could not be locked.",
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
