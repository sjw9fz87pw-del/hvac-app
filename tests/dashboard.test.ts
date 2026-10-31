/**
 * The dashboard's equipment summary: every unit counted once, at its worst.
 */
import { describe, expect, it } from "vitest";
import { fleetSummary } from "@/lib/api/dashboards";

describe("units by status", () => {
  it("counts a unit once, at its worst job", () => {
    const fleet = fleetSummary([
      ["OVERDUE", "UPCOMING"],
      ["DUE", "UPCOMING"],
      ["SCHEDULE_NEEDED"],
      ["UPCOMING", "UPCOMING"],
      [],
    ]);
    expect(fleet).toEqual({ units: 5, overdue: 1, dueSoon: 2, current: 1, notSetUp: 1 });
  });

  it("keeps units with no work set up apart from those on schedule", () => {
    expect(fleetSummary([[], []])).toEqual({ units: 2, overdue: 0, dueSoon: 0, current: 0, notSetUp: 2 });
    expect(fleetSummary([])).toEqual({ units: 0, overdue: 0, dueSoon: 0, current: 0, notSetUp: 0 });
  });
});
