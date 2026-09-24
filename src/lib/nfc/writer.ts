"use client";

import { createHttpTagApi, createWebNfcWriter, pickTagWriter, type TagWriter } from "@pmops/nfc-writer";

/**
 * The app's one way to reach an NFC radio. Everything about writing, reading
 * back and locking tags lives in `@pmops/nfc-writer`; this file only decides
 * which writers this app offers, most capable first.
 *
 * A native iPhone writer, when there is one, goes ahead of Web NFC in this list
 * and every tagging screen picks it up without changing.
 */
const writers: TagWriter[] = [createWebNfcWriter()];

export function tagWriter(): TagWriter {
  return pickTagWriter(writers);
}

/** The app's `/api/v1/tags/*` endpoints, same origin. */
export const tagApi = createHttpTagApi();
