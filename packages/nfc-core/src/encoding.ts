/**
 * What actually goes on the tag, and the QR code that mirrors it.
 *
 * NFC and QR deliberately carry the *same* token and resolve through the *same*
 * endpoint, so the QR fallback is a first-class path rather than a degraded one.
 * Every asset therefore has a working fallback the moment it has a tag.
 */
import type { TagToken } from "./token";

export function buildTagUrl(baseUrl: string, payload: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/t/${payload}`;
}

/** Extracts the token payload back out of a scanned URL, or null if it is not ours. */
export function parseTagUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/t\/([A-Za-z0-9_.-]+)$/);
    return match ? match[1] : null;
  } catch {
    // Not a URL at all - the reader may have handed us a bare payload.
    return /^v\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(url.trim()) ? url.trim() : null;
  }
}

export interface NdefRecordSpec {
  recordType: "url";
  data: string;
}

/**
 * A single NDEF URL record. One record, no text record, no vendor payload:
 * nothing about the customer, location or equipment is written to the chip.
 */
export function buildNdefRecords(baseUrl: string, token: TagToken): NdefRecordSpec[] {
  return [{ recordType: "url", data: buildTagUrl(baseUrl, token.payload) }];
}

/** The QR code encodes the identical URL. */
export function buildQrPayload(baseUrl: string, token: TagToken): string {
  return buildTagUrl(baseUrl, token.payload);
}
