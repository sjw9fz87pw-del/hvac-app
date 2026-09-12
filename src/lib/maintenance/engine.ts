/**
 * The preventive-maintenance engine.
 *
 * Pure functions, no I/O. The same code decides the badge on a list row, the
 * customer's health score, and what the nightly generator schedules - so those
 * three can never disagree with each other.
 */

export type PlanScope = "SYSTEM" | "CUSTOMER" | "LOCATION" | "ASSET";
export type ScheduleStatus = "UPCOMING" | "SCHEDULE_NEEDED" | "DUE" | "OVERDUE" | "PAUSED";

/** Later entries win. This ordering is the override chain, stated once. */
const SCOPE_PRECEDENCE: Record<PlanScope, number> = {
  SYSTEM: 0, CUSTOMER: 1, LOCATION: 2, ASSET: 3,
};

export interface IntervalCandidate {
  scope: PlanScope;
  intervalDays: number;
  active?: boolean;
}

export interface ResolvedInterval {
  intervalDays: number;
  source: PlanScope;
}

/**
 * Resolve the effective interval for one asset/service-type pair.
 * An asset-level override beats a location one, which beats a customer one,
 * which beats the system template.
 */
export function resolveInterval(
  candidates: readonly IntervalCandidate[],
  fallbackDays: number,
): ResolvedInterval {
  let best: IntervalCandidate | null = null;
  for (const c of candidates) {
    if (c.active === false) continue;
    if (!Number.isFinite(c.intervalDays) || c.intervalDays <= 0) continue;
    if (!best || SCOPE_PRECEDENCE[c.scope] >= SCOPE_PRECEDENCE[best.scope]) best = c;
  }
  return best
    ? { intervalDays: best.intervalDays, source: best.scope }
    : { intervalDays: fallbackDays, source: "SYSTEM" };
}

const DAY_MS = 86_400_000;

/** Midnight-anchored so a service at 09:00 and one at 17:00 land on the same due date. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  // Calendar arithmetic rather than millisecond addition, so a DST boundary does
  // not shift a 30-day interval to 29 days and 23 hours.
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/**
 * Next due date after a completed service. Anchored to when the work actually
 * happened, not to the date it was previously due - a late service resets the
 * clock rather than immediately being late again.
 */
export function nextDueDate(lastServiceAt: Date, intervalDays: number): Date {
  return startOfDay(addDays(lastServiceAt, intervalDays));
}

/** For an asset never serviced: due now, so it surfaces on the first visit. */
export function initialDueDate(createdAt: Date, intervalDays: number, servicedAtSetup = false): Date {
  return servicedAtSetup ? nextDueDate(createdAt, intervalDays) : startOfDay(createdAt);
}

export interface StatusThresholds {
  /** Days before the due date at which it first appears as "coming up". */
  upcomingWindowDays: number;
  /** Days before the due date at which an unscheduled asset needs a visit booked. */
  scheduleNeededDays: number;
  /** Grace days after the due date before it is called overdue. */
  overdueGraceDays: number;
}

export const DEFAULT_THRESHOLDS: StatusThresholds = {
  upcomingWindowDays: 30,
  scheduleNeededDays: 14,
  overdueGraceDays: 0,
};

export interface StatusInput {
  nextDueAt: Date;
  now?: Date;
  paused?: boolean;
  /** True when a visit already covers this asset - suppresses SCHEDULE_NEEDED. */
  hasScheduledVisit?: boolean;
  thresholds?: Partial<StatusThresholds>;
}

export function scheduleStatus(input: StatusInput): ScheduleStatus {
  if (input.paused) return "PAUSED";
  const t = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const now = input.now ?? new Date();
  const daysUntilDue = daysBetween(now, input.nextDueAt);

  if (daysUntilDue < -t.overdueGraceDays) return "OVERDUE";
  if (daysUntilDue <= 0) return "DUE";
  if (daysUntilDue <= t.scheduleNeededDays && !input.hasScheduledVisit) return "SCHEDULE_NEEDED";
  return "UPCOMING";
}

/** Sort key for work queues: the most overdue first. */
export function urgencyRank(status: ScheduleStatus): number {
  return { OVERDUE: 0, DUE: 1, SCHEDULE_NEEDED: 2, UPCOMING: 3, PAUSED: 4 }[status];
}

// ---------------------------------------------------------------------------
// Maintenance Health
// ---------------------------------------------------------------------------

/**
 * Maintenance Health - explicitly NOT a claim about mechanical condition.
 *
 * It scores how well preventive care is being kept up, from service punctuality,
 * overdue work, open issues and recorded technician observations. No sensor or
 * diagnostic data exists yet, so nothing here should ever be presented as
 * "equipment health".
 */
export interface HealthInput {
  totalAssets: number;
  assetsCurrent: number;
  assetsDue: number;
  assetsOverdue: number;
  openIssues: number;
  criticalIssues: number;
  /** Fraction of services completed on or before their due date, 0..1. */
  onTimeRate?: number;
}

export interface HealthResult {
  score: number;          // 0..100
  band: "EXCELLENT" | "GOOD" | "FAIR" | "AT_RISK";
  /** The inputs, surfaced to the user so the number is never a black box. */
  factors: { label: string; impact: number }[];
}

export function maintenanceHealth(input: HealthInput): HealthResult {
  const { totalAssets } = input;
  if (totalAssets <= 0) {
    return { score: 100, band: "EXCELLENT", factors: [{ label: "No equipment under management yet", impact: 0 }] };
  }

  const factors: { label: string; impact: number }[] = [];
  let score = 100;

  const overdueRatio = clamp01(input.assetsOverdue / totalAssets);
  const overduePenalty = Math.round(overdueRatio * 45);
  if (overduePenalty > 0) factors.push({ label: `${input.assetsOverdue} overdue`, impact: -overduePenalty });
  score -= overduePenalty;

  const duePenalty = Math.round(clamp01(input.assetsDue / totalAssets) * 12);
  if (duePenalty > 0) factors.push({ label: `${input.assetsDue} due now`, impact: -duePenalty });
  score -= duePenalty;

  const issuePenalty = Math.round(clamp01(input.openIssues / totalAssets) * 20) + input.criticalIssues * 5;
  if (issuePenalty > 0) {
    factors.push({ label: `${input.openIssues} open issue${input.openIssues === 1 ? "" : "s"}`, impact: -issuePenalty });
  }
  score -= issuePenalty;

  if (input.onTimeRate !== undefined) {
    const punctualityPenalty = Math.round((1 - clamp01(input.onTimeRate)) * 20);
    if (punctualityPenalty > 0) {
      factors.push({ label: `${Math.round(input.onTimeRate * 100)}% services on time`, impact: -punctualityPenalty });
    }
    score -= punctualityPenalty;
  }

  score = Math.max(0, Math.min(100, score));
  if (factors.length === 0) factors.push({ label: "All equipment current", impact: 0 });

  return { score, band: healthBand(score), factors };
}

function healthBand(score: number): HealthResult["band"] {
  if (score >= 90) return "EXCELLENT";
  if (score >= 75) return "GOOD";
  if (score >= 55) return "FAIR";
  return "AT_RISK";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
