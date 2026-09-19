/**
 * Plain-English descriptions of the roles, for the screens where someone picks
 * one. Pure and framework-free so both the picker and the people list can use
 * it, and so it can be unit-tested against the capability matrix — a role whose
 * description drifts from what it can actually do is a permissions bug waiting
 * to happen.
 */
import type { Role } from "./permissions";

export interface RoleCopy {
  role: Role;
  label: string;
  /** One line, written from the point of view of what the person will see. */
  summary: string;
  /** Internal staff, or someone on the restaurant side. */
  kind: "internal" | "customer";
  /** Whether a membership for this role is pinned to a single restaurant. */
  scope: "company" | "group" | "restaurant";
}

export const ROLE_COPY: readonly RoleCopy[] = [
  {
    role: "SUPER_ADMIN", label: "Owner", kind: "internal", scope: "company",
    summary: "Everything, including settings and adding other owners.",
  },
  {
    role: "OPERATIONS_ADMIN", label: "Admin", kind: "internal", scope: "company",
    summary: "Everything except app settings. Can add people and see costs.",
  },
  {
    role: "SERVICE_MANAGER", label: "Service manager", kind: "internal", scope: "company",
    summary: "Schedules visits, manages restaurants, units and tags.",
  },
  {
    role: "TECHNICIAN", label: "Technician", kind: "internal", scope: "company",
    summary: "Does the work: visits, completing service, pairing tags.",
  },
  {
    role: "CUSTOMER_ORG_OWNER", label: "Restaurant group owner", kind: "customer", scope: "group",
    summary: "Sees every restaurant in their group, and can add their own staff.",
  },
  {
    role: "CUSTOMER_LOCATION_MANAGER", label: "Restaurant manager", kind: "customer", scope: "restaurant",
    summary: "Sees one restaurant only — not the others in the group.",
  },
  {
    role: "CUSTOMER_STAFF", label: "Restaurant staff", kind: "customer", scope: "restaurant",
    summary: "Sees the equipment and can report a problem. Nothing else.",
  },
];

export function roleCopy(role: Role): RoleCopy {
  return ROLE_COPY.find((entry) => entry.role === role)!;
}

export function roleLabel(role: Role): string {
  return ROLE_COPY.find((entry) => entry.role === role)?.label ?? role;
}
