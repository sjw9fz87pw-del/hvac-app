/**
 * Tenant isolation.
 *
 * Every tenant-scoped query goes through a `where` fragment built here from the
 * Actor. The rules, in one place so they cannot drift:
 *
 *   1. Scope comes from the session's membership rows, never from the request.
 *   2. A client-supplied organization/location id is a *filter within* that
 *      scope. If it falls outside, the request is refused.
 *   3. Refusals are 404, not 403 - telling someone "that exists but is not
 *      yours" is itself a leak of another customer's data.
 */
import { AuthError, type Actor } from "./session";

export interface ScopeFilter {
  organizationId?: string | { in: string[] };
  locationId?: string | { in: string[] };
}

/** Organization ids the actor may touch. `null` means "every tenant of the service company". */
export function organizationScope(actor: Actor): string[] | null {
  if (actor.internal) return null;
  return [...actor.organizationIds];
}

export function canAccessOrganization(actor: Actor, organizationId: string): boolean {
  if (actor.internal) return true;
  return actor.organizationIds.has(organizationId);
}

export function canAccessLocation(actor: Actor, locationId: string, organizationId?: string): boolean {
  if (actor.internal) return true;
  if (organizationId && !actor.organizationIds.has(organizationId)) return false;
  // A location-scoped actor is restricted to their own locations even within an
  // organization they belong to: a location manager at one restaurant must not
  // see a sibling restaurant in the same group.
  if (actor.locationIds !== null) return actor.locationIds.has(locationId);
  return true;
}

/**
 * The resource-level check for anything that lives at a location - equipment,
 * issues, visits, service records.
 *
 * Organization membership alone is not enough. Checking only the organization is
 * what lets a location manager read a sibling restaurant's equipment, so both
 * dimensions are verified here and every resource handler uses this rather than
 * `canAccessOrganization` directly.
 */
export function canAccessAsset(
  actor: Actor,
  resource: { organizationId: string; locationId: string },
): boolean {
  if (!canAccessOrganization(actor, resource.organizationId)) return false;
  return canAccessLocation(actor, resource.locationId, resource.organizationId);
}

export function assertAsset(actor: Actor, resource: { organizationId: string; locationId: string }): void {
  if (!canAccessAsset(actor, resource)) throw new AuthError(404, "Not found");
}

export function assertOrganization(actor: Actor, organizationId: string): void {
  if (!canAccessOrganization(actor, organizationId)) {
    throw new AuthError(404, "Not found");
  }
}

export function assertLocation(actor: Actor, locationId: string, organizationId?: string): void {
  if (!canAccessLocation(actor, locationId, organizationId)) {
    throw new AuthError(404, "Not found");
  }
}

/**
 * The `where` fragment for any table carrying organizationId/locationId.
 *
 * @param requested optional narrowing from the client. Validated against the
 *                  actor's scope before it is applied.
 */
export function tenantWhere(
  actor: Actor,
  requested: { organizationId?: string | null; locationId?: string | null } = {},
): ScopeFilter {
  const where: ScopeFilter = {};

  if (requested.organizationId) {
    assertOrganization(actor, requested.organizationId);
    where.organizationId = requested.organizationId;
  } else if (!actor.internal) {
    const ids = [...actor.organizationIds];
    // An empty scope must match nothing, never everything.
    where.organizationId = { in: ids.length > 0 ? ids : ["__none__"] };
  }

  if (requested.locationId) {
    assertLocation(actor, requested.locationId);
    where.locationId = requested.locationId;
  } else if (!actor.internal && actor.locationIds) {
    const ids = [...actor.locationIds];
    where.locationId = { in: ids.length > 0 ? ids : ["__none__"] };
  }

  return where;
}

/**
 * Internal staff see internal notes; customers never do, whatever their role.
 * Used by the serializers as a second line of defence behind field selection.
 */
export function canSeeInternalNotes(actor: Actor): boolean {
  return actor.internal && actor.capabilities.has("equipment.readInternalNotes");
}
