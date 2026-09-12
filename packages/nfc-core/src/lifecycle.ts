/**
 * Tag lifecycle state machine.
 *
 * A physical tag moves through a small, strictly-validated set of states. The
 * point of centralising it here is that "replace a damaged tag" and "reassign a
 * tag to different equipment" are distinct operations with different audit
 * meanings, and neither may ever silently drop history.
 */

export type TagState = "UNASSIGNED" | "ACTIVE" | "REVOKED" | "LOST";

export type TagAction =
  | "PAIR"       // unassigned stock -> paired to an asset
  | "UNPAIR"     // paired -> back to unassigned stock
  | "REASSIGN"   // paired -> paired to a different asset
  | "REVOKE"     // any live state -> permanently dead
  | "MARK_LOST"; // physically missing; may be revoked later

const TRANSITIONS: Record<TagAction, { from: TagState[]; to: TagState }> = {
  PAIR: { from: ["UNASSIGNED"], to: "ACTIVE" },
  UNPAIR: { from: ["ACTIVE"], to: "UNASSIGNED" },
  REASSIGN: { from: ["ACTIVE"], to: "ACTIVE" },
  REVOKE: { from: ["UNASSIGNED", "ACTIVE", "LOST"], to: "REVOKED" },
  MARK_LOST: { from: ["ACTIVE"], to: "LOST" },
};

export type TransitionResult =
  | { ok: true; state: TagState }
  | { ok: false; reason: string };

export function canTransition(from: TagState, action: TagAction): boolean {
  return TRANSITIONS[action]?.from.includes(from) ?? false;
}

export function transition(from: TagState, action: TagAction): TransitionResult {
  const rule = TRANSITIONS[action];
  if (!rule) return { ok: false, reason: `Unknown tag action "${action}"` };
  if (!rule.from.includes(from)) {
    return { ok: false, reason: `A ${from} tag cannot be ${action.toLowerCase().replace(/_/g, " ")}ed` };
  }
  return { ok: true, state: rule.to };
}

/** A REVOKED tag is dead forever - there is no path back out of it. */
export function isTerminal(state: TagState): boolean {
  return state === "REVOKED";
}

/** Only an ACTIVE tag may resolve to equipment on a read. */
export function isReadable(state: TagState): boolean {
  return state === "ACTIVE";
}
