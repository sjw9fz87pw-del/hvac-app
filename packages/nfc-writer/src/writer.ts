/**
 * The seam between the tagging flow and whatever radio does the writing.
 *
 * The flow in `./pair` only ever talks to a `TagWriter`. Today the one
 * implementation is Web NFC (Chrome on Android, `./web-nfc`). An iPhone
 * cannot write tags from any browser, so when a native writer exists (a Core
 * NFC bridge in a wrapper app, say) it implements this same interface and goes
 * ahead of Web NFC in the list handed to `pickTagWriter`. Nothing else changes.
 */

/**
 * Why this device cannot write a tag.
 *
 * "Unsupported" covers four different situations with four different remedies,
 * and one generic sentence leaves the person with no idea which one they are
 * in. `null` means nothing is in the way.
 */
export type NfcBlocker = "ios" | "android-browser" | "android-nfc-off" | "desktop" | null;

export type LockOutcome =
  | { locked: true }
  | { locked: false; reason: string; unsupported?: boolean };

export interface TagWriter {
  /** Short, stable name for logs and tests: "web-nfc", "native-ios", "mock". */
  readonly kind: string;

  /** Can this device write a tag right now? Checked, never assumed. */
  isSupported(): boolean;

  /** When `isSupported()` is false, which of the known situations this is. */
  blocker(): NfcBlocker;

  /** Write a single NDEF URL record. Throws on failure or timeout. */
  write(url: string, timeoutMs?: number): Promise<void>;

  /**
   * Read one tag and return the URL on it. Used to check a write by reading it
   * back, and by the scan screens. Throws on failure or timeout.
   */
  readOnce(timeoutMs?: number): Promise<string>;

  /**
   * Can this device lock a tag? A device can be able to write while unable to
   * lock (Web NFC's `makeReadOnly` arrived later than the rest of it).
   */
  canLock(): boolean;

  /**
   * Make the chip permanently read-only.
   *
   * **Irreversible.** Only called once the write has been read back, verified,
   * and the pairing committed: a locked tag pointing at nothing is scrap.
   *
   * Never throws. A tag that is paired and working but unlocked is a smaller
   * problem than a failed pairing, so a lock failure is reported, not raised.
   */
  lock(timeoutMs?: number): Promise<LockOutcome>;
}

export class NfcUnsupportedError extends Error {
  constructor(message = "This device cannot read NFC tags in the browser. Use the QR code instead.") {
    super(message);
    this.name = "NfcUnsupportedError";
  }
}

/**
 * The first writer that works on this device, or, when none does, the last one
 * listed so its `blocker()` can explain why. List the most capable first.
 */
export function pickTagWriter(writers: readonly TagWriter[]): TagWriter {
  if (writers.length === 0) throw new Error("nfc-writer: at least one TagWriter is required");
  return writers.find((w) => w.isSupported()) ?? writers[writers.length - 1];
}
