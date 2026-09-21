/**
 * Equipment condition, described in words a person would use.
 *
 * Kept out of the components so the wording is identical wherever it appears —
 * a unit's own page, the bulk picker, a list badge — and so the ordering can be
 * tested rather than re-typed.
 */
export type Condition = "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "UNKNOWN";

export interface ConditionCopy {
  value: Condition;
  label: string;
  hint: string;
  tone: "good" | "warn" | "bad" | "neutral";
}

/** Best to worst, with "not looked at yet" last — it is an absence, not a grade. */
export const CONDITIONS: readonly ConditionCopy[] = [
  { value: "EXCELLENT", label: "Excellent", hint: "As good as new", tone: "good" },
  { value: "GOOD", label: "Good", hint: "Working normally", tone: "good" },
  { value: "FAIR", label: "Fair", hint: "Worn but working", tone: "warn" },
  { value: "POOR", label: "Poor", hint: "Needs attention soon", tone: "bad" },
  { value: "UNKNOWN", label: "Not checked", hint: "Nobody has assessed it", tone: "neutral" },
];

export function conditionCopy(value: string): ConditionCopy {
  return CONDITIONS.find((c) => c.value === value) ?? CONDITIONS[CONDITIONS.length - 1];
}
