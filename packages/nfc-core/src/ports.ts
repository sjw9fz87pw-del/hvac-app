/**
 * Ports the host application implements. Keeping persistence and auditing behind
 * interfaces is what lets this package be dropped into another service (CCG Ops
 * Hub) that has an entirely different database.
 */
import type { TagState } from "./lifecycle";

export interface TagRecord {
  id: string;
  tokenId: string;
  state: TagState;
  tenantId: string | null;
  equipmentId: string | null;
}

export interface TagStore {
  findByTokenId(tokenId: string): Promise<TagRecord | null>;
}

export type TagAuditType =
  | "MINTED" | "WRITTEN" | "WRITE_FAILED" | "VERIFIED" | "VERIFY_FAILED"
  | "PAIRED" | "UNPAIRED" | "REASSIGNED" | "REPLACED" | "REVOKED"
  | "READ" | "READ_DENIED" | "TESTED"
  | "LOCKED" | "LOCK_FAILED";

export interface TagAuditEvent {
  type: TagAuditType;
  tagId?: string | null;
  equipmentId?: string | null;
  actorId?: string | null;
  detail?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface TagAuditSink {
  record(event: TagAuditEvent): Promise<void>;
}

/**
 * Abstracts the physical transport. Web NFC on Chrome for Android, a native
 * bridge in a wrapper app, or a mock in tests - the pairing flow does not care.
 */
export interface NfcTransport {
  isSupported(): boolean;
  write(payload: string): Promise<void>;
  readOnce(timeoutMs?: number): Promise<string>;

  /**
   * Make the chip permanently read-only.
   *
   * Separate from `write` because the underlying APIs are separate — Web NFC
   * exposes `NDEFReader.makeReadOnly()` as its own call, and a device can be
   * able to write while unable to lock. Optional for the same reason: a
   * transport that cannot lock omits it, and `canLock` says so up front.
   *
   * **Irreversible.** Only call it once the write has been read back, verified,
   * and the pairing committed: a locked tag pointing at nothing is scrap.
   */
  canLock?(): boolean;
  lock?(timeoutMs?: number): Promise<void>;
}
