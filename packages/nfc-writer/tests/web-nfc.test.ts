import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWebNfcWriter, browserEnvironment,
  type NdefReaderCtor, type NdefReadingEventLike, type WebNfcEnvironment,
} from "../src";

const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

type Scenario =
  | { kind: "reads"; url: string }
  | { kind: "reads-text" }
  | { kind: "read-error" }
  | { kind: "scan-rejects"; error: Error }
  | { kind: "silent" };

/** A stand-in for Chrome's NDEFReader that does what the scenario says. */
function fakeReader(opts: { scenario?: Scenario; lock?: "works" | "fails" | "absent"; writeFails?: Error; writeHangs?: boolean } = {}) {
  const writes: unknown[] = [];
  const signals: AbortSignal[] = [];
  let locks = 0;
  const scenario = opts.scenario ?? { kind: "silent" };

  class FakeReader {
    private listeners: Record<string, ((e: NdefReadingEventLike) => void)[]> = {};
    addEventListener(type: string, fn: (e: NdefReadingEventLike) => void) {
      (this.listeners[type] ??= []).push(fn);
    }
    private emit(type: string, e?: NdefReadingEventLike) {
      for (const fn of this.listeners[type] ?? []) fn(e as NdefReadingEventLike);
    }
    async scan(options?: { signal?: AbortSignal }) {
      if (options?.signal) signals.push(options.signal);
      if (scenario.kind === "scan-rejects") throw scenario.error;
      queueMicrotask(() => {
        if (scenario.kind === "reads") {
          const data = new DataView(new TextEncoder().encode(scenario.url).buffer);
          this.emit("reading", { message: { records: [{ recordType: "url", data }] } } as unknown as NdefReadingEventLike);
        } else if (scenario.kind === "reads-text") {
          const data = new DataView(new TextEncoder().encode("hello").buffer);
          this.emit("reading", { message: { records: [{ recordType: "text", data }] } } as unknown as NdefReadingEventLike);
        } else if (scenario.kind === "read-error") {
          this.emit("readingerror");
        }
      });
    }
    async write(message: unknown, options?: { signal?: AbortSignal }) {
      if (options?.signal) signals.push(options.signal);
      if (opts.writeFails) throw opts.writeFails;
      if (opts.writeHangs) {
        // Like Chrome: waits for a tag until the signal gives up on it.
        await new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("AbortError"))));
      }
      writes.push(message);
    }
  }
  if (opts.lock !== "absent") {
    (FakeReader.prototype as unknown as { makeReadOnly: () => Promise<void> }).makeReadOnly = async function () {
      locks += 1;
      if (opts.lock === "fails") throw new Error("Tag moved away before locking finished");
    };
  }

  return { Ctor: FakeReader as unknown as NdefReaderCtor, writes, signals, locks: () => locks };
}

function androidWith(Ctor: NdefReaderCtor | null): () => WebNfcEnvironment {
  return () => ({ inBrowser: true, NDEFReader: Ctor, userAgent: ANDROID_CHROME, maxTouchPoints: 5 });
}

afterEach(() => vi.useRealTimers());

describe("Web NFC writer", () => {
  it("is supported only where NDEFReader exists", () => {
    expect(createWebNfcWriter(androidWith(fakeReader().Ctor)).isSupported()).toBe(true);
    expect(createWebNfcWriter(androidWith(null)).isSupported()).toBe(false);
  });

  it("says why on an iPhone", () => {
    const writer = createWebNfcWriter(() => ({ inBrowser: true, NDEFReader: null, userAgent: IPHONE, maxTouchPoints: 5 }));
    expect(writer.isSupported()).toBe(false);
    expect(writer.blocker()).toBe("ios");
  });

  it("is inert during server rendering", async () => {
    const writer = createWebNfcWriter(() => ({ inBrowser: false, NDEFReader: fakeReader().Ctor, userAgent: "", maxTouchPoints: 0 }));
    expect(writer.isSupported()).toBe(false);
    expect(writer.blocker()).toBeNull();
    expect(writer.canLock()).toBe(false);
    await expect(writer.write("https://x/t/p")).rejects.toThrow(/cannot read NFC/);
  });

  it("reads the real browser without crashing when there is no window", () => {
    expect(browserEnvironment()).toEqual({ inBrowser: false, NDEFReader: null, userAgent: "", maxTouchPoints: 0 });
  });

  it("writes exactly one URL record and nothing else", async () => {
    const reader = fakeReader();
    await createWebNfcWriter(androidWith(reader.Ctor)).write("https://app.example.com/t/v1.a.b.c");
    expect(reader.writes).toEqual([{ records: [{ recordType: "url", data: "https://app.example.com/t/v1.a.b.c" }] }]);
  });

  it("gives up on a write when no tag is held to the phone in time", async () => {
    vi.useFakeTimers();
    const reader = fakeReader({ writeHangs: true });
    const pending = createWebNfcWriter(androidWith(reader.Ctor)).write("https://x/t/p", 1_000);
    const assertion = expect(pending).rejects.toThrow("AbortError");
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(reader.writes).toEqual([]);
  });

  it("passes a write failure through untouched", async () => {
    const reader = fakeReader({ writeFails: new Error("NotAllowedError") });
    await expect(createWebNfcWriter(androidWith(reader.Ctor)).write("https://x/t/p")).rejects.toThrow("NotAllowedError");
  });

  it("returns the URL on a tapped tag and stops scanning", async () => {
    const reader = fakeReader({ scenario: { kind: "reads", url: "https://app.example.com/t/v1.a.b.c" } });
    await expect(createWebNfcWriter(androidWith(reader.Ctor)).readOnce()).resolves.toBe("https://app.example.com/t/v1.a.b.c");
    expect(reader.signals[0].aborted).toBe(true);
  });

  it("rejects a tag with no URL on it", async () => {
    const reader = fakeReader({ scenario: { kind: "reads-text" } });
    await expect(createWebNfcWriter(androidWith(reader.Ctor)).readOnce()).rejects.toThrow("That tag is not one of ours.");
  });

  it("rejects an unreadable tag", async () => {
    const reader = fakeReader({ scenario: { kind: "read-error" } });
    await expect(createWebNfcWriter(androidWith(reader.Ctor)).readOnce()).rejects.toThrow(/Could not read the tag/);
  });

  it("rejects when the scan cannot start", async () => {
    const reader = fakeReader({ scenario: { kind: "scan-rejects", error: new Error("NFC permission denied") } });
    await expect(createWebNfcWriter(androidWith(reader.Ctor)).readOnce()).rejects.toThrow("NFC permission denied");
  });

  it("gives up when no tag is tapped in time", async () => {
    vi.useFakeTimers();
    const reader = fakeReader({ scenario: { kind: "silent" } });
    const pending = createWebNfcWriter(androidWith(reader.Ctor)).readOnce(5_000);
    const assertion = expect(pending).rejects.toThrow(/No tag detected/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(reader.signals[0].aborted).toBe(true);
  });

  it("locks when the browser can", async () => {
    const reader = fakeReader({ lock: "works" });
    const writer = createWebNfcWriter(androidWith(reader.Ctor));
    expect(writer.canLock()).toBe(true);
    await expect(writer.lock()).resolves.toEqual({ locked: true });
    expect(reader.locks()).toBe(1);
  });

  it("reports, rather than throws, a lock that fails", async () => {
    const reader = fakeReader({ lock: "fails" });
    await expect(createWebNfcWriter(androidWith(reader.Ctor)).lock())
      .resolves.toEqual({ locked: false, reason: "Tag moved away before locking finished" });
  });

  it("says plainly when the browser can write but not lock", async () => {
    const reader = fakeReader({ lock: "absent" });
    const writer = createWebNfcWriter(androidWith(reader.Ctor));
    expect(writer.isSupported()).toBe(true);
    expect(writer.canLock()).toBe(false);
    await expect(writer.lock()).resolves.toMatchObject({ locked: false, unsupported: true });
  });
});
