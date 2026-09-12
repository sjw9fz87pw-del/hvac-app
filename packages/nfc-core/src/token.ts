/**
 * Secure tag identifiers.
 *
 * What is physically written to an NFC tag is a URL whose path is an opaque,
 * signed token. It carries NO customer data - no restaurant name, address,
 * equipment, model or serial number. Everything meaningful is resolved
 * server-side after the caller has been authenticated and authorized.
 *
 * Payload layout (dot-separated, URL-safe base64url fields):
 *
 *   v1.<tenantHint>.<tokenId>.<mac>
 *
 *   tenantHint  32-bit non-reversible hash of the tenant id. Used only to shard
 *               and rate-limit lookups; it identifies nothing on its own.
 *   tokenId     128 bits of CSPRNG randomness. Not a database id, not a
 *               sequence - enumeration gains an attacker nothing.
 *   mac         Truncated HMAC-SHA256 over "v1|tenantHint|tokenId", keyed with a
 *               server-held secret, so a forged or mistyped tag is rejected
 *               before it ever reaches the database.
 */
import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

export const TOKEN_VERSION = "v1";
const MAC_BYTES = 12; // 96 bits, ample for a tamper check on a short-lived lookup

export interface TagToken {
  version: string;
  tenantHint: string;
  tokenId: string;
  mac: string;
  /** The full string written to the tag / encoded in the QR code. */
  payload: string;
}

export type TokenFailureReason =
  | "MALFORMED"
  | "UNSUPPORTED_VERSION"
  | "BAD_SIGNATURE";

export type VerifyResult =
  | { ok: true; token: TagToken }
  | { ok: false; reason: TokenFailureReason };

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * Non-reversible tenant shard hint. Deliberately truncated: it is a bucket, not
 * an identifier, and cannot be turned back into a tenant id.
 */
export function tenantHint(tenantId: string): string {
  return createHash("sha256").update(`tenant:${tenantId}`).digest("base64url").slice(0, 6);
}

function sign(secret: string, version: string, hint: string, tokenId: string): string {
  return b64url(
    createHmac("sha256", secret).update(`${version}|${hint}|${tokenId}`).digest().subarray(0, MAC_BYTES),
  );
}

export function mintTagToken(secret: string, opts: { tenantId: string; tokenId?: string }): TagToken {
  if (!secret) throw new Error("nfc-core: a tag secret is required to mint a token");
  const hint = tenantHint(opts.tenantId);
  const tokenId = opts.tokenId ?? b64url(randomBytes(16));
  const mac = sign(secret, TOKEN_VERSION, hint, tokenId);
  return {
    version: TOKEN_VERSION,
    tenantHint: hint,
    tokenId,
    mac,
    payload: `${TOKEN_VERSION}.${hint}.${tokenId}.${mac}`,
  };
}

export function verifyTagToken(secret: string, payload: string): VerifyResult {
  if (typeof payload !== "string") return { ok: false, reason: "MALFORMED" };
  const parts = payload.trim().split(".");
  if (parts.length !== 4) return { ok: false, reason: "MALFORMED" };
  const [version, hint, tokenId, mac] = parts;
  if (version !== TOKEN_VERSION) return { ok: false, reason: "UNSUPPORTED_VERSION" };
  if (!hint || !tokenId || !mac) return { ok: false, reason: "MALFORMED" };

  const expected = Buffer.from(sign(secret, version, hint, tokenId));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  return { ok: true, token: { version, tenantHint: hint, tokenId, mac, payload } };
}

/** Recorded at mint time so a tag can be spot-checked without re-deriving. */
export function macPrefix(token: TagToken): string {
  return token.mac.slice(0, 8);
}
