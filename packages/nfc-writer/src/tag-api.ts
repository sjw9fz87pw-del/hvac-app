/**
 * The server calls the tagging flow makes, behind one interface.
 *
 * The flow never calls `fetch` itself. `createHttpTagApi` is the real thing,
 * talking to the app's `/api/v1/tags/*` endpoints; tests hand the flow an
 * in-memory `TagApi` instead, so every ordering rule can be checked without a
 * server or a phone.
 */
import type { LockOutcome } from "./writer";

export interface MintedTag {
  tagId: string;
  /** The signed URL to write to the chip. */
  url: string;
}

export interface VerifyResult {
  verified: boolean;
  reason?: string;
}

export interface TagApi {
  /** Reserve a new signed identifier for a blank tag. */
  mint(organizationId: string): Promise<MintedTag>;
  /** Ask the server whether what was read back is what was minted. */
  verify(tagId: string, readBackPayload: string): Promise<VerifyResult>;
  /** Record that writing or reading back failed, so the tag is not phantom stock. */
  reportWriteFailure(tagId: string, error: string): Promise<void>;
  /** Link a verified tag to a unit that already exists. */
  pair(tagId: string, unitId: string): Promise<void>;
  /** Revoke the unit's current tag and pair the new one, in one step on the server. */
  replace(unitId: string, newTagId: string, reason: string): Promise<void>;
  /** Remember whether the chip was locked, either way. */
  recordLock(tagId: string, outcome: LockOutcome): Promise<void>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpTagApiOptions {
  fetch?: Fetch;
  /** Prefix for the endpoints. Empty means same origin. */
  baseUrl?: string;
  newIdempotencyKey?: () => string;
}

async function errorFrom(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? fallback);
}

export function createHttpTagApi(opts: HttpTagApiOptions = {}): TagApi {
  const doFetch: Fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const base = (opts.baseUrl ?? "").replace(/\/+$/, "");
  const newKey = opts.newIdempotencyKey ?? (() => crypto.randomUUID());

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    doFetch(`${base}/api/v1/tags/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  return {
    async mint(organizationId) {
      const response = await post("mint", { organizationId });
      if (!response.ok) throw await errorFrom(response, "Could not mint a tag");
      const body = (await response.json()) as { tagId: string; url: string };
      return { tagId: body.tagId, url: body.url };
    },

    async verify(tagId, readBackPayload) {
      const response = await post("verify", { tagId, readBackPayload });
      const body = (await response.json().catch(() => ({}))) as { verified?: boolean; reason?: string; error?: string };
      if (!response.ok) return { verified: false, reason: body.error ?? body.reason };
      return { verified: body.verified === true, reason: body.reason };
    },

    async reportWriteFailure(tagId, error) {
      await post("verify", { tagId, writeError: error.slice(0, 500) });
    },

    async pair(tagId, unitId) {
      const response = await post(
        "pair",
        { tagId, equipmentId: unitId, verified: true },
        { "idempotency-key": newKey() },
      );
      if (!response.ok) throw await errorFrom(response, "Pairing failed");
    },

    async replace(unitId, newTagId, reason) {
      const response = await post("replace", { equipmentId: unitId, newTagId, reason, verified: true });
      if (!response.ok) throw await errorFrom(response, "Replacement failed");
    },

    async recordLock(tagId, outcome) {
      await post("lock", {
        tagId,
        locked: outcome.locked,
        reason: outcome.locked ? null : outcome.reason,
        unsupported: outcome.locked ? false : Boolean(outcome.unsupported),
      });
    },
  };
}
