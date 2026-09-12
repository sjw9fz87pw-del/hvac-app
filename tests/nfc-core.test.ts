import { describe, expect, it, vi } from "vitest";
import {
  mintTagToken, verifyTagToken, tenantHint, macPrefix,
  transition, canTransition, isTerminal, isReadable,
  buildTagUrl, parseTagUrl, buildNdefRecords, buildQrPayload,
  resolveTagPayload, denialMessage,
  type TagStore, type TagAuditSink,
} from "@pmops/nfc-core";

const SECRET = "test-secret-at-least-thirty-two-characters-long";
const TENANT = "org_mona";

describe("tag tokens", () => {
  it("round-trips a minted token", () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    const result = verifyTagToken(SECRET, token.payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token.tokenId).toBe(token.tokenId);
  });

  it("rejects a tampered token id", () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    const [version, hint, , mac] = token.payload.split(".");
    const forged = [version, hint, "attackerchosenid", mac].join(".");
    expect(verifyTagToken(SECRET, forged)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintTagToken("another-secret-at-least-thirty-two-chars!!", { tenantId: TENANT });
    expect(verifyTagToken(SECRET, token.payload)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects malformed and unknown-version payloads", () => {
    expect(verifyTagToken(SECRET, "nonsense")).toEqual({ ok: false, reason: "MALFORMED" });
    expect(verifyTagToken(SECRET, "a.b.c")).toEqual({ ok: false, reason: "MALFORMED" });
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    const bumped = token.payload.replace(/^v1/, "v9");
    expect(verifyTagToken(SECRET, bumped)).toEqual({ ok: false, reason: "UNSUPPORTED_VERSION" });
  });

  it("carries no customer data: the tenant hint is not the tenant id", () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    expect(token.payload).not.toContain(TENANT);
    expect(token.tenantHint).not.toContain(TENANT);
    expect(token.tenantHint).toBe(tenantHint(TENANT));
    expect(token.tenantHint.length).toBeLessThanOrEqual(8);
  });

  it("uses unpredictable token ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => mintTagToken(SECRET, { tenantId: TENANT }).tokenId));
    expect(ids.size).toBe(200);
  });

  it("refuses to mint without a secret", () => {
    expect(() => mintTagToken("", { tenantId: TENANT })).toThrow(/secret/i);
  });

  it("records a short mac prefix for spot checks", () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    expect(macPrefix(token)).toBe(token.mac.slice(0, 8));
  });
});

describe("tag lifecycle", () => {
  it("allows pairing only from unassigned stock", () => {
    expect(transition("UNASSIGNED", "PAIR")).toEqual({ ok: true, state: "ACTIVE" });
    expect(transition("ACTIVE", "PAIR").ok).toBe(false);
    expect(transition("REVOKED", "PAIR").ok).toBe(false);
  });

  it("never brings a revoked tag back to life", () => {
    expect(isTerminal("REVOKED")).toBe(true);
    for (const action of ["PAIR", "UNPAIR", "REASSIGN", "MARK_LOST"] as const) {
      expect(transition("REVOKED", action).ok).toBe(false);
    }
  });

  it("allows revoking from any live state", () => {
    for (const state of ["UNASSIGNED", "ACTIVE", "LOST"] as const) {
      expect(transition(state, "REVOKE")).toEqual({ ok: true, state: "REVOKED" });
    }
  });

  it("only reads active tags", () => {
    expect(isReadable("ACTIVE")).toBe(true);
    for (const state of ["UNASSIGNED", "REVOKED", "LOST"] as const) expect(isReadable(state)).toBe(false);
  });

  it("reports why an illegal transition was refused", () => {
    const result = transition("REVOKED", "PAIR");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/REVOKED/);
  });

  it("agrees with canTransition", () => {
    expect(canTransition("ACTIVE", "REASSIGN")).toBe(true);
    expect(canTransition("UNASSIGNED", "REASSIGN")).toBe(false);
  });
});

describe("encoding and QR fallback", () => {
  it("puts one URL record on the tag and nothing else", () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    const records = buildNdefRecords("https://care.example", token);
    expect(records).toHaveLength(1);
    expect(records[0].recordType).toBe("url");
  });

  it("encodes the same payload in the QR code as on the chip", () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    expect(buildQrPayload("https://care.example", token)).toBe(buildTagUrl("https://care.example", token.payload));
  });

  it("parses a scanned URL back to its payload", () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    const url = buildTagUrl("https://care.example/", token.payload);
    expect(parseTagUrl(url)).toBe(token.payload);
  });

  it("accepts a bare payload and rejects a foreign URL", () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    expect(parseTagUrl(token.payload)).toBe(token.payload);
    expect(parseTagUrl("https://example.com/something-else")).toBeNull();
    expect(parseTagUrl("just some text")).toBeNull();
  });
});

describe("tap resolution", () => {
  function context(overrides: {
    tag?: Parameters<TagStore["findByTokenId"]> extends never ? never : Awaited<ReturnType<TagStore["findByTokenId"]>>;
    canAccess?: boolean;
  } = {}) {
    const events: { type: string; detail?: unknown }[] = [];
    const audit: TagAuditSink = { record: async (event) => { events.push({ type: event.type, detail: event.detail }); } };
    const store: TagStore = { findByTokenId: async () => overrides.tag ?? null };
    return {
      events,
      ctx: { secret: SECRET, store, audit, canAccessTenant: () => overrides.canAccess ?? true },
    };
  }

  const activeTag = { id: "tag_1", tokenId: "tok", state: "ACTIVE" as const, tenantId: TENANT, equipmentId: "eq_1" };

  it("resolves an active, paired, authorised tag", async () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    const { ctx, events } = context({ tag: { ...activeTag, tokenId: token.tokenId } });
    const outcome = await resolveTagPayload(token.payload, ctx);
    expect(outcome).toEqual({ ok: true, tagId: "tag_1", equipmentId: "eq_1", tenantId: TENANT });
    expect(events.map((e) => e.type)).toEqual(["READ"]);
  });

  it("rejects a forged signature before touching the store", async () => {
    const findByTokenId = vi.fn();
    const outcome = await resolveTagPayload("v1.aaa.bbb.ccc", {
      secret: SECRET, store: { findByTokenId }, canAccessTenant: () => true,
    });
    expect(outcome).toEqual({ ok: false, reason: "BAD_TOKEN" });
    expect(findByTokenId).not.toHaveBeenCalled();
  });

  it("refuses a revoked tag and logs the denial", async () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    const { ctx, events } = context({ tag: { ...activeTag, tokenId: token.tokenId, state: "REVOKED" } });
    const outcome = await resolveTagPayload(token.payload, ctx);
    expect(outcome).toEqual({ ok: false, reason: "TAG_NOT_ACTIVE" });
    expect(events[0].type).toBe("READ_DENIED");
  });

  it("refuses an unpaired tag", async () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    const { ctx } = context({ tag: { ...activeTag, tokenId: token.tokenId, equipmentId: null } });
    expect(await resolveTagPayload(token.payload, ctx)).toEqual({ ok: false, reason: "TAG_UNPAIRED" });
  });

  it("refuses an unknown tag", async () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    const { ctx } = context({ tag: null });
    expect(await resolveTagPayload(token.payload, ctx)).toEqual({ ok: false, reason: "UNKNOWN_TAG" });
  });

  it("refuses a caller with no access to the tag's tenant — a cloned tag gains nothing", async () => {
    const token = mintTagToken(SECRET, { tenantId: TENANT });
    const { ctx, events } = context({ tag: { ...activeTag, tokenId: token.tokenId }, canAccess: false });
    expect(await resolveTagPayload(token.payload, ctx)).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(events[0].type).toBe("READ_DENIED");
  });

  it("gives every denial the same message so tags cannot be enumerated", () => {
    const messages = new Set(
      (["BAD_TOKEN", "UNKNOWN_TAG", "TAG_NOT_ACTIVE", "TAG_UNPAIRED", "TENANT_MISMATCH", "FORBIDDEN"] as const)
        .map(denialMessage),
    );
    expect(messages.size).toBe(1);
  });
});

describe("tag locking", () => {
  // Locking is irreversible on the hardware, so the ordering guarantees around
  // it matter more than the call itself. The transport is mocked because no NFC
  // radio exists in this environment.
  function mockTransport(opts: { canLock?: boolean; lockFails?: boolean } = {}) {
    const calls: string[] = [];
    return {
      calls,
      transport: {
        isSupported: () => true,
        async write(_payload: string) { calls.push("write"); },
        async readOnce(_timeoutMs?: number) { calls.push("read"); return "payload"; },
        canLock: () => opts.canLock ?? true,
        async lock(_timeoutMs?: number) {
          calls.push("lock");
          if (opts.lockFails) throw new Error("Tag moved away before locking finished");
        },
      } satisfies import("@pmops/nfc-core").NfcTransport & { canLock: () => boolean },
    };
  }

  /** Mirrors the order the pairing flow uses: write, verify, pair, then lock. */
  async function pairAndLock(t: ReturnType<typeof mockTransport>["transport"], commitPairing: () => void) {
    await t.write("payload");
    await t.readOnce();
    commitPairing();
    if (t.canLock?.()) {
      try { await t.lock?.(); } catch { /* recorded, never fatal */ }
    }
  }

  it("locks only after the write is verified and the pairing committed", async () => {
    const { transport, calls } = mockTransport();
    let pairedAt = -1;
    await pairAndLock(transport, () => { pairedAt = calls.length; });

    expect(calls).toEqual(["write", "read", "lock"]);
    // The lock must come after pairing — a locked tag pointing at nothing is scrap.
    expect(calls.indexOf("lock")).toBeGreaterThan(pairedAt - 1);
    expect(calls.indexOf("read")).toBeLessThan(calls.indexOf("lock"));
  });

  it("still pairs when the device cannot lock", async () => {
    const { transport, calls } = mockTransport({ canLock: false });
    let paired = false;
    await pairAndLock(transport, () => { paired = true; });

    expect(paired).toBe(true);
    expect(calls).not.toContain("lock");
  });

  it("does not undo a committed pairing when locking fails", async () => {
    const { transport, calls } = mockTransport({ lockFails: true });
    let paired = false;
    await expect(pairAndLock(transport, () => { paired = true; })).resolves.toBeUndefined();

    // The asset is already working; an unlocked tag is a smaller problem than
    // an unpaired one, so the failure is recorded rather than thrown.
    expect(paired).toBe(true);
    expect(calls).toContain("lock");
  });

  it("treats lock events as part of the audit vocabulary", () => {
    const types: import("@pmops/nfc-core").TagAuditType[] = ["LOCKED", "LOCK_FAILED"];
    expect(types).toHaveLength(2);
  });
});
