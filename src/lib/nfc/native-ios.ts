/**
 * `TagWriter` for the iPhone app.
 *
 * No iOS browser can write NFC tags, so the iPhone app (a Capacitor shell
 * around this same site, see docs/IOS-APP.md) exposes Core NFC to the page as
 * the `TagNfc` plugin (ios/App/App/TagNfcPlugin.swift). This file adapts that
 * plugin to the interface the tagging flow already uses, so pairing, replacing
 * and scanning work in the app without any screen knowing it is native.
 *
 * In any ordinary browser the plugin is absent, `isSupported()` is false, and
 * `pickTagWriter` falls through to Web NFC.
 *
 * The environment is read through a function so tests can drive this with a
 * fake plugin and so importing it during server rendering touches nothing.
 */
import { NfcUnsupportedError, type LockOutcome, type NfcBlocker, type TagWriter } from "@pmops/nfc-writer";

/** The methods TagNfcPlugin.swift registers. Rejections carry a readable message and a `code`. */
export interface TagNfcPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  write(options: { url: string; timeoutMs?: number }): Promise<{ written: boolean }>;
  read(options: { timeoutMs?: number }): Promise<{ url: string }>;
  lock(options: { timeoutMs?: number }): Promise<{ locked: boolean }>;
}

export interface NativeIosEnvironment {
  /** Running inside the iPhone app with the TagNfc plugin registered. */
  isNativeIos: boolean;
  plugin: TagNfcPlugin | null;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

export function createNativeIosWriter(env: () => NativeIosEnvironment): TagWriter {
  // Whether this iPhone has a usable NFC reader. Unknown until the plugin
  // answers, and assumed yes meanwhile: every iPhone that runs the app (iOS 15,
  // iPhone 7 and later) has one, and the app refuses to install on those that
  // do not. A "no" only ever narrows it.
  let available: boolean | null = null;
  let probing = false;

  function plugin(): TagNfcPlugin | null {
    const e = env();
    if (!e.isNativeIos || !e.plugin) return null;
    if (available === null && !probing) {
      probing = true;
      e.plugin.isAvailable().then(
        (r) => { available = r.available; },
        () => { probing = false; },
      );
    }
    return available === false ? null : e.plugin;
  }

  return {
    kind: "native-ios",

    isSupported: () => plugin() !== null,

    blocker(): NfcBlocker {
      return plugin() ? null : "ios";
    },

    async write(url, timeoutMs = 25_000) {
      const p = plugin();
      if (!p) throw new NfcUnsupportedError("This iPhone cannot write NFC tags.");
      try {
        await p.write({ url, timeoutMs });
      } catch (error) {
        throw new Error(messageOf(error, "The tag could not be written."));
      }
    },

    async readOnce(timeoutMs = 25_000) {
      const p = plugin();
      if (!p) throw new NfcUnsupportedError("This iPhone cannot read NFC tags.");
      let result: { url: string };
      try {
        result = await p.read({ timeoutMs });
      } catch (error) {
        throw new Error(messageOf(error, "Could not read the tag. Try repositioning the phone."));
      }
      if (!result?.url) throw new Error("That tag is not one of ours.");
      return result.url;
    },

    // Core NFC can lock any writable NDEF tag (NTAG213 included).
    canLock: () => plugin() !== null,

    async lock(timeoutMs = 15_000): Promise<LockOutcome> {
      const p = plugin();
      if (!p) return { locked: false, reason: "This iPhone cannot write NFC tags.", unsupported: true };
      try {
        const r = await p.lock({ timeoutMs });
        return r.locked ? { locked: true } : { locked: false, reason: "The tag could not be locked." };
      } catch (error) {
        const outcome: LockOutcome = { locked: false, reason: messageOf(error, "The tag could not be locked.") };
        return codeOf(error) === "UNAVAILABLE" ? { ...outcome, unsupported: true } : outcome;
      }
    },
  };
}
