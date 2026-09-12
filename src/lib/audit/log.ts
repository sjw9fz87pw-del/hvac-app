/**
 * Append-only audit log.
 *
 * Written inside the same transaction as the change it describes, so an audited
 * event cannot exist without its change or vice versa. There is no update or
 * delete path.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export type AuditAction =
  | "asset.created" | "asset.updated" | "asset.archived" | "asset.verified"
  | "asset.replaced" | "asset.frequency_changed"
  | "tag.minted" | "tag.assigned" | "tag.replaced" | "tag.unpaired"
  | "tag.reassigned" | "tag.revoked" | "tag.verified"
  | "service.completed" | "service.edited"
  | "issue.created" | "issue.assigned" | "issue.resolved"
  | "visit.created" | "visit.updated" | "visit.completed"
  | "location.created" | "location.updated" | "area.created"
  | "org.created" | "user.invited" | "user.role_changed"
  | "auth.login" | "auth.logout" | "auth.login_failed";

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  organizationId?: string | null;
  before?: unknown;
  after?: unknown;
  detail?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

type Client = Prisma.TransactionClient | typeof prisma;

export async function recordAudit(input: AuditInput, client: Client = prisma): Promise<void> {
  await client.auditEvent.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId ?? null,
      organizationId: input.organizationId ?? null,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      detail: (input.detail ?? {}) as Prisma.InputJsonValue,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
