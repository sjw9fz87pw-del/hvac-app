import { describe, expect, it } from "vitest";
import { createWebNfcWriter, pairTagToUnit, pickTagWriter, NfcUnsupportedError } from "@pmops/nfc-writer";
import { createNativeIosWriter, type NativeIosEnvironment, type TagNfcPlugin } from "@/lib/nfc/native-ios";

/** An error shaped like a Capacitor plugin rejection: a message and a code. */
function pluginError(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

function fakePlugin(overrides: Partial<TagNfcPlugin> = {}) {
  const calls: string[] = [];
  let onTag = "";
  const plugin: TagNfcPlugin = {
    async isAvailable() { return { available: true }; },
    async write({ url, timeoutMs }) { calls.push(`write ${url} ${timeoutMs}`); onTag = url; return { written: true }; },
    async read({ timeoutMs }) { calls.push(`read ${timeoutMs}`); return { url: onTag }; },
    async lock({ timeoutMs }) { calls.push(`lock ${timeoutMs}`); return { locked: true }; },
    ...overrides,
  };
  return { plugin, calls };
}

const inApp = (plugin: TagNfcPlugin): (() => NativeIosEnvironment) => () => ({ isNativeIos: true, plugin });
const inBrowser = (): NativeIosEnvironment => ({ isNativeIos: false, plugin: null });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("native iOS writer: where it applies", () => {
  it("is supported inside the iPhone app", () => {
    const { plugin } = fakePlugin();
    const writer = createNativeIosWriter(inApp(plugin));
    expect(writer.kind).toBe("native-ios");
    expect(writer.isSupported()).toBe(true);
    expect(writer.blocker()).toBeNull();
    expect(writer.canLock()).toBe(true);
  });

  it("is not supported in a browser, so Web NFC is picked instead", () => {
    const native = createNativeIosWriter(inBrowser);
    const web = createWebNfcWriter(() => ({ inBrowser: true, NDEFReader: class {} as never, userAgent: "Android Chrome/129", maxTouchPoints: 5 }));
    expect(native.isSupported()).toBe(false);
    expect(pickTagWriter([native, web])).toBe(web);
  });

  it("is picked ahead of Web NFC inside the app", () => {
    const { plugin } = fakePlugin();
    const native = createNativeIosWriter(inApp(plugin));
    const web = createWebNfcWriter(() => ({ inBrowser: true, NDEFReader: null, userAgent: "iPhone", maxTouchPoints: 5 }));
    expect(pickTagWriter([native, web])).toBe(native);
  });

  it("stops offering itself once the iPhone says it has no NFC reader", async () => {
    const { plugin } = fakePlugin({ isAvailable: async () => ({ available: false }) });
    const writer = createNativeIosWriter(inApp(plugin));
    expect(writer.isSupported()).toBe(true); // assumed until the plugin answers
    await flush();
    expect(writer.isSupported()).toBe(false);
    expect(writer.blocker()).toBe("ios");
    await expect(writer.write("https://x/t/1")).rejects.toBeInstanceOf(NfcUnsupportedError);
    expect(await writer.lock()).toMatchObject({ locked: false, unsupported: true });
  });

  it("asks the plugin about availability only once", async () => {
    let asked = 0;
    const { plugin } = fakePlugin({ isAvailable: async () => { asked++; return { available: true }; } });
    const writer = createNativeIosWriter(inApp(plugin));
    writer.isSupported(); writer.isSupported(); writer.blocker();
    await flush();
    writer.isSupported();
    expect(asked).toBe(1);
  });
});

describe("native iOS writer: radio steps", () => {
  it("passes the URL and timeout through to the plugin", async () => {
    const { plugin, calls } = fakePlugin();
    const writer = createNativeIosWriter(inApp(plugin));
    await writer.write("https://care.example/t/v1.a.b.c", 20_000);
    expect(await writer.readOnce(9_000)).toBe("https://care.example/t/v1.a.b.c");
    expect(await writer.lock(5_000)).toEqual({ locked: true });
    expect(calls).toEqual(["write https://care.example/t/v1.a.b.c 20000", "read 9000", "lock 5000"]);
  });

  it("surfaces the plugin's own message when a write fails", async () => {
    const { plugin } = fakePlugin({ write: async () => { throw pluginError("This tag is locked and cannot be rewritten. Use a new tag.", "READ_ONLY"); } });
    const writer = createNativeIosWriter(inApp(plugin));
    await expect(writer.write("https://x/t/1")).rejects.toThrow("This tag is locked and cannot be rewritten. Use a new tag.");
  });

  it("rejects a read that found no link", async () => {
    const { plugin } = fakePlugin({ read: async () => ({ url: "" }) });
    const writer = createNativeIosWriter(inApp(plugin));
    await expect(writer.readOnce()).rejects.toThrow("That tag is not one of ours.");
  });

  it("never throws from lock, and reports why it failed", async () => {
    const { plugin } = fakePlugin({ lock: async () => { throw pluginError("The tag could not be locked (Tag connection lost).", "LOCK_FAILED"); } });
    const writer = createNativeIosWriter(inApp(plugin));
    expect(await writer.lock()).toEqual({ locked: false, reason: "The tag could not be locked (Tag connection lost)." });
  });
});

describe("native iOS writer: full pairing flow", () => {
  it("runs mint, write, read back, verify, link, lock in order", async () => {
    const { plugin, calls } = fakePlugin();
    const writer = createNativeIosWriter(inApp(plugin));
    const log: string[] = [];
    const url = "https://care.example/t/v1.hint.token.mac";

    const result = await pairTagToUnit({
      organizationId: "org-1",
      unitId: "unit-1",
      lock: true,
      writer,
      api: {
        async mint() { log.push("api:mint"); return { tagId: "tag-1", url }; },
        async verify(_tagId, readBack) { const ok = url.endsWith(`/t/${readBack}`); log.push(`api:verify ${ok}`); return { verified: ok }; },
        async reportWriteFailure() { log.push("api:failure"); },
        async pair() { log.push("api:pair"); },
        async pairScanned() { throw new Error("not used"); },
        async replace() { throw new Error("not used"); },
        async recordLock(_tagId, outcome) { log.push(`api:lock ${outcome.locked}`); },
      },
    });

    expect(result.tagId).toBe("tag-1");
    expect(calls.map((c) => c.split(" ")[0])).toEqual(["write", "read", "lock"]);
    expect(log).toEqual(["api:mint", "api:verify true", "api:pair", "api:lock true"]);
  });
});

describe("apple-app-site-association", () => {
  it("is absent until the Apple team and bundle id are configured", async () => {
    const { GET } = await import("@/app/api/v1/apple-app-site-association/route");
    delete process.env.APPLE_TEAM_ID;
    delete process.env.IOS_BUNDLE_ID;
    expect(GET().status).toBe(404);
  });

  it("hands only tag links to the app", async () => {
    const { GET } = await import("@/app/api/v1/apple-app-site-association/route");
    process.env.APPLE_TEAM_ID = "ABCDE12345";
    process.env.IOS_BUNDLE_ID = "com.clearline.equipmentcare";
    try {
      const body = await GET().json();
      expect(body.applinks.details).toEqual([
        { appIDs: ["ABCDE12345.com.clearline.equipmentcare"], components: [{ "/": "/t/*", comment: "NFC and QR tag links" }] },
      ]);
    } finally {
      delete process.env.APPLE_TEAM_ID;
      delete process.env.IOS_BUNDLE_ID;
    }
  });
});
