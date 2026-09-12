import type { Actor } from "./session";

/**
 * Where a signed-in user belongs. Technicians land on Today, internal staff on
 * the command center, customers on their dashboard - nobody has to pick.
 */
export function homeFor(actor: Actor): string {
  if (actor.roles.includes("TECHNICIAN") && !actor.roles.some((r) => r === "SUPER_ADMIN" || r === "OPERATIONS_ADMIN")) {
    return "/tech";
  }
  if (actor.internal) return "/admin";
  return "/home";
}
