/**
 * The schedule's calendar: which days a week or month shows, stepping between
 * them, and drawing visits that overlap side by side.
 */
import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, calendarDays, clockLabel, durationLabel, isDateKey, layoutOverlaps, rangeTitle, stepDate,
} from "@/lib/time/calendar";

describe("calendar days", () => {
  it("only accepts real dates", () => {
    expect(isDateKey("2026-11-03")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("today")).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });

  it("counts days across a clock change without losing or gaining one", () => {
    // New York leaves daylight saving on Nov 1, 2026.
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
  });

  it("shows a week from Monday to Sunday", () => {
    const days = calendarDays("week", "2026-11-04"); // a Wednesday
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-11-02");
    expect(days[6]).toBe("2026-11-08");
    // A Sunday belongs to the week before it.
    expect(calendarDays("week", "2026-11-08")[0]).toBe("2026-11-02");
  });

  it("shows a month as six whole weeks around it", () => {
    const days = calendarDays("month", "2026-11-17");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-10-26");
    expect(days).toContain("2026-11-01");
    expect(days).toContain("2026-11-30");
    expect(days[7].slice(0, 7)).toBe("2026-11");
  });

  it("steps by a week or a month, keeping the day", () => {
    expect(stepDate("week", "2026-11-04", 1)).toBe("2026-11-11");
    expect(stepDate("week", "2026-11-04", -1)).toBe("2026-10-28");
    expect(stepDate("month", "2026-11-17", 1)).toBe("2026-12-17");
    // There is no February 31st: the month's last day instead.
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("titles a range the way a calendar does", () => {
    expect(rangeTitle("month", "2026-11-17")).toBe("November 2026");
    expect(rangeTitle("week", "2026-11-04")).toBe("November 2026");
    expect(rangeTitle("week", "2026-10-28")).toBe("Oct – Nov 2026");
    expect(rangeTitle("week", "2026-12-30")).toBe("Dec 2026 – Jan 2027");
  });

  it("writes times and lengths plainly", () => {
    expect(clockLabel(9 * 60)).toBe("9:00 AM");
    expect(clockLabel(14 * 60 + 30)).toBe("2:30 PM");
    expect(clockLabel(0, true)).toBe("12 AM");
    expect(clockLabel(12 * 60, true)).toBe("12 PM");
    expect(durationLabel(150)).toBe("2h 30m");
    expect(durationLabel(45)).toBe("45m");
    expect(durationLabel(120)).toBe("2h");
  });
});

describe("overlapping visits", () => {
  it("gives a visit on its own the full width", () => {
    const placed = layoutOverlaps([{ id: "a", start: 540, end: 600 }]);
    expect(placed.get("a")).toEqual({ column: 0, columns: 1 });
  });

  it("puts visits at the same time side by side", () => {
    const placed = layoutOverlaps([
      { id: "a", start: 540, end: 660 },
      { id: "b", start: 570, end: 630 },
    ]);
    expect(placed.get("a")).toEqual({ column: 0, columns: 2 });
    expect(placed.get("b")).toEqual({ column: 1, columns: 2 });
  });

  it("reuses a column once it is free, and keeps separate mornings separate", () => {
    const placed = layoutOverlaps([
      { id: "a", start: 540, end: 660 },  // 9–11
      { id: "b", start: 560, end: 600 },  // 9:20–10
      { id: "c", start: 610, end: 650 },  // 10:10–10:50, after b
      { id: "d", start: 840, end: 900 },  // 2pm, on its own
    ]);
    expect(placed.get("c")!.column).toBe(1);
    expect(placed.get("a")!.columns).toBe(2);
    expect(placed.get("d")).toEqual({ column: 0, columns: 1 });
  });

  it("does not count back-to-back visits as overlapping", () => {
    const placed = layoutOverlaps([
      { id: "a", start: 540, end: 600 },
      { id: "b", start: 600, end: 660 },
    ]);
    expect(placed.get("a")!.columns).toBe(1);
    expect(placed.get("b")!.columns).toBe(1);
  });
});
