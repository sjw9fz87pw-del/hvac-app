/**
 * Capability-based permissions.
 *
 * Handlers assert capabilities, not routes, so adding a route can never
 * accidentally widen access. The UI hides buttons for convenience only - every
 * server handler re-checks, because hidden is not the same as forbidden.
 */

export type Role =
  | "SUPER_ADMIN"
  | "OPERATIONS_ADMIN"
  | "SERVICE_MANAGER"
  | "TECHNICIAN"
  | "CUSTOMER_ORG_OWNER"
  | "CUSTOMER_LOCATION_MANAGER"
  | "CUSTOMER_STAFF";

export type Capability =
  // equipment
  | "equipment.read" | "equipment.create" | "equipment.update" | "equipment.archive"
  | "equipment.verify" | "equipment.readInternalNotes"
  // organizations / locations
  | "org.read" | "org.manage" | "location.manage" | "area.manage"
  // NFC
  | "tag.read" | "tag.pair" | "tag.replace" | "tag.unpair" | "tag.reassign"
  | "tag.revoke" | "tag.mint" | "tag.viewHistory"
  // maintenance
  | "schedule.read" | "schedule.manage" | "plan.manage"
  // visits & service
  | "visit.read" | "visit.manage" | "service.perform" | "service.complete" | "service.edit"
  // issues
  | "issue.read" | "issue.create" | "issue.triage" | "issue.assign" | "issue.resolve"
  // reporting & admin
  | "report.view" | "report.viewCosts" | "technician.manage" | "user.manage"
  | "settings.manage" | "audit.view" | "search.global";

const CUSTOMER_BASE: Capability[] = [
  "equipment.read", "org.read", "schedule.read", "visit.read",
  "issue.read", "issue.create", "tag.read",
];

const TECHNICIAN_CAPS: Capability[] = [
  "equipment.read", "equipment.create", "equipment.update", "equipment.readInternalNotes",
  // Internal staff need to see which customer and location an asset belongs to;
  // `org.manage` is the separate, narrower right to change them.
  "org.read",
  "area.manage", "tag.read", "tag.pair", "tag.replace", "tag.unpair", "tag.reassign",
  "tag.mint", "tag.viewHistory", "schedule.read", "visit.read", "service.perform",
  "service.complete", "issue.read", "issue.create", "search.global",
];

const SERVICE_MANAGER_CAPS: Capability[] = [
  ...TECHNICIAN_CAPS,
  "equipment.archive", "equipment.verify", "location.manage", "tag.revoke",
  "schedule.manage", "plan.manage", "visit.manage", "issue.triage", "issue.assign",
  "issue.resolve", "report.view", "technician.manage",
];

const OPERATIONS_ADMIN_CAPS: Capability[] = [
  ...SERVICE_MANAGER_CAPS, "org.manage", "user.manage", "report.viewCosts", "audit.view",
];

const ALL_CAPS: Capability[] = [...OPERATIONS_ADMIN_CAPS, "settings.manage", "service.edit"];

export const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  SUPER_ADMIN: new Set(ALL_CAPS),
  OPERATIONS_ADMIN: new Set(OPERATIONS_ADMIN_CAPS),
  SERVICE_MANAGER: new Set(SERVICE_MANAGER_CAPS),
  TECHNICIAN: new Set(TECHNICIAN_CAPS),
  CUSTOMER_ORG_OWNER: new Set<Capability>([
    ...CUSTOMER_BASE, "equipment.create", "equipment.update", "report.view", "user.manage",
  ]),
  CUSTOMER_LOCATION_MANAGER: new Set<Capability>([
    ...CUSTOMER_BASE, "equipment.create", "equipment.update", "report.view",
  ]),
  // Deliberately narrow: view equipment and raise problems, nothing else.
  CUSTOMER_STAFF: new Set<Capability>(CUSTOMER_BASE),
};

export const INTERNAL_ROLES: ReadonlySet<Role> = new Set<Role>([
  "SUPER_ADMIN", "OPERATIONS_ADMIN", "SERVICE_MANAGER", "TECHNICIAN",
]);

export function isInternalRole(role: Role): boolean {
  return INTERNAL_ROLES.has(role);
}

export function roleHas(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
}

/** A user may hold several memberships; capabilities are the union of their roles. */
export function capabilitiesFor(roles: readonly Role[]): Set<Capability> {
  const caps = new Set<Capability>();
  for (const role of roles) for (const cap of ROLE_CAPABILITIES[role] ?? []) caps.add(cap);
  return caps;
}
