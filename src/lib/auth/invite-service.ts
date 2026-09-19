/**
 * Issuing invitation and reset links, and the side effects that go with them.
 * Shared by user creation, "resend invite" and "reset password", so all three
 * produce exactly the same kind of link through exactly the same checks.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { recordAudit, type AuditAction } from "@/lib/audit/log";
import { sendEmail, inviteEmail, resetEmail, emailConfigured } from "@/lib/email/send";
import { mintInviteToken, unusablePasswordHash, isUnusable, INVITE_TTL_HOURS, RESET_TTL_HOURS } from "./invite";

export interface IssuedLink {
  link: string;
  expiresInHours: number;
  /** Whether it actually went out by email, or has to be passed on by hand. */
  emailed: boolean;
  emailError?: string;
}

function baseUrl(): string {
  const configured = process.env.APP_BASE_URL ?? process.env.URL;
  return (configured ?? "http://localhost:3000").replace(/\/$/, "");
}

/** A hash no password can produce, so the account cannot be signed into yet. */
export function freshUnusableHash(): string {
  return unusablePasswordHash(randomBytes(24).toString("base64url"));
}

/**
 * Issue a link for a user and try to email it.
 *
 * Whether the email sends or not, the link comes back — the caller shows it so
 * an admin is never stuck waiting on deliverability.
 */
export async function issueAccessLink(
  userId: string,
  kind: "invite" | "reset",
  actorId: string | null,
): Promise<IssuedLink> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { serviceCompany: { select: { name: true } } },
  });

  const ttl = kind === "invite" ? INVITE_TTL_HOURS : RESET_TTL_HOURS;
  const token = mintInviteToken({ userId: user.id, passwordHash: user.passwordHash }, ttl);
  const link = `${baseUrl()}/invite/${token}`;

  const message = kind === "invite"
    ? inviteEmail({ name: user.name, companyName: user.serviceCompany.name, link, expiresInHours: ttl })
    : resetEmail({ name: user.name, companyName: user.serviceCompany.name, link, expiresInHours: ttl });

  const result = emailConfigured()
    ? await sendEmail({ ...message, to: user.email })
    : ({ sent: false, reason: "not_configured" } as const);

  await recordAudit({
    action: (kind === "invite" ? "user.invited" : "user.reset_requested") as AuditAction,
    entityType: "User",
    entityId: user.id,
    actorId,
    organizationId: null,
    // Never the token. Only that a link was issued, and whether it was delivered.
    after: { email: user.email, emailed: result.sent, expiresInHours: ttl },
  });

  return {
    link,
    expiresInHours: ttl,
    emailed: result.sent,
    emailError: result.sent ? undefined : "reason" in result && result.reason === "failed" ? result.detail : undefined,
  };
}

/** Has this account never been set up — still holding a placeholder hash? */
export function awaitingSetup(passwordHash: string): boolean {
  return isUnusable(passwordHash);
}
