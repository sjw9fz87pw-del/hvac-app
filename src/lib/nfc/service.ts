/**
 * NFC tag operations for this application.
 *
 * All the domain logic - token format, signature, lifecycle rules, resolution
 * checks - lives in `@pmops/nfc-core`, which knows nothing about Prisma or Next.
 * This file is the adapter: it implements the package's ports over our schema
 * and wraps each operation in a transaction plus an audit trail.
 */
import type { Prisma } from "@prisma/client";
import {
  mintTagToken, macPrefix, buildTagUrl, resolveTagPayload, transition,
  type TagState, type TagStore, type TagAuditSink, type TagAuditType,
} from "@pmops/nfc-core";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit/log";
import type { Actor } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/session";
import { canAccessOrganization, canAccessAsset } from "@/lib/auth/scope";

function tagSecret(): string {
  const secret = process.env.NFC_TAG_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("NFC_TAG_SECRET must be set to at least 32 characters");
  }
  return secret;
}

export function appBaseUrl(): string {
  // Netlify sets URL to the site's primary address on every build and every
  // function invocation, so APP_BASE_URL only needs setting for a custom domain
  // or a non-Netlify host. One less thing to configure by hand, and one less
  // thing to get wrong when a tag URL has to be right forever.
  return process.env.APP_BASE_URL ?? process.env.URL ?? "http://localhost:3000";
}

// --- ports -----------------------------------------------------------------

export const tagStore: TagStore = {
  async findByTokenId(tokenId) {
    const tag = await prisma.tag.findUnique({
      where: { tokenId },
      include: { assignments: { where: { unassignedAt: null }, take: 1 } },
    });
    if (!tag) return null;
    return {
      id: tag.id,
      tokenId: tag.tokenId,
      state: tag.state as TagState,
      tenantId: tag.organizationId,
      equipmentId: tag.assignments[0]?.equipmentId ?? null,
    };
  },
};

export function tagAuditSink(client: Prisma.TransactionClient | typeof prisma = prisma): TagAuditSink {
  return {
    async record(event) {
      await client.tagEvent.create({
        data: {
          tagId: event.tagId ?? null,
          equipmentId: event.equipmentId ?? null,
          actorId: event.actorId ?? null,
          type: event.type as TagAuditType,
          detail: (event.detail ?? {}) as Prisma.InputJsonValue,
          ip: event.ip ?? null,
          userAgent: event.userAgent ?? null,
        },
      });
    },
  };
}

// --- reading ---------------------------------------------------------------

export interface TapContext {
  actor: Actor;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Resolve a tapped tag or scanned QR code to equipment.
 *
 * Authorization is decided from the actor's session-derived scope. A cloned tag
 * gains nothing: the caller still has to be entitled to that tenant.
 */
export async function resolveTap(payload: string, ctx: TapContext) {
  const outcome = await resolveTagPayload(payload, {
    secret: tagSecret(),
    store: tagStore,
    audit: tagAuditSink(),
    canAccessTenant: (tenantId) => canAccessOrganization(ctx.actor, tenantId),
    actorId: ctx.actor.userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  if (!outcome.ok) return outcome;

  // nfc-core gates on the tenant, which is its contract. Location scope is this
  // application's concept, so it is enforced here: a location manager tapping a
  // tag at a sibling restaurant in their own group must still be refused.
  const equipment = await prisma.equipment.findUnique({
    where: { id: outcome.equipmentId },
    select: { organizationId: true, locationId: true },
  });
  if (!equipment || !canAccessAsset(ctx.actor, equipment)) {
    await tagAuditSink().record({
      type: "READ_DENIED",
      tagId: outcome.tagId,
      actorId: ctx.actor.userId,
      detail: { reason: "FORBIDDEN" },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return { ok: false as const, reason: "FORBIDDEN" as const };
  }

  return outcome;
}

// --- writing / pairing -----------------------------------------------------

export interface MintOptions {
  organizationId: string;
  label?: string | null;
  actor: Actor;
}

/**
 * Mint an identifier for a blank tag. The payload returned here is what the
 * client writes to the chip; the tag is not usable until it is paired, and it
 * is not paired until the write has been read back and verified.
 */
export async function mintTag(opts: MintOptions) {
  const token = mintTagToken(tagSecret(), { tenantId: opts.organizationId });

  const tag = await prisma.$transaction(async (tx) => {
    const created = await tx.tag.create({
      data: {
        organizationId: opts.organizationId,
        tokenId: token.tokenId,
        macPrefix: macPrefix(token),
        tenantHint: token.tenantHint,
        state: "UNASSIGNED",
        label: opts.label ?? null,
      },
    });
    await tagAuditSink(tx).record({ type: "MINTED", tagId: created.id, actorId: opts.actor.userId });
    await recordAudit(
      { action: "tag.minted", entityType: "Tag", entityId: created.id, actorId: opts.actor.userId, organizationId: opts.organizationId },
      tx,
    );
    return created;
  });

  return { tag, payload: token.payload, url: buildTagUrl(appBaseUrl(), token.payload) };
}

export class TagOperationError extends Error {
  constructor(message: string, public code: string = "TAG_OPERATION_FAILED") {
    super(message);
    this.name = "TagOperationError";
  }
}

/**
 * Confirm that the identifier written to the chip reads back correctly.
 *
 * Pairing is only allowed after this succeeds. A failed verify is recorded so it
 * shows up in the command center's "Failed NFC pairing" list rather than
 * silently leaving a half-written tag in the field.
 */
export async function verifyWrite(tagId: string, readBackPayload: string, actor: Actor) {
  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) throw new TagOperationError("Tag not found", "TAG_NOT_FOUND");

  const expectedTokenId = tag.tokenId;
  const parts = readBackPayload.trim().split(".");
  const ok = parts.length === 4 && parts[2] === expectedTokenId;

  await prisma.$transaction(async (tx) => {
    await tagAuditSink(tx).record({
      type: ok ? "VERIFIED" : "VERIFY_FAILED",
      tagId: tag.id,
      actorId: actor.userId,
      detail: ok ? {} : { reason: "Read-back did not match the written identifier" },
    });
    if (ok) await tx.tag.update({ where: { id: tag.id }, data: { verifiedAt: new Date(), writtenAt: tag.writtenAt ?? new Date() } });
  });

  return { verified: ok };
}

/** Record that a physical write failed, so the tag does not linger as phantom stock. */
export async function recordWriteFailure(tagId: string, reason: string, actor: Actor) {
  await tagAuditSink().record({
    type: "WRITE_FAILED", tagId, actorId: actor.userId, detail: { reason },
  });
}

export interface PairOptions {
  tagId: string;
  equipmentId: string;
  actor: Actor;
  /** Set when the client has completed a successful read-back verification. */
  verified: boolean;
}

/**
 * Pair a verified tag to equipment. Refuses unless the write was verified -
 * an unverified pairing produces a tag in the field that resolves to nothing.
 */
export async function pairTag(opts: PairOptions) {
  if (!opts.verified) {
    throw new TagOperationError("The tag write must be verified before pairing", "VERIFICATION_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const tag = await tx.tag.findUnique({ where: { id: opts.tagId } });
    if (!tag) throw new TagOperationError("Tag not found", "TAG_NOT_FOUND");

    const equipment = await tx.equipment.findUnique({ where: { id: opts.equipmentId } });
    if (!equipment) throw new TagOperationError("Equipment not found", "EQUIPMENT_NOT_FOUND");
    if (!canAccessAsset(opts.actor, equipment)) throw new AuthError(404, "Not found");

    // A tag minted for one customer must never end up on another's equipment.
    if (tag.organizationId && tag.organizationId !== equipment.organizationId) {
      throw new TagOperationError("This tag belongs to a different customer", "TENANT_MISMATCH");
    }

    const move = transition(tag.state as TagState, "PAIR");
    if (!move.ok) throw new TagOperationError(move.reason, "ILLEGAL_TRANSITION");

    // One live tag per asset: close any existing pairing first.
    await tx.tagAssignment.updateMany({
      where: { equipmentId: opts.equipmentId, unassignedAt: null },
      data: { unassignedAt: new Date(), unassignedById: opts.actor.userId, unassignReason: "Replaced by a new tag" },
    });

    const assignment = await tx.tagAssignment.create({
      data: { tagId: tag.id, equipmentId: opts.equipmentId, assignedById: opts.actor.userId },
    });

    const updated = await tx.tag.update({
      where: { id: tag.id },
      data: { state: move.state, organizationId: equipment.organizationId, writtenAt: tag.writtenAt ?? new Date() },
    });

    await tagAuditSink(tx).record({
      type: "PAIRED", tagId: tag.id, equipmentId: opts.equipmentId, actorId: opts.actor.userId,
    });
    await recordAudit(
      {
        action: "tag.assigned", entityType: "Equipment", entityId: opts.equipmentId,
        actorId: opts.actor.userId, organizationId: equipment.organizationId,
        detail: { tagId: tag.id },
      },
      tx,
    );

    return { tag: updated, assignment };
  });
}

export interface UnpairOptions {
  equipmentId: string;
  actor: Actor;
  reason?: string;
  /** Revoke rather than return the tag to stock (damaged, lost, compromised). */
  revoke?: boolean;
}

export async function unpairTag(opts: UnpairOptions) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.tagAssignment.findFirst({
      where: { equipmentId: opts.equipmentId, unassignedAt: null },
      include: { tag: true, equipment: true },
    });
    if (!assignment) throw new TagOperationError("This equipment has no paired tag", "NOT_PAIRED");
    if (!canAccessAsset(opts.actor, assignment.equipment)) throw new AuthError(404, "Not found");

    const action = opts.revoke ? "REVOKE" : "UNPAIR";
    const move = transition(assignment.tag.state as TagState, action);
    if (!move.ok) throw new TagOperationError(move.reason, "ILLEGAL_TRANSITION");

    // History is closed out, never deleted.
    await tx.tagAssignment.update({
      where: { id: assignment.id },
      data: { unassignedAt: new Date(), unassignedById: opts.actor.userId, unassignReason: opts.reason ?? null },
    });

    const updated = await tx.tag.update({
      where: { id: assignment.tagId },
      data: {
        state: move.state,
        ...(opts.revoke ? { revokedAt: new Date(), revokedReason: opts.reason ?? "Revoked" } : {}),
      },
    });

    await tagAuditSink(tx).record({
      type: opts.revoke ? "REVOKED" : "UNPAIRED",
      tagId: assignment.tagId, equipmentId: opts.equipmentId, actorId: opts.actor.userId,
      detail: { reason: opts.reason ?? null },
    });
    await recordAudit(
      {
        action: opts.revoke ? "tag.revoked" : "tag.unpaired",
        entityType: "Equipment", entityId: opts.equipmentId,
        actorId: opts.actor.userId, organizationId: assignment.equipment.organizationId,
        detail: { tagId: assignment.tagId, reason: opts.reason ?? null },
      },
      tx,
    );

    return updated;
  });
}

export interface ReplaceOptions {
  equipmentId: string;
  newTagId: string;
  actor: Actor;
  reason: string;
  verified: boolean;
}

/**
 * Replace a damaged tag. The old tag is revoked and the new one paired in a
 * single transaction, so the asset is never left without an identity and the
 * old tag's history stays attached to it.
 */
export async function replaceTag(opts: ReplaceOptions) {
  if (!opts.verified) {
    throw new TagOperationError("The replacement tag must be verified before pairing", "VERIFICATION_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: opts.equipmentId } });
    if (!equipment) throw new TagOperationError("Equipment not found", "EQUIPMENT_NOT_FOUND");
    if (!canAccessAsset(opts.actor, equipment)) throw new AuthError(404, "Not found");

    const current = await tx.tagAssignment.findFirst({
      where: { equipmentId: opts.equipmentId, unassignedAt: null },
      include: { tag: true },
    });

    if (current) {
      const revoke = transition(current.tag.state as TagState, "REVOKE");
      if (!revoke.ok) throw new TagOperationError(revoke.reason, "ILLEGAL_TRANSITION");
      await tx.tagAssignment.update({
        where: { id: current.id },
        data: { unassignedAt: new Date(), unassignedById: opts.actor.userId, unassignReason: opts.reason },
      });
      await tx.tag.update({
        where: { id: current.tagId },
        data: { state: revoke.state, revokedAt: new Date(), revokedReason: opts.reason },
      });
      await tagAuditSink(tx).record({
        type: "REPLACED", tagId: current.tagId, equipmentId: opts.equipmentId,
        actorId: opts.actor.userId, detail: { reason: opts.reason, replacedByTagId: opts.newTagId },
      });
    }

    const newTag = await tx.tag.findUnique({ where: { id: opts.newTagId } });
    if (!newTag) throw new TagOperationError("Replacement tag not found", "TAG_NOT_FOUND");
    const pair = transition(newTag.state as TagState, "PAIR");
    if (!pair.ok) throw new TagOperationError(pair.reason, "ILLEGAL_TRANSITION");

    await tx.tagAssignment.create({
      data: { tagId: newTag.id, equipmentId: opts.equipmentId, assignedById: opts.actor.userId },
    });
    const updated = await tx.tag.update({
      where: { id: newTag.id },
      data: { state: pair.state, organizationId: equipment.organizationId, writtenAt: new Date() },
    });

    await tagAuditSink(tx).record({
      type: "PAIRED", tagId: newTag.id, equipmentId: opts.equipmentId, actorId: opts.actor.userId,
      detail: { replacesTagId: current?.tagId ?? null },
    });
    await recordAudit(
      {
        action: "tag.replaced", entityType: "Equipment", entityId: opts.equipmentId,
        actorId: opts.actor.userId, organizationId: equipment.organizationId,
        before: { tagId: current?.tagId ?? null }, after: { tagId: newTag.id },
        detail: { reason: opts.reason },
      },
      tx,
    );

    return updated;
  });
}

/** Move a live tag from one asset to another without revoking it. */
export async function reassignTag(opts: { tagId: string; toEquipmentId: string; actor: Actor; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const tag = await tx.tag.findUnique({ where: { id: opts.tagId } });
    if (!tag) throw new TagOperationError("Tag not found", "TAG_NOT_FOUND");

    const target = await tx.equipment.findUnique({ where: { id: opts.toEquipmentId } });
    if (!target) throw new TagOperationError("Equipment not found", "EQUIPMENT_NOT_FOUND");
    if (!canAccessAsset(opts.actor, target)) throw new AuthError(404, "Not found");
    if (tag.organizationId && tag.organizationId !== target.organizationId) {
      throw new TagOperationError("This tag belongs to a different customer", "TENANT_MISMATCH");
    }

    const move = transition(tag.state as TagState, "REASSIGN");
    if (!move.ok) throw new TagOperationError(move.reason, "ILLEGAL_TRANSITION");

    await tx.tagAssignment.updateMany({
      where: { tagId: opts.tagId, unassignedAt: null },
      data: { unassignedAt: new Date(), unassignedById: opts.actor.userId, unassignReason: opts.reason },
    });
    await tx.tagAssignment.updateMany({
      where: { equipmentId: opts.toEquipmentId, unassignedAt: null },
      data: { unassignedAt: new Date(), unassignedById: opts.actor.userId, unassignReason: "Superseded by reassignment" },
    });
    await tx.tagAssignment.create({
      data: { tagId: opts.tagId, equipmentId: opts.toEquipmentId, assignedById: opts.actor.userId },
    });

    await tagAuditSink(tx).record({
      type: "REASSIGNED", tagId: opts.tagId, equipmentId: opts.toEquipmentId,
      actorId: opts.actor.userId, detail: { reason: opts.reason },
    });
    await recordAudit(
      {
        action: "tag.reassigned", entityType: "Tag", entityId: opts.tagId,
        actorId: opts.actor.userId, organizationId: target.organizationId,
        after: { equipmentId: opts.toEquipmentId }, detail: { reason: opts.reason },
      },
      tx,
    );

    return tx.tag.findUnique({ where: { id: opts.tagId } });
  });
}

/** Read a tag without side effects on the asset - the "Test Tag" console action. */
export async function testTag(payload: string, ctx: TapContext) {
  const outcome = await resolveTap(payload, ctx);
  if (outcome.ok) {
    await tagAuditSink().record({ type: "TESTED", tagId: outcome.tagId, actorId: ctx.actor.userId });
  }
  return outcome;
}
