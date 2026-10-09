import { DEFAULT_TIMEZONE, zonedParts, zonedToday } from "./zone";

/*
 * Dates are shown on the business's clock, not the server's. Pages render on a
 * server in UTC, which put anything after 8pm in New York on the next day.
 * Where the restaurant is known, its own zone is passed in.
 */

/** The day something happened: a service, a report, a tag written. */
export function formatDate(value: string | Date | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
}

/**
 * A calendar day rather than a moment: a due date, a warranty end. These are
 * stored as midnight UTC, so they are read in UTC — in New York's zone that
 * midnight is the evening before, and every due date would show a day early.
 */
export function formatDay(value: string | Date | null | undefined, options: { year?: boolean } = {}): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", ...(options.year === false ? {} : { year: "numeric" }), timeZone: "UTC",
  });
}

/**
 * Date plus time of day, for anything with an appointment attached.
 *
 * A visit at 07:00 and one at 17:00 are very different plans, so a screen that
 * shows only the date is asking someone to guess — or to ring and ask.
 *
 * Pass the restaurant's zone: a visit happens at the restaurant's wall clock,
 * whoever is looking and from wherever.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone = DEFAULT_TIMEZONE,
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return [
    date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone }),
    date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }),
  ].join(" · ");
}

/**
 * "Today", "Tomorrow", "in 3 days" — counted in calendar days where the
 * restaurant is. A visit is a moment, read on the restaurant's clock; a due
 * date (`day: true`) is already a calendar day.
 */
export function relativeDays(
  value: string | Date | null | undefined,
  options: { timeZone?: string; day?: boolean } = {},
): string {
  if (!value) return "—";
  const timeZone = options.timeZone ?? DEFAULT_TIMEZONE;
  const date = typeof value === "string" ? new Date(value) : value;
  const target = options.day ? date.toISOString().slice(0, 10) : zonedParts(date, timeZone).date;
  const days = Math.round(
    (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${zonedToday(timeZone)}T00:00:00Z`)) / 86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}
