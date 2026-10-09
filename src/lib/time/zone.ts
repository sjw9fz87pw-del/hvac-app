/**
 * Wall-clock time in a restaurant's own time zone.
 *
 * Visits are booked in the restaurant's time: 9am means 9am there, whatever
 * the phone doing the booking — or the server rendering the page — is set to.
 * The server runs in UTC, four or five hours off New York, which is enough to
 * put an evening visit on the wrong day.
 */

/** Where a company or restaurant is unless it says otherwise. */
export const DEFAULT_TIMEZONE = "America/New_York";

/** Date and time as the restaurant reads them, for a date/time input. */
export function zonedParts(iso: string | Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/**
 * The restaurant's wall-clock time as an instant. Visits are booked in the
 * restaurant's time — 9am means 9am there, whatever the phone doing the
 * booking is set to.
 */
export function zonedInstant(date: string, time: string, timeZone: string): Date | null {
  const guess = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  // Find the zone's offset at that moment, and correct for it.
  const asZone = zonedParts(guess.toISOString(), timeZone);
  const shown = new Date(`${asZone.date}T${asZone.time}:00Z`);
  return new Date(guess.getTime() - (shown.getTime() - guess.getTime()));
}

/** Today's date (YYYY-MM-DD) where the restaurant is. */
export function zonedToday(timeZone: string, offsetDays = 0): string {
  return zonedParts(new Date(Date.now() + offsetDays * 86_400_000), timeZone).date;
}

/**
 * The start and end of a day where the business is, as instants — for "today"
 * queries. Computed on a server in UTC with setHours(0), "today" in New York
 * would end at 8pm, and a morning visit would be called missed that evening.
 */
export function dayBounds(timeZone: string, offsetDays = 0): { start: Date; end: Date } {
  const date = zonedToday(timeZone, offsetDays);
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    start: zonedInstant(date, "00:00", timeZone)!,
    end: zonedInstant(next.toISOString().slice(0, 10), "00:00", timeZone)!,
  };
}
