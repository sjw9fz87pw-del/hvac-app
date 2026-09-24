"use client";

import {
  createDeskReaderWriter, createHttpTagApi, createWebNfcWriter, pairCreatedTag, pairTagToUnit, pickTagWriter,
  type PairPhase, type TagOutcome, type TagWriter,
} from "@pmops/nfc-writer";

/**
 * The app's one way to reach an NFC radio. Everything about writing, reading
 * back and locking tags lives in `@pmops/nfc-writer`; this file only decides
 * which writers this app offers, most capable first.
 *
 * A native iPhone writer, when there is one, goes ahead of Web NFC in this list
 * and every tagging screen picks it up without changing.
 */
const webNfc = createWebNfcWriter();
const writers: TagWriter[] = [webNfc];

export function tagWriter(): TagWriter {
  return pickTagWriter(writers);
}

/**
 * The USB reader on the computer this page is open on, through the local
 * bridge. Only the unit page's "Pair a tag" offers it: pairing always attaches
 * a tag to a unit that already exists, and never happens in rapid inventory.
 */
export const deskReader = createDeskReaderWriter();

/** For pairing from a unit's page: the desk reader once probed, else the phone. */
export function pairingWriter(): TagWriter {
  return pickTagWriter([deskReader, webNfc]);
}

/**
 * Whether this browser has used the desk reader before. Probing reaches into
 * this computer, which Chrome asks permission for, so it only happens
 * unprompted on a computer that has already said yes once.
 */
const REMEMBER_KEY = "pmops.desk-reader";

export function rememberedDeskReader(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberDeskReader(): void {
  try {
    localStorage.setItem(REMEMBER_KEY, "1");
  } catch {
    // Private windows: it just asks again next time.
  }
}

/** The app's `/api/v1/tags/*` endpoints, same origin. */
export const tagApi = createHttpTagApi();

/**
 * Pair whatever tag is on the USB reader to an existing unit.
 *
 * A tag made earlier with "Create tag" already carries one of our links, so it
 * is read and linked without being rewritten. Anything else (a blank sticker)
 * is written, read back and verified first. Either way it is locked last.
 */
export async function pairWithReader(opts: {
  organizationId: string;
  unitId: string;
  lock: boolean;
  onPhase?: (phase: PairPhase) => void;
}): Promise<TagOutcome> {
  const status = await deskReader.probe();
  if (!deskReader.isSupported()) throw new Error(status.hint ?? "The USB reader is not connected.");
  if (!status.tag) throw new Error("Put a tag flat on the reader first.");

  let existing: string | null = null;
  try {
    const url = await deskReader.readOnce(0);
    if (new URL(url).pathname.startsWith("/t/")) existing = url;
  } catch {
    // Blank, or not one of ours: it gets written.
  }

  const common = { unitId: opts.unitId, lock: opts.lock, writer: deskReader, api: tagApi, onPhase: opts.onPhase };
  if (existing) {
    try {
      return await pairCreatedTag(common);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      throw new Error(/not waiting/i.test(message)
        ? "This tag is already on a unit, or belongs to another customer. Use a blank tag or one made with Create tag."
        : message || "Pairing failed");
    }
  }
  return pairTagToUnit({ ...common, organizationId: opts.organizationId });
}
