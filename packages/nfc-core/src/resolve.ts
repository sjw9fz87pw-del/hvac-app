/**
 * Server-side resolution of a tapped tag or scanned QR code.
 *
 * Every check below runs on the server on every read. A cloned tag is still
 * useless to someone whose session does not grant access to the tenant that
 * owns it, because authorization is decided from the session - never from
 * anything the tag itself claims.
 */
import { verifyTagToken } from "./token";
import { isReadable } from "./lifecycle";
import type { TagStore, TagAuditSink } from "./ports";

export type ResolveDenial =
  | "BAD_TOKEN"       // malformed or forged signature
  | "UNKNOWN_TAG"     // valid signature, no such tag
  | "TAG_NOT_ACTIVE"  // revoked, lost, or unassigned stock
  | "TAG_UNPAIRED"    // active but not currently on any asset
  | "TENANT_MISMATCH" // tag's tenant is not the asset's tenant
  | "FORBIDDEN";      // caller has no access to that tenant

export type ResolveOutcome =
  | { ok: true; tagId: string; equipmentId: string; tenantId: string }
  | { ok: false; reason: ResolveDenial };

export interface ResolveContext {
  secret: string;
  store: TagStore;
  audit?: TagAuditSink;
  /** Derived from the session on the server. Never from the request body. */
  canAccessTenant: (tenantId: string) => boolean | Promise<boolean>;
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function resolveTagPayload(payload: string, ctx: ResolveContext): Promise<ResolveOutcome> {
  const deny = async (reason: ResolveDenial, tagId?: string | null): Promise<ResolveOutcome> => {
    await ctx.audit?.record({
      type: "READ_DENIED",
      tagId: tagId ?? null,
      actorId: ctx.actorId ?? null,
      detail: { reason },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return { ok: false, reason };
  };

  // 1. Signature first: a forged tag never reaches the database.
  const verified = verifyTagToken(ctx.secret, payload);
  if (!verified.ok) return deny("BAD_TOKEN");

  // 2. Does the tag exist?
  const tag = await ctx.store.findByTokenId(verified.token.tokenId);
  if (!tag) return deny("UNKNOWN_TAG");

  // 3. Is it live?
  if (!isReadable(tag.state)) return deny("TAG_NOT_ACTIVE", tag.id);

  // 4. Is it currently on a piece of equipment?
  if (!tag.equipmentId) return deny("TAG_UNPAIRED", tag.id);

  // 5. Tenant binding intact?
  if (!tag.tenantId) return deny("TENANT_MISMATCH", tag.id);

  // 6. Is this caller allowed to see that tenant?
  if (!(await ctx.canAccessTenant(tag.tenantId))) return deny("FORBIDDEN", tag.id);

  await ctx.audit?.record({
    type: "READ",
    tagId: tag.id,
    equipmentId: tag.equipmentId,
    actorId: ctx.actorId ?? null,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  return { ok: true, tagId: tag.id, equipmentId: tag.equipmentId, tenantId: tag.tenantId };
}

/**
 * Callers get one generic message for every denial. Distinguishing "no such
 * tag" from "not yours" would let someone enumerate valid tags.
 */
export function denialMessage(_reason: ResolveDenial): string {
  return "This tag could not be resolved. It may be unassigned, replaced, or not available to your account.";
}
