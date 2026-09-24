/**
 * Working out why a browser cannot write a tag, and what to tell the person.
 *
 * Pure: the caller passes in what the browser reports, so every case can be
 * tested without a phone. Web NFC is Chrome and Edge on Android only. Apple
 * does not expose NFC writing to web pages at all, so on iOS this is not a
 * setting that can be turned on: Safari, Chrome for iOS and every other iOS
 * browser are the same engine underneath, and none of them can do it.
 */
import type { NfcBlocker } from "./writer";

export interface BrowserFacts {
  /** False during server rendering, where nothing can be known about the phone. */
  inBrowser: boolean;
  /** Whether `NDEFReader` exists. */
  hasReader: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

export function detectBlocker(facts: BrowserFacts): NfcBlocker {
  if (!facts.inBrowser) return null;
  if (facts.hasReader) return null;

  const ua = facts.userAgent;
  // iPadOS reports itself as a Mac, so touch support is what distinguishes it.
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && facts.maxTouchPoints > 1);
  if (iOS) return "ios";

  if (!/Android/.test(ua)) return "desktop";

  // Chrome's token appears in Edge and most Chromium shells too; a webview
  // inside another app (wv) has no Web NFC even when Chrome does.
  const chromium = /Chrome\/\d+/.test(ua) && !/\bwv\b/.test(ua);
  return chromium ? "android-nfc-off" : "android-browser";
}

/** What to tell someone, and what they can actually do about it. */
export function blockerMessage(blocker: NfcBlocker): string {
  switch (blocker) {
    case "ios":
      return "iPhones cannot write NFC tags from a browser — Apple does not allow it, in Safari or any other iOS browser. Use the Clearline iPhone app, the Android phone, or prepare the tag here and write it with a free NFC app.";
    case "android-browser":
      return "This browser cannot write NFC tags. Open the same page in Chrome on this phone and the button appears.";
    case "android-nfc-off":
      return "Chrome can write tags on this phone, but NFC looks switched off. Turn on NFC in Settings → Connected devices, then reload this page.";
    case "desktop":
      return "This browser cannot reach an NFC reader on this computer. Tag from the Android phone, or use the USB desk reader if one is plugged in here.";
    default:
      return "";
  }
}
