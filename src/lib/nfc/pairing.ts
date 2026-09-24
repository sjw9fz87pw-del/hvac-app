"use client";

import { writeTag, readTagOnce, lockTag } from "./web-nfc";

export type PairPhase = "minting" | "writing" | "verifying" | "pairing" | "locking";

export interface PairOutcome {
  tagId: string;
  /** Why the chip could not be locked, when locking was asked for and failed. */
  lockNote: string | null;
}

/**
 * Mint, write, read back, verify, pair, then lock.
 *
 * The order is the whole point. Pairing happens only after the read-back
 * matches what was minted, because an unverified write leaves a tag on a cooler
 * that resolves to nothing — worse than no tag at all, since the technician
 * believes the unit is covered. Locking is irreversible and therefore comes
 * last, after the pairing is committed: a locked tag pointing at nothing is
 * scrap. A lock that fails is recorded and reported but never undoes the
 * pairing, because by then the asset is already working.
 *
 * Shared by rapid inventory (new units) and by pairing a tag to a unit that
 * already exists, so both produce identical state and identical history.
 */
export async function mintWriteVerifyPair(opts: {
  organizationId: string;
  equipmentId: string;
  lock: boolean;
  onPhase?: (phase: PairPhase) => void;
}): Promise<PairOutcome> {
  const phase = opts.onPhase ?? (() => {});

  phase("minting");
  const mint = await fetch("/api/v1/tags/mint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ organizationId: opts.organizationId }),
  });
  const minted = await mint.json();
  if (!mint.ok) throw new Error(minted.error ?? "Could not mint a tag");

  phase("writing");
  await writeTag(minted.url);

  phase("verifying");
  const readBack = await readTagOnce(15_000);
  const verify = await fetch("/api/v1/tags/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tagId: minted.tagId, readBackPayload: readBack.split("/t/").pop() ?? readBack }),
  });
  const verified = await verify.json();
  if (!verified.verified) throw new Error(verified.reason ?? "The tag did not verify");

  phase("pairing");
  const pair = await fetch("/api/v1/tags/pair", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ tagId: minted.tagId, equipmentId: opts.equipmentId, verified: true }),
  });
  if (!pair.ok) throw new Error((await pair.json().catch(() => ({}))).error ?? "Pairing failed");

  let lockNote: string | null = null;
  if (opts.lock) {
    phase("locking");
    const outcome = await lockTag();
    await fetch("/api/v1/tags/lock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tagId: minted.tagId,
        locked: outcome.locked,
        reason: outcome.locked ? null : outcome.reason,
        unsupported: outcome.locked ? false : Boolean(outcome.unsupported),
      }),
    }).catch(() => {});
    lockNote = outcome.locked ? null : outcome.reason;
  }

  return { tagId: minted.tagId, lockNote };
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
