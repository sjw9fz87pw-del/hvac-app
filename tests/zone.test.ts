/**
 * Booking in the restaurant's own time, whatever the server or phone is set to.
 * The server runs in UTC; New York is four hours behind in summer, five in winter.
 */
import { describe, expect, it } from "vitest";
import { zonedInstant, zonedParts } from "@/lib/time/zone";

describe("restaurant time", () => {
  it("books 9am New York as 9am New York, in summer and in winter", () => {
    expect(zonedInstant("2026-10-15", "09:00", "America/New_York")!.toISOString()).toBe("2026-10-15T13:00:00.000Z");
    expect(zonedInstant("2027-01-15", "09:00", "America/New_York")!.toISOString()).toBe("2027-01-15T14:00:00.000Z");
  });

  it("reads an instant back as the restaurant's date and time", () => {
    // 01:30 UTC on the 16th is still the evening of the 15th in New York.
    expect(zonedParts("2026-10-16T01:30:00Z", "America/New_York")).toEqual({ date: "2026-10-15", time: "21:30" });
  });

  it("round-trips through any zone", () => {
    for (const zone of ["America/New_York", "America/Los_Angeles", "Europe/London", "UTC"]) {
      const at = zonedInstant("2026-11-03", "14:00", zone)!;
      expect(zonedParts(at, zone)).toEqual({ date: "2026-11-03", time: "14:00" });
    }
  });

  it("refuses nonsense", () => {
    expect(zonedInstant("not-a-date", "09:00", "UTC")).toBeNull();
  });
});

import { dayBounds } from "@/lib/time/zone";

describe("today, where the business is", () => {
  it("runs midnight to midnight in New York, not in UTC", () => {
    const { start, end } = dayBounds("America/New_York");
    // A New York day starts at 04:00 or 05:00 UTC, never at 00:00.
    expect([4, 5]).toContain(start.getUTCHours());
    expect([23, 24, 25]).toContain((end.getTime() - start.getTime()) / 3_600_000);
  });
});

import { formatDate, formatDay, formatDateTime, relativeDays } from "@/lib/time/format";
import { zonedToday } from "@/lib/time/zone";

describe("dates on screen", () => {
  const NY = "America/New_York";

  it("puts an evening in New York on its own day, not the next", () => {
    // 9:30pm on Oct 8 in New York is already Oct 9 in UTC.
    expect(formatDate("2026-10-09T01:30:00Z", NY)).toBe("Oct 8, 2026");
    expect(formatDateTime("2026-10-09T01:30:00Z", NY)).toBe("Oct 8 · 9:30 PM");
  });

  it("reads a due date as the day it is, not the evening before", () => {
    expect(formatDay("2026-10-09T00:00:00.000Z")).toBe("Oct 9, 2026");
    expect(formatDay("2026-10-09T00:00:00.000Z", { year: false })).toBe("Oct 9");
  });

  it("calls tomorrow morning's visit tomorrow, whatever the hour", () => {
    expect(relativeDays(zonedInstant(zonedToday(NY, 1), "09:00", NY), { timeZone: NY })).toBe("Tomorrow");
    expect(relativeDays(zonedInstant(zonedToday(NY), "23:30", NY), { timeZone: NY })).toBe("Today");
  });

  it("counts due dates as calendar days", () => {
    expect(relativeDays(`${zonedToday(NY)}T00:00:00.000Z`, { day: true, timeZone: NY })).toBe("Today");
    expect(relativeDays(`${zonedToday(NY, -3)}T00:00:00.000Z`, { day: true, timeZone: NY })).toBe("3 days ago");
  });
});
