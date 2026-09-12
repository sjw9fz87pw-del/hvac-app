"use client";

/**
 * Web NFC transport.
 *
 * `NDEFReader` exists on Chrome for Android and essentially nowhere else, so
 * capability is detected rather than assumed, and every flow that uses it has a
 * QR or manual path that reaches the identical server endpoint. No button is
 * ever shown that cannot work on the device looking at it.
 */

interface NdefRecordLike { recordType: string; data?: DataView }
interface NdefMessageLike { records: NdefRecordLike[] }
interface NdefReadingEventLike extends Event { message: NdefMessageLike }
interface NdefReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: { records: { recordType: string; data: string }[] }, options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: "reading", listener: (event: NdefReadingEventLike) => void): void;
  addEventListener(type: "readingerror", listener: () => void): void;
}

type NdefReaderCtor = new () => NdefReaderLike;

function reader(): NdefReaderCtor | null {
  const ctor = (globalThis as unknown as { NDEFReader?: NdefReaderCtor }).NDEFReader;
  return ctor ?? null;
}

export function isNfcSupported(): boolean {
  return typeof window !== "undefined" && reader() !== null;
}

export class NfcUnsupportedError extends Error {
  constructor() {
    super("This device cannot read NFC tags in the browser. Use the QR code instead.");
    this.name = "NfcUnsupportedError";
  }
}

function decodeUrlRecord(message: NdefMessageLike): string | null {
  for (const record of message.records) {
    if (record.recordType !== "url" && record.recordType !== "absolute-url") continue;
    if (!record.data) continue;
    return new TextDecoder().decode(record.data);
  }
  return null;
}

/** Read one tag, then stop. */
export async function readTagOnce(timeoutMs = 25_000): Promise<string> {
  const Ctor = reader();
  if (!Ctor) throw new NfcUnsupportedError();

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
}

/** Write a URL record to a blank tag. */
export async function writeTag(url: string, timeoutMs = 25_000): Promise<void> {
  const Ctor = reader();
  if (!Ctor) throw new NfcUnsupportedError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await new Ctor().write({ records: [{ recordType: "url", data: url }] }, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
