/**
 * Calendar arithmetic on plain dates ("2026-11-03"), for the schedule.
 *
 * A calendar day is not a moment, so these never touch a clock: each date is
 * read at noon UTC, where no time-zone offset or clock change can push it
 * into the day before or after.
 */

const DAY_MS = 86_400_000;

/** How far past the booked day a "due" visit reaches; the booking form sends the same. */
export const BOOKING_HORIZON_DAYS = 14;

export type CalendarView = "week" | "month";

function noon(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** A real date written YYYY-MM-DD; anything else (2026-02-30, "today") is not. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = noon(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(key: string, days: number): string {
  return new Date(noon(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** The same day of the month, n months on; the 31st becomes the month's last day. */
export function addMonths(key: string, months: number): string {
  const date = noon(key);
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** 0 for Monday through 6 for Sunday: the working week reads left to right. */
export function weekdayIndex(key: string): number {
  return (noon(key).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

/**
 * The days a view shows around a date: its Monday-to-Sunday week, or the six
 * whole weeks that hold its month (every month fits in six).
 */
export function calendarDays(view: CalendarView, key: string): string[] {
  const from = view === "week" ? startOfWeek(key) : startOfWeek(`${key.slice(0, 8)}01`);
  return Array.from({ length: view === "week" ? 7 : 42 }, (_, i) => addDays(from, i));
}

/** Where ‹ and › go: a week or a month along, on the same weekday or day of the month. */
export function stepDate(view: CalendarView, key: string, direction: 1 | -1): string {
  return view === "week" ? addDays(key, 7 * direction) : addMonths(key, direction);
}

const label = (key: string, options: Intl.DateTimeFormatOptions) =>
  noon(key).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });

/** "November 2026", or "Oct – Nov 2026" for a week across two months. */
export function rangeTitle(view: CalendarView, key: string): string {
  if (view === "month") return label(key, { month: "long", year: "numeric" });
  const days = calendarDays("week", key);
  const first = days[0];
  const last = days[6];
  if (first.slice(0, 7) === last.slice(0, 7)) return label(first, { month: "long", year: "numeric" });
  if (first.slice(0, 4) === last.slice(0, 4)) {
    return `${label(first, { month: "short" })} – ${label(last, { month: "short", year: "numeric" })}`;
  }
  return `${label(first, { month: "short", year: "numeric" })} – ${label(last, { month: "short", year: "numeric" })}`;
}

/** "Tuesday, November 3". */
export function dayTitle(key: string): string {
  return label(key, { weekday: "long", month: "long", day: "numeric" });
}

/** "Tue, Nov 3". */
export function shortDay(key: string): string {
  return label(key, { weekday: "short", month: "short", day: "numeric" });
}

/** "Mon" … "Sun". */
export function weekdayShort(key: string): string {
  return label(key, { weekday: "short" });
}

/** "09:30" → minutes after midnight. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes after midnight → "9:30 AM", or "9 AM" on the hour when `short`. */
export function clockLabel(minutes: number, short = false): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return short && m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "2h 30m", "45m". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Side-by-side columns for appointments that overlap in time, the way a
 * calendar draws two visits booked for the same morning. Each item gets its
 * column and how many columns its group of overlapping items needs.
 */
export function layoutOverlaps<T extends { id: string; start: number; end: number }>(
  items: T[],
): Map<string, { column: number; columns: number }> {
  const placed = new Map<string, { column: number; columns: number }>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let group: string[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -Infinity;

  const close = () => {
    for (const id of group) placed.get(id)!.columns = columnEnds.length;
    group = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= groupEnd) close();
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column < 0) column = columnEnds.push(item.end) - 1;
    else columnEnds[column] = item.end;
    placed.set(item.id, { column, columns: 1 });
    group.push(item.id);
    groupEnd = Math.max(groupEnd, item.end);
  }
  close();
  return placed;
}
