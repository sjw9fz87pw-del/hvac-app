import { describe, expect, it } from "vitest";
import {
  resolveInterval, nextDueDate, initialDueDate, scheduleStatus, urgencyRank,
  maintenanceHealth, daysBetween, addDays, startOfDay,
} from "@/lib/maintenance/engine";
import { missingProof, serviceContentHash } from "@/lib/maintenance/completion";

describe("interval override chain", () => {
  it("prefers the most specific scope", () => {
    expect(resolveInterval([
      { scope: "SYSTEM", intervalDays: 30 },
      { scope: "CUSTOMER", intervalDays: 60 },
      { scope: "LOCATION", intervalDays: 45 },
      { scope: "ASSET", intervalDays: 14 },
    ], 90)).toEqual({ intervalDays: 14, source: "ASSET" });
  });

  it("falls back through the chain when specific scopes are absent", () => {
    expect(resolveInterval([
      { scope: "SYSTEM", intervalDays: 30 },
      { scope: "CUSTOMER", intervalDays: 60 },
    ], 90)).toEqual({ intervalDays: 60, source: "CUSTOMER" });
  });

  it("uses the service type default when nothing applies", () => {
    expect(resolveInterval([], 90)).toEqual({ intervalDays: 90, source: "SYSTEM" });
  });

  it("ignores inactive and nonsensical plans", () => {
    expect(resolveInterval([
      { scope: "SYSTEM", intervalDays: 30 },
      { scope: "ASSET", intervalDays: 14, active: false },
      { scope: "LOCATION", intervalDays: 0 },
      { scope: "LOCATION", intervalDays: Number.NaN },
    ], 90)).toEqual({ intervalDays: 30, source: "SYSTEM" });
  });
});

describe("due dates", () => {
  it("anchors the next due date to when the work actually happened", () => {
    const performed = new Date("2026-08-22T14:30:00");
    expect(nextDueDate(performed, 30)).toEqual(startOfDay(new Date("2026-09-21T00:00:00")));
  });

  it("puts two services on the same day on the same due date regardless of time", () => {
    const morning = nextDueDate(new Date("2026-08-22T09:00:00"), 30);
    const evening = nextDueDate(new Date("2026-08-22T17:45:00"), 30);
    expect(morning.getTime()).toBe(evening.getTime());
  });

  it("uses calendar arithmetic, so a DST boundary does not shrink the interval", () => {
    // US DST ends 2026-11-01; a 30-day interval from 2026-10-20 must land on 2026-11-19.
    const due = nextDueDate(new Date("2026-10-20T12:00:00"), 30);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(10);
    expect(due.getDate()).toBe(19);
  });

  it("crosses month and year boundaries correctly", () => {
    expect(addDays(new Date("2026-12-20T00:00:00"), 30).getFullYear()).toBe(2027);
    expect(addDays(new Date("2028-02-28T00:00:00"), 1).getDate()).toBe(29); // leap year
  });

  it("makes a newly inventoried asset due immediately", () => {
    const created = new Date("2026-09-01T10:00:00");
    expect(initialDueDate(created, 30)).toEqual(startOfDay(created));
    expect(initialDueDate(created, 30, true)).toEqual(startOfDay(new Date("2026-10-01T00:00:00")));
  });

  it("counts whole days between dates", () => {
    expect(daysBetween(new Date("2026-09-01T23:00:00"), new Date("2026-09-02T01:00:00"))).toBe(1);
  });
});

describe("schedule status", () => {
  const now = new Date("2026-09-12T12:00:00");

  it("is overdue past the due date", () => {
    expect(scheduleStatus({ nextDueAt: new Date("2026-09-11T00:00:00"), now })).toBe("OVERDUE");
  });

  it("is due on the due date itself", () => {
    expect(scheduleStatus({ nextDueAt: new Date("2026-09-12T00:00:00"), now })).toBe("DUE");
  });

  it("needs scheduling inside the booking window when no visit covers it", () => {
    expect(scheduleStatus({ nextDueAt: new Date("2026-09-20T00:00:00"), now })).toBe("SCHEDULE_NEEDED");
  });

  it("stays upcoming when a visit already covers it", () => {
    expect(scheduleStatus({ nextDueAt: new Date("2026-09-20T00:00:00"), now, hasScheduledVisit: true })).toBe("UPCOMING");
  });

  it("is upcoming well before the due date", () => {
    expect(scheduleStatus({ nextDueAt: new Date("2026-10-30T00:00:00"), now })).toBe("UPCOMING");
  });

  it("honours a grace period", () => {
    expect(scheduleStatus({ nextDueAt: new Date("2026-09-10T00:00:00"), now, thresholds: { overdueGraceDays: 5 } })).toBe("DUE");
  });

  it("reports paused schedules as paused whatever the date", () => {
    expect(scheduleStatus({ nextDueAt: new Date("2020-01-01T00:00:00"), now, paused: true })).toBe("PAUSED");
  });

  it("ranks the most urgent work first", () => {
    const sorted = (["UPCOMING", "OVERDUE", "PAUSED", "DUE", "SCHEDULE_NEEDED"] as const)
      .slice().sort((a, b) => urgencyRank(a) - urgencyRank(b));
    expect(sorted).toEqual(["OVERDUE", "DUE", "SCHEDULE_NEEDED", "UPCOMING", "PAUSED"]);
  });
});

describe("maintenance health", () => {
  it("is perfect with no equipment and says so", () => {
    const result = maintenanceHealth({ totalAssets: 0, assetsCurrent: 0, assetsDue: 0, assetsOverdue: 0, openIssues: 0, criticalIssues: 0 });
    expect(result.score).toBe(100);
    expect(result.band).toBe("EXCELLENT");
  });

  it("is perfect when everything is current", () => {
    const result = maintenanceHealth({ totalAssets: 47, assetsCurrent: 47, assetsDue: 0, assetsOverdue: 0, openIssues: 0, criticalIssues: 0, onTimeRate: 1 });
    expect(result.score).toBe(100);
    expect(result.band).toBe("EXCELLENT");
  });

  it("drops sharply with overdue work", () => {
    const result = maintenanceHealth({ totalAssets: 10, assetsCurrent: 3, assetsDue: 0, assetsOverdue: 7, openIssues: 0, criticalIssues: 0 });
    expect(result.score).toBeLessThan(75);
    expect(result.factors.some((f) => f.label.includes("overdue"))).toBe(true);
  });

  it("never leaves the 0-100 range under extreme input", () => {
    const worst = maintenanceHealth({ totalAssets: 5, assetsCurrent: 0, assetsDue: 5, assetsOverdue: 5, openIssues: 20, criticalIssues: 10, onTimeRate: 0 });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);
    expect(worst.band).toBe("AT_RISK");
  });

  it("explains itself, so the number is never a black box", () => {
    const result = maintenanceHealth({ totalAssets: 10, assetsCurrent: 8, assetsDue: 1, assetsOverdue: 1, openIssues: 2, criticalIssues: 0 });
    expect(result.factors.length).toBeGreaterThan(0);
    for (const factor of result.factors) expect(factor.label).toBeTruthy();
  });
});

describe("service proof requirements", () => {
  const requirements = {
    requiresNfcVerification: true, requiresBeforePhoto: true, requiresAfterPhoto: true,
    requiresChecklist: true, requiresTechnicianNote: false,
  };
  const complete = {
    checklist: [{ label: "Clean condenser", completed: true }],
    photos: [
      { kind: "BEFORE" as const, blobKey: "a", capturedAt: "2026-09-12T10:00:00Z" },
      { kind: "AFTER" as const, blobKey: "b", capturedAt: "2026-09-12T10:20:00Z" },
    ],
    technicianNotes: null,
    verificationMethod: "NFC" as const,
  };

  it("accepts a complete submission", () => {
    expect(missingProof(requirements, complete, ["Clean condenser"])).toEqual([]);
  });

  it("names every missing piece rather than failing vaguely", () => {
    const missing = missingProof(requirements, {
      checklist: [{ label: "Clean condenser", completed: false }],
      photos: [], technicianNotes: null, verificationMethod: null,
    }, ["Clean condenser"]);
    expect(missing).toEqual(expect.arrayContaining([
      "tag verification", "before photo", "after photo", "checklist: Clean condenser",
    ]));
  });

  it("accepts the QR fallback as verification", () => {
    expect(missingProof(requirements, { ...complete, verificationMethod: "QR" }, ["Clean condenser"])).toEqual([]);
  });

  it("rejects manual entry when tag verification is required", () => {
    expect(missingProof(requirements, { ...complete, verificationMethod: "MANUAL" }, [])).toContain("tag verification");
  });

  it("requires a note only when the service type asks for one", () => {
    expect(missingProof({ ...requirements, requiresTechnicianNote: true }, complete, [])).toContain("technician note");
    expect(missingProof(requirements, complete, [])).not.toContain("technician note");
  });

  it("ignores optional checklist items", () => {
    const withOptional = { ...complete, checklist: [{ label: "Clean condenser", completed: true }, { label: "Check seals", completed: false }] };
    expect(missingProof(requirements, withOptional, ["Clean condenser"])).toEqual([]);
  });
});

describe("service content hash", () => {
  const base = {
    equipmentId: "eq_1", serviceTypeId: "st_1", technicianId: "u_1",
    performedAt: new Date("2026-09-12T10:00:00Z"),
    checklist: [{ label: "Clean condenser", completed: true }],
    photoKeys: ["a", "b"],
  };

  it("is stable for identical content, regardless of photo order", () => {
    expect(serviceContentHash(base)).toBe(serviceContentHash({ ...base, photoKeys: ["b", "a"] }));
  });

  it("changes when the proof changes", () => {
    const altered = serviceContentHash({ ...base, checklist: [{ label: "Clean condenser", completed: false }] });
    expect(altered).not.toBe(serviceContentHash(base));
  });
});
