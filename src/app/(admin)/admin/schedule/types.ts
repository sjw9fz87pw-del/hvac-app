/** What the schedule page hands its calendar: plain data, ready to draw. */

/** MISSED here also covers a visit still open after its day has passed. */
export type VisitState = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "MISSED";

export interface CalendarVisit {
  id: string;
  /** The restaurant's own day and wall-clock time ("2026-11-03", "09:00"). */
  date: string;
  time: string;
  /** Roughly how long the work takes, from its jobs. */
  minutes: number;
  status: VisitState;
  locationId: string;
  locationName: string;
  organizationName: string;
  timezone: string;
  technician: { id: string; name: string } | null;
  units: number;
  done: number;
}

export interface BookableLocation {
  id: string;
  name: string;
  organizationName: string;
  timezone: string;
  /**
   * One entry per unit with work that is not on a booked visit: the day its
   * earliest such job is due. Sorted, so the earliest come first.
   */
  due: string[];
  /** Some of its work is already on a booked visit. */
  hasBooked: boolean;
}

/** A unit whose service was started on a visit and never finished. */
export interface UnfinishedTask {
  id: string;
  visitId: string;
  unitName: string;
  locationName: string;
  technicianName: string | null;
}
