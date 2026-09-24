import type { LockOutcome, TagApi, TagWriter, NfcBlocker } from "../src";

/** One shared log, so tests can assert the order across the radio and the server. */
export type Log = string[];

export interface FakeWriterOptions {
  supported?: boolean;
  blocker?: NfcBlocker;
  canLock?: boolean;
  writeFails?: string;
  readFails?: string;
  /** What the second tap reads back. Defaults to exactly what was written. */
  readBack?: (written: string | null) => string;
  lockOutcome?: LockOutcome;
  kind?: string;
}

export function fakeWriter(log: Log, opts: FakeWriterOptions = {}): TagWriter & { written: string | null } {
  const writer = {
    kind: opts.kind ?? "fake",
    written: null as string | null,
    isSupported: () => opts.supported ?? true,
    blocker: () => (opts.supported ?? true ? null : opts.blocker ?? "desktop"),
    async write(url: string) {
      log.push(`radio:write ${url}`);
      if (opts.writeFails) throw new Error(opts.writeFails);
      writer.written = url;
    },
    async readOnce() {
      log.push("radio:read");
      if (opts.readFails) throw new Error(opts.readFails);
      return opts.readBack ? opts.readBack(writer.written) : writer.written ?? "";
    },
    canLock: () => opts.canLock ?? true,
    async lock(): Promise<LockOutcome> {
      log.push("radio:lock");
      return opts.lockOutcome ?? { locked: true };
    },
  };
  return writer;
}

export interface FakeApiOptions {
  /** Payload the server expects to be read back; defaults to the minted one. */
  verifyFails?: string;
  pairFails?: string;
  replaceFails?: string;
  recordLockFails?: boolean;
}

export const BASE = "https://app.example.com";

export function fakeApi(log: Log, opts: FakeApiOptions = {}): TagApi & {
  locks: { tagId: string; outcome: LockOutcome }[];
  writeFailures: { tagId: string; error: string }[];
  verifiedPayloads: string[];
} {
  let n = 0;
  const api = {
    locks: [] as { tagId: string; outcome: LockOutcome }[],
    writeFailures: [] as { tagId: string; error: string }[],
    verifiedPayloads: [] as string[],
    async mint(organizationId: string) {
      n += 1;
      log.push(`server:mint ${organizationId}`);
      return { tagId: `tag_${n}`, url: `${BASE}/t/v1.hint.token${n}.mac` };
    },
    async verify(tagId: string, payload: string) {
      log.push(`server:verify ${tagId}`);
      api.verifiedPayloads.push(payload);
      if (opts.verifyFails) return { verified: false, reason: opts.verifyFails };
      return { verified: true };
    },
    async reportWriteFailure(tagId: string, error: string) {
      log.push(`server:write-failed ${tagId}`);
      api.writeFailures.push({ tagId, error });
    },
    async pair(tagId: string, unitId: string) {
      log.push(`server:pair ${tagId} -> ${unitId}`);
      if (opts.pairFails) throw new Error(opts.pairFails);
    },
    async replace(unitId: string, newTagId: string, reason: string) {
      log.push(`server:replace ${unitId} with ${newTagId} (${reason})`);
      if (opts.replaceFails) throw new Error(opts.replaceFails);
    },
    async recordLock(tagId: string, outcome: LockOutcome) {
      log.push(`server:record-lock ${tagId} ${outcome.locked ? "locked" : "unlocked"}`);
      if (opts.recordLockFails) throw new Error("network down");
      api.locks.push({ tagId, outcome });
    },
  };
  return api;
}
