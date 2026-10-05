import { describe, expect, it } from "vitest";
import { blockerMessage, detectBlocker, pickTagWriter, type NfcBlocker } from "../src";
import { fakeWriter } from "./fakes";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
  androidWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
};

describe("why a browser cannot write a tag", () => {
  it.each<[string, string, number, NfcBlocker]>([
    ["iPhone Safari", UA.iphone, 5, "ios"],
    ["Chrome on iPhone", UA.iphoneChrome, 5, "ios"],
    ["iPad, which says it is a Mac", UA.ipad, 5, "ios"],
    ["a real Mac", UA.mac, 0, "desktop"],
    ["Windows", UA.windows, 0, "desktop"],
    ["Firefox on Android", UA.androidFirefox, 5, "android-browser"],
    ["a webview inside another Android app", UA.androidWebView, 5, "android-browser"],
    ["Chrome on Android with NFC off", UA.androidChrome, 5, "android-nfc-off"],
  ])("%s", (_name, userAgent, maxTouchPoints, expected) => {
    expect(detectBlocker({ inBrowser: true, hasReader: false, userAgent, maxTouchPoints })).toBe(expected);
  });

  it("is nothing when the reader is there", () => {
    expect(detectBlocker({ inBrowser: true, hasReader: true, userAgent: UA.androidChrome, maxTouchPoints: 5 })).toBeNull();
  });

  it("is nothing on the server, which cannot know", () => {
    expect(detectBlocker({ inBrowser: false, hasReader: false, userAgent: "", maxTouchPoints: 0 })).toBeNull();
  });

  it("has a distinct message for every blocker, and none when nothing is in the way", () => {
    const blockers: NfcBlocker[] = ["ios", "android-browser", "android-nfc-off", "desktop"];
    const messages = blockers.map(blockerMessage);
    expect(new Set(messages).size).toBe(blockers.length);
    for (const m of messages) expect(m.length).toBeGreaterThan(0);
    expect(blockerMessage(null)).toBe("");
  });
});

describe("choosing a writer", () => {
  it("prefers the first writer that works, so a native one can go ahead of Web NFC", () => {
    const native = fakeWriter([], { kind: "native-ios" });
    const web = fakeWriter([], { kind: "web-nfc", supported: false, blocker: "ios" });
    expect(pickTagWriter([native, web]).kind).toBe("native-ios");
  });

  it("falls back to the next writer when the first cannot run here", () => {
    const native = fakeWriter([], { kind: "native-ios", supported: false });
    const web = fakeWriter([], { kind: "web-nfc" });
    expect(pickTagWriter([native, web]).kind).toBe("web-nfc");
  });

  it("returns the last writer when none works, so its blocker can explain why", () => {
    const native = fakeWriter([], { kind: "native-ios", supported: false, blocker: null });
    const web = fakeWriter([], { kind: "web-nfc", supported: false, blocker: "ios" });
    const picked = pickTagWriter([native, web]);
    expect(picked.kind).toBe("web-nfc");
    expect(picked.blocker()).toBe("ios");
  });

  it("refuses an empty list", () => {
    expect(() => pickTagWriter([])).toThrow();
  });
});
