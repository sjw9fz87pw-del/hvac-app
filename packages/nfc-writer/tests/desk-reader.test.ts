import { describe, expect, it } from "vitest";
import {
  createDeskReaderWriter, pairTagToUnit, pairPhaseLabel, pickTagWriter, createWebNfcWriter, DESK_READER_URL,
  macAppTransport, isInMacApp,
} from "../src";
import { fakeApi, type Log } from "./fakes";

interface Call { method: string; path: string; body: Record<string, unknown> | null }

/**
 * A stand-in for `desk_reader.py`: one tag that stays on the reader, answering
 * the same JSON the bridge does. The bridge's own tag handling has its own
 * tests in `desk-reader/test_desk_reader.py`.
 */
function fakeBridge(opts: {
  down?: boolean;
  reader?: string | null;
  uid?: string;
  writeError?: string;
  lock?: { locked: boolean; reason?: string; unsupported?: boolean };
  swapTagAfterWrite?: boolean;
} = {}) {
  const calls: Call[] = [];
  let onTag: string | null = null;
  let uid = opts.uid ?? "04A1B2C3D4E5F6";

  async function fetch(input: string, init?: RequestInit): Promise<Response> {
    if (opts.down) throw new TypeError("Failed to fetch");
    const url = new URL(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method: init?.method ?? "GET", path: url.pathname + url.search, body });
    const json = (obj: unknown) => new Response(JSON.stringify(obj), { status: 200 });

    switch (url.pathname) {
      case "/status":
        return json({ reader: opts.reader === undefined ? "ACS ACR122U PICC Interface" : opts.reader, tag: null, hint: "Put a tag on the reader." });
      case "/write":
        if (opts.writeError) return json({ ok: false, error: opts.writeError });
        onTag = String(body?.url);
        const written = uid;
        if (opts.swapTagAfterWrite) uid = "04FFFFFFFFFFFF";
        return json({ ok: true, uid: written, type: "NTAG213" });
      case "/read": {
        const want = url.searchParams.get("uid");
        if (want && want !== uid) return json({ ok: false, error: "A different tag is on the reader now. Put the one just written back." });
        return onTag ? json({ ok: true, uid, url: onTag }) : json({ ok: false, error: "This tag is blank or not one of ours." });
      }
      case "/lock":
        if (body?.uid && body.uid !== uid) return json({ locked: false, reason: "A different tag is on the reader now." });
        return json(opts.lock ?? { locked: true, uid });
      default:
        return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }
  }
  return { fetch, calls };
}

describe("desk reader writer", () => {
  it("is not used until a probe finds a reader", async () => {
    const bridge = fakeBridge();
    const desk = createDeskReaderWriter({ fetch: bridge.fetch });
    expect(desk.isSupported()).toBe(false);
    expect(bridge.calls).toEqual([]);

    const status = await desk.probe();
    expect(status).toMatchObject({ bridge: true, reader: "ACS ACR122U PICC Interface" });
    expect(desk.isSupported()).toBe(true);
    expect(desk.blocker()).toBeNull();
  });

  it("talks to the bridge on loopback by default", async () => {
    const seen: string[] = [];
    const desk = createDeskReaderWriter({ fetch: async (u) => { seen.push(u); throw new TypeError("offline"); } });
    await desk.probe();
    expect(seen).toEqual([`${DESK_READER_URL}/status`]);
    expect(DESK_READER_URL).toBe("http://127.0.0.1:8766");
  });

  it("says how to start the bridge when it is not running, and never throws from probe", async () => {
    const desk = createDeskReaderWriter({ fetch: fakeBridge({ down: true }).fetch });
    const status = await desk.probe();
    expect(status.bridge).toBe(false);
    expect(status.hint).toMatch(/Clearline app/);
    expect(desk.isSupported()).toBe(false);
    expect(desk.blocker()).toBe("desktop");
  });

  it("is not supported when the bridge runs but no reader is plugged in", async () => {
    const desk = createDeskReaderWriter({ fetch: fakeBridge({ reader: null }).fetch });
    await desk.probe();
    expect(desk.isSupported()).toBe(false);
  });

  it("goes ahead of Web NFC once a reader is found, and Web NFC still explains otherwise", async () => {
    const desk = createDeskReaderWriter({ fetch: fakeBridge().fetch });
    const web = createWebNfcWriter(() => ({ inBrowser: true, NDEFReader: null, userAgent: "Macintosh", maxTouchPoints: 0 }));
    expect(pickTagWriter([desk, web]).kind).toBe("web-nfc");
    await desk.probe();
    expect(pickTagWriter([desk, web]).kind).toBe("desk-reader");
  });

  it("surfaces the bridge's own words when a write fails", async () => {
    const desk = createDeskReaderWriter({ fetch: fakeBridge({ writeError: "This tag is locked and cannot be rewritten. Use a blank tag." }).fetch });
    await desk.probe();
    await expect(desk.write("https://a.co/t/x")).rejects.toThrow(/locked/);
  });

  it("reads back and locks only the tag it wrote", async () => {
    const bridge = fakeBridge();
    const desk = createDeskReaderWriter({ fetch: bridge.fetch });
    await desk.probe();
    await desk.write("https://a.co/t/x", 5_000);
    expect(await desk.readOnce()).toBe("https://a.co/t/x");
    expect(await desk.lock()).toEqual({ locked: true });

    expect(bridge.calls.find((c) => c.path === "/write")?.body).toEqual({ url: "https://a.co/t/x", waitMs: 5_000 });
    expect(bridge.calls.find((c) => c.path.startsWith("/read"))?.path).toContain("uid=04A1B2C3D4E5F6");
    expect(bridge.calls.find((c) => c.path === "/lock")?.body).toEqual({ uid: "04A1B2C3D4E5F6" });
  });

  it("scans whatever tag is on the reader when it is not reading back a write", async () => {
    const bridge = fakeBridge();
    const desk = createDeskReaderWriter({ fetch: bridge.fetch });
    await desk.probe();
    await desk.write("https://a.co/t/x");
    await desk.readOnce();
    await desk.readOnce();
    const reads = bridge.calls.filter((c) => c.path.startsWith("/read")).map((c) => c.path);
    expect(reads[0]).toContain("uid=");
    expect(reads[1]).not.toContain("uid=");
  });

  it("reports a lock failure instead of throwing", async () => {
    const desk = createDeskReaderWriter({ fetch: fakeBridge({ lock: { locked: false, reason: "Locking is only supported on NTAG213/215/216", unsupported: true } }).fetch });
    await desk.probe();
    await desk.write("https://a.co/t/x");
    expect(await desk.lock()).toEqual({ locked: false, reason: "Locking is only supported on NTAG213/215/216", unsupported: true });
  });

  it("turns a bridge that vanished mid-lock into an outcome, not an exception", async () => {
    let up = true;
    const bridge = fakeBridge();
    const desk = createDeskReaderWriter({ fetch: (u, i) => (up ? bridge.fetch(u, i) : Promise.reject(new TypeError("gone"))) });
    await desk.probe();
    await desk.write("https://a.co/t/x");
    up = false;
    const outcome = await desk.lock();
    expect(outcome.locked).toBe(false);
  });
});

describe("pairing through the desk reader", () => {
  it("runs the same safe order as a phone: write, read back, verify, link, lock", async () => {
    const log: Log = [];
    const bridge = fakeBridge();
    const api = fakeApi(log);
    const writer = createDeskReaderWriter({ fetch: bridge.fetch });
    await writer.probe();

    const outcome = await pairTagToUnit({ organizationId: "org_1", unitId: "unit_42", lock: true, writer, api });

    expect(outcome).toEqual({ tagId: "tag_1", lockNote: null });
    expect(bridge.calls.map((c) => c.path.split("?")[0])).toEqual(["/status", "/write", "/read", "/lock"]);
    expect(log).toEqual([
      "server:mint org_1",
      "server:verify tag_1",
      "server:pair tag_1 -> unit_42",
      "server:record-lock tag_1 locked",
    ]);
  });

  it("links nothing when the tag is swapped before the read-back", async () => {
    const log: Log = [];
    const api = fakeApi(log);
    const writer = createDeskReaderWriter({ fetch: fakeBridge({ swapTagAfterWrite: true }).fetch });
    await writer.probe();

    await expect(pairTagToUnit({ organizationId: "org_1", unitId: "unit_42", lock: true, writer, api })).rejects.toThrow(/different tag/);
    expect(log.some((l) => l.startsWith("server:pair"))).toBe(false);
    expect(api.writeFailures).toHaveLength(1);
  });

  it("describes a desk reader's steps without mentioning a phone", () => {
    expect(pairPhaseLabel("writing", "desk-reader")).not.toMatch(/phone|tap/i);
    expect(pairPhaseLabel("verifying", "desk-reader")).not.toMatch(/phone|tap/i);
    expect(pairPhaseLabel("writing")).toMatch(/phone/);
  });
});

describe("inside the Clearline Mac app", () => {
  it("sends each operation to the app's message handler and returns its answer", async () => {
    const sent: unknown[] = [];
    const handler = {
      async postMessage(message: unknown) {
        sent.push(message);
        const op = (message as { op: string }).op;
        if (op === "status") return { reader: "ACS ACR122U PICC Interface", tag: null, hint: null };
        if (op === "write") return { ok: true, uid: "04AA", type: "NTAG213" };
        if (op === "read") return { ok: true, uid: "04AA", url: "https://a.co/t/x" };
        return { locked: true };
      },
    };
    const desk = createDeskReaderWriter({ transport: macAppTransport(() => handler) });
    expect((await desk.probe()).reader).toBe("ACS ACR122U PICC Interface");
    await desk.write("https://a.co/t/x", 3_000);
    expect(await desk.readOnce()).toBe("https://a.co/t/x");
    expect(await desk.lock()).toEqual({ locked: true });
    expect(sent).toEqual([
      { op: "status" },
      { op: "write", url: "https://a.co/t/x", waitMs: 3_000 },
      { op: "read", waitMs: 20_000, uid: "04AA" },
      { op: "lock", uid: "04AA" },
    ]);
  });

  it("is not supported outside the app", async () => {
    expect(isInMacApp()).toBe(false);
    const desk = createDeskReaderWriter({ transport: macAppTransport(() => null) });
    expect((await desk.probe()).bridge).toBe(false);
    expect(desk.isSupported()).toBe(false);
  });

  it("gives up on an app that never answers", async () => {
    const desk = createDeskReaderWriter({
      transport: macAppTransport(() => ({ postMessage: () => new Promise(() => {}) })),
      probeTimeoutMs: 20,
    });
    expect((await desk.probe()).bridge).toBe(false);
  });
});
