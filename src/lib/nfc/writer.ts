"use client";

import { createHttpTagApi, createWebNfcWriter, pickTagWriter, type TagWriter } from "@pmops/nfc-writer";
import { capacitorEnvironment } from "./capacitor";
import { createNativeIosWriter } from "./native-ios";

/**
 * The app's one way to reach an NFC radio. Everything about writing, reading
 * back and locking tags lives in `@pmops/nfc-writer`; this file only decides
 * which writers this app offers, most capable first.
 *
 * The iPhone app's Core NFC writer goes first: it is only supported inside
 * that app, so in every browser the list falls through to Web NFC.
 */
const writers: TagWriter[] = [createNativeIosWriter(capacitorEnvironment), createWebNfcWriter()];

export function tagWriter(): TagWriter {
  return pickTagWriter(writers);
}

/** The app's `/api/v1/tags/*` endpoints, same origin. */
export const tagApi = createHttpTagApi();
