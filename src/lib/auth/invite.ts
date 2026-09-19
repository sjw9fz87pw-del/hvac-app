/**
 * Invitation and password-reset links.
 *
 * These are stateless: there is no invitations table. A link is a signed
 * statement — "user X may set a password until time T" — and the signature
 * covers the user's *current* password hash.
 *
 * That binding is what makes a link single-use. The moment someone sets a
 * password their hash changes, so every link issued against the old hash stops
 * verifying. The same property makes links revocable: an admin who resets the
 * account invalidates anything still sitting in an inbox. It is the mechanism
 * Django uses for password resets, and it buys single-use semantics without a
 * table to write, expire and clean up — which matters here, because this
 * deployment has no migration path for new tables.
 *
 * The signing key is derived from the app's root secret with a domain
 * separator, so an invite signature can never be confused with an NFC tag
 * signature even though both descend from the same configured value.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const DOMAIN = "pmops.invite.v1";

export const INVITE_TTL_HOURS = 7 * 24;
export const RESET_TTL_HOURS = 24;

export interface InviteClaims {
  userId: string;
  /** Seconds since the epoch. */
  expiresAt: number;
}

function rootSecret(): string {
  const secret = process.env.NFC_TAG_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("NFC_TAG_SECRET must be set to at least 32 characters to sign invitations");
  }
  return secret;
}

/** Domain-separated subkey, so this signature cannot be replayed as another kind. */
function signingKey(): Buffer {
  return createHmac("sha256", rootSecret()).update(DOMAIN).digest();
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, passwordHash: string): string {
  return createHmac("sha256", signingKey())
    .update(`${payload}.${passwordHash}`)
    .digest("base64url");
}

/**
 * Mint a link token for a user. `passwordHash` is the user's current hash —
 * changing it later invalidates this token.
 */
export function mintInviteToken(
  claims: { userId: string; passwordHash: string },
  ttlHours: number = INVITE_TTL_HOURS,
  now: Date = new Date(),
): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + Math.round(ttlHours * 3600);
  const payload = b64url(JSON.stringify({ u: claims.userId, e: expiresAt }));
  return `${payload}.${sign(payload, claims.passwordHash)}`;
}

export type InviteFailure = "malformed" | "expired" | "invalid";

export type InviteResult =
  | { ok: true; claims: InviteClaims }
  | { ok: false; reason: InviteFailure };

/** Read the user id out of a token without trusting it — for looking the user up. */
export function peekUserId(token: string): string | null {
  const payload = token.split(".")[0];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed?.u === "string" ? parsed.u : null;
  } catch {
    return null;
  }
}

/**
 * Verify a token against the user's current password hash.
 *
 * Order matters: the signature is checked before anything else is believed,
 * and the comparison is constant-time.
 */
export function verifyInviteToken(
  token: string,
  passwordHash: string,
  now: Date = new Date(),
): InviteResult {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return { ok: false, reason: "malformed" };

  const expected = sign(payload, passwordHash);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };

  let parsed: { u?: unknown; e?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof parsed.u !== "string" || typeof parsed.e !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.e * 1000 <= now.getTime()) return { ok: false, reason: "expired" };

  return { ok: true, claims: { userId: parsed.u, expiresAt: parsed.e } };
}

/** An unguessable placeholder hash, so an invited account has no usable password. */
export function unusablePasswordHash(random: string): string {
  return `invited:${random}`;
}

export function isUnusable(passwordHash: string): boolean {
  return passwordHash.startsWith("invited:");
}
