/**
 * Invitation links are a credential: anyone holding one can set a password on
 * the account it names. These tests pin the properties that makes safe.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { mintInviteToken, verifyInviteToken, peekUserId, unusablePasswordHash, isUnusable } from "@/lib/auth/invite";
import { verifyPassword, hashPassword } from "@/lib/auth/password";

const HASH_A = "scrypt$65536$8$1$saltsalt$hashhash";
const HASH_B = "scrypt$65536$8$1$othersalt$otherhash";

beforeAll(() => {
  process.env.NFC_TAG_SECRET ??= "test-secret-at-least-thirty-two-chars-long";
});

describe("invitation tokens", () => {
  it("round-trips for the user it was minted for", () => {
    const token = mintInviteToken({ userId: "u_1", passwordHash: HASH_A });
    const result = verifyInviteToken(token, HASH_A);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.claims.userId).toBe("u_1");
  });

  // The whole single-use design rests on this: setting a password changes the
  // hash, and every link signed against the old one stops verifying.
  it("stops verifying once the password hash changes", () => {
    const token = mintInviteToken({ userId: "u_1", passwordHash: HASH_A });
    expect(verifyInviteToken(token, HASH_A).ok).toBe(true);
    const after = verifyInviteToken(token, HASH_B);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toBe("invalid");
  });

  it("rejects an expired link", () => {
    const token = mintInviteToken({ userId: "u_1", passwordHash: HASH_A }, 1);
    const later = new Date(Date.now() + 2 * 3600 * 1000);
    const result = verifyInviteToken(token, HASH_A, later);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects a tampered payload", () => {
    const token = mintInviteToken({ userId: "u_1", passwordHash: HASH_A });
    const [, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ u: "u_2", e: Math.floor(Date.now() / 1000) + 9999 }),
    ).toString("base64url");
    expect(verifyInviteToken(`${forgedPayload}.${signature}`, HASH_A).ok).toBe(false);
  });

  it("rejects a token that is not a token", () => {
    for (const junk of ["", "nonsense", "a.b.c", "....", "onlyonepart"]) {
      expect(verifyInviteToken(junk, HASH_A).ok).toBe(false);
    }
  });

  it("reads the user id without trusting the signature", () => {
    const token = mintInviteToken({ userId: "u_42", passwordHash: HASH_A });
    expect(peekUserId(token)).toBe("u_42");
    expect(peekUserId("garbage")).toBeNull();
  });

  it("does not leak the signing secret into the token", () => {
    const token = mintInviteToken({ userId: "u_1", passwordHash: HASH_A });
    expect(token).not.toContain(process.env.NFC_TAG_SECRET);
    expect(token).not.toContain(HASH_A);
  });
});

describe("placeholder password hashes", () => {
  // An invited account holds a hash no password can produce. If verifyPassword
  // ever accepted one, every pending invitation would be an open account.
  it("can never be signed into", async () => {
    const placeholder = unusablePasswordHash("abc123");
    expect(isUnusable(placeholder)).toBe(true);
    for (const attempt of ["", "abc123", placeholder, "invited:abc123", "password123"]) {
      expect(await verifyPassword(attempt, placeholder)).toBe(false);
    }
  });

  it("is not mistaken for a real hash", async () => {
    const real = await hashPassword("a-real-password");
    expect(isUnusable(real)).toBe(false);
    expect(await verifyPassword("a-real-password", real)).toBe(true);
  });
});
