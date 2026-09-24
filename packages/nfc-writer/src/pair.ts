/**
 * Putting a tag on a unit: mint, write, read back, verify, commit, then lock.
 *
 * The order is the whole point, and it lives here once so every screen that
 * tags something gets it right by construction:
 *
 * - Nothing is minted on a device that cannot write, so no orphan tags.
 * - The unit is linked only after the read-back matches what was minted. An
 *   unverified write leaves a tag on a cooler that resolves to nothing, which
 *   is worse than no tag, because the technician believes the unit is covered.
 * - Locking is irreversible, so it comes last, after the link is committed: a
 *   locked tag pointing at nothing is scrap. A lock that fails is recorded and
 *   reported but never undoes the link, because by then the unit is working.
 *
 * Tags are only ever attached to a unit that already exists. Creating units is
 * somebody else's job; this module is handed a unit id and never makes one.
 */
import type { TagApi } from "./tag-api";
import { NfcUnsupportedError, type TagWriter } from "./writer";

export type PairPhase = "minting" | "writing" | "verifying" | "pairing" | "locking";
export type ReplacePhase = "minting" | "writing" | "verifying" | "replacing" | "locking";

export interface TagOutcome {
  tagId: string;
  /** Why the chip could not be locked, when locking was asked for and failed. */
  lockNote: string | null;
}

interface FlowOptions<P> {
  organizationId: string;
  /** The existing unit the tag goes on. */
  unitId: string;
  writer: TagWriter;
  api: TagApi;
  /** Lock the chip once everything else has succeeded. */
  lock: boolean;
  onPhase?: (phase: P) => void;
}

/** How long to wait for the second tap that reads the write back. */
const READ_BACK_TIMEOUT_MS = 15_000;

/**
 * The part of a scanned tag the server checks: whatever follows `/t/` in the
 * URL, or the whole thing when the reader handed back a bare payload.
 */
export function payloadFromReadBack(readBack: string): string {
  const text = readBack.trim();
  try {
    const match = new URL(text).pathname.match(/\/t\/([^/]+)\/?$/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    // Not a URL; fall through.
  }
  return text.split("/t/").pop() ?? text;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function checkPreconditions(opts: Pick<FlowOptions<unknown>, "unitId" | "organizationId" | "writer">) {
  if (!opts.unitId) throw new Error("A tag can only be put on a unit that already exists.");
  if (!opts.organizationId) throw new Error("No customer was given for this tag.");
  if (!opts.writer.isSupported()) throw new NfcUnsupportedError("This device cannot write NFC tags.");
}

/** Steps shared by pairing and replacing: mint, write, read back, verify. */
async function mintWriteVerify(
  { writer, api, organizationId }: Pick<FlowOptions<unknown>, "writer" | "api" | "organizationId">,
  phase: (p: "minting" | "writing" | "verifying") => void,
): Promise<string> {
  phase("minting");
  const minted = await api.mint(organizationId);

  phase("writing");
  try {
    await writer.write(minted.url);
  } catch (error) {
    await api.reportWriteFailure(minted.tagId, message(error, "Write failed")).catch(() => {});
    throw error;
  }

  phase("verifying");
  let readBack: string;
  try {
    readBack = await writer.readOnce(READ_BACK_TIMEOUT_MS);
  } catch (error) {
    await api.reportWriteFailure(minted.tagId, `Read-back failed: ${message(error, "no tag read")}`).catch(() => {});
    throw error;
  }

  const verified = await api.verify(minted.tagId, payloadFromReadBack(readBack));
  if (!verified.verified) throw new Error(verified.reason ?? "The tag did not verify");

  return minted.tagId;
}

async function lockAfterCommit(
  { writer, api }: Pick<FlowOptions<unknown>, "writer" | "api">,
  tagId: string,
): Promise<string | null> {
  const outcome = await writer.lock();
  await api.recordLock(tagId, outcome).catch(() => {});
  return outcome.locked ? null : outcome.reason;
}

/** Put a blank tag on a unit that has none. */
export async function pairTagToUnit(opts: FlowOptions<PairPhase>): Promise<TagOutcome> {
  checkPreconditions(opts);
  const phase = opts.onPhase ?? (() => {});

  const tagId = await mintWriteVerify(opts, phase);

  phase("pairing");
  await opts.api.pair(tagId, opts.unitId);

  let lockNote: string | null = null;
  if (opts.lock) {
    phase("locking");
    lockNote = await lockAfterCommit(opts, tagId);
  }
  return { tagId, lockNote };
}

/**
 * Swap a damaged tag for a new one. The new tag is written and verified before
 * the old one is touched, and the server revokes the old and pairs the new in
 * one transaction, so the unit is never left without a working tag.
 */
export async function replaceUnitTag(opts: FlowOptions<ReplacePhase> & { reason: string }): Promise<TagOutcome> {
  checkPreconditions(opts);
  const phase = opts.onPhase ?? (() => {});

  const tagId = await mintWriteVerify(opts, phase);

  phase("replacing");
  await opts.api.replace(opts.unitId, tagId, opts.reason || "Tag replaced");

  let lockNote: string | null = null;
  if (opts.lock) {
    phase("locking");
    lockNote = await lockAfterCommit(opts, tagId);
  }
  return { tagId, lockNote };
}

/** What the person should be told is happening, per step. */
export function pairPhaseLabel(phase: PairPhase): string {
  return {
    minting: "Preparing a tag…",
    writing: "Hold the phone against the tag…",
    verifying: "Tap it once more to check what was written…",
    pairing: "Linking it to this unit…",
    locking: "Locking the tag…",
  }[phase];
}
