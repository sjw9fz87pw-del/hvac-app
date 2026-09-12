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
  | "READ" | "READ_DENIED" | "TESTED";

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
  write(payload: string, opts?: { lockReadOnly?: boolean }): Promise<void>;
  readOnce(timeoutMs?: number): Promise<string>;
}
