/**
 * Sessions and the Actor - the single source of truth for who is asking and
 * what they may see.
 *
 * The critical property: an Actor's tenant scope is derived from membership rows
 * read out of the database using the session id in the cookie. Nothing the
 * client sends contributes to it. A client-supplied organization id can only
 * ever *narrow* a query within that derived scope (see `lib/auth/scope.ts`).
 */
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db/client";
import { capabilitiesFor, isInternalRole, type Capability, type Role } from "./permissions";

export const SESSION_COOKIE = "pmops_session";
const SESSION_TTL_DAYS = 30;

export interface Actor {
  userId: string;
  name: string;
  email: string;
  serviceCompanyId: string;
  roles: Role[];
  capabilities: Set<Capability>;
  /** True for staff of the service company (admin/ops/manager/technician). */
  internal: boolean;
  /**
   * Customer organizations this actor may see. Empty for internal staff, who are
   * scoped by `internal` instead (they see every tenant of their service company).
   */
  organizationIds: Set<string>;
  /** Non-empty only when the actor is restricted to specific locations. */
  locationIds: Set<string> | null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return { token, expiresAt };
}

export async function revokeSession(token: string) {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Builds the Actor from a raw session token. Returns null if the session is unusable. */
export async function actorFromToken(token: string | undefined | null): Promise<Actor | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { memberships: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;

  const memberships = session.user.memberships;
  if (memberships.length === 0) return null;

  const roles = memberships.map((m) => m.role as Role);
  const internal = roles.some(isInternalRole);

  const organizationIds = new Set<string>();
  for (const m of memberships) if (m.organizationId) organizationIds.add(m.organizationId);

  // A location restriction only applies when *every* membership names a
  // location. One unrestricted membership grants the whole organization.
  const locationScoped = memberships.length > 0 && memberships.every((m) => m.locationId);
  const locationIds = locationScoped
    ? new Set(memberships.map((m) => m.locationId!).filter(Boolean))
    : null;

  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    serviceCompanyId: session.user.serviceCompanyId,
    roles,
    capabilities: capabilitiesFor(roles),
    internal,
    organizationIds,
    locationIds,
  };
}

/** The current Actor from the request cookie, or null when signed out. */
export async function currentActor(): Promise<Actor | null> {
  const store = await cookies();
  return actorFromToken(store.get(SESSION_COOKIE)?.value);
}

export class AuthError extends Error {
  constructor(public status: 401 | 403 | 404, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new AuthError(401, "Sign in to continue");
  return actor;
}

export function assertCapability(actor: Actor, capability: Capability): void {
  if (!actor.capabilities.has(capability)) {
    throw new AuthError(403, `Your role does not allow ${capability}`);
  }
}

export async function requireCapability(capability: Capability): Promise<Actor> {
  const actor = await requireActor();
  assertCapability(actor, capability);
  return actor;
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
