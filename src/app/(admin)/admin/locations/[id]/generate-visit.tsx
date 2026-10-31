"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { BookVisitForm } from "@/components/visit/book-visit-form";
import { zonedToday } from "@/lib/time/zone";

/** Book a visit to this restaurant. The form itself is shared with the schedule. */
export function GenerateVisit({ locationId, dueCount, unitCount, allBooked, timezone, technicians, defaultTechnicianId }: {
  locationId: string;
  /** Units with due work that is not already on a booked visit. */
  dueCount: number;
  /** Units with any work that is not already on a booked visit. */
  unitCount: number;
  /** Every unit's work is on a booked visit, so there is nothing left to book. */
  allBooked: boolean;
  /** Times are the restaurant's, not the phone's. */
  timezone: string;
  /** Who can be sent. A visit nobody is assigned to shows on every technician's list. */
  technicians: { id: string; name: string }[];
  defaultTechnicianId: string | null;
}) {
  const router = useRouter();
  // Tomorrow where the restaurant is — not tomorrow in UTC, which is already
  // the day after by evening in New York.
  const [tomorrow] = useState(() => zonedToday(timezone, 1));

  return (
    <Card>
      <div style={{ fontWeight: 640 }}>Schedule a visit</div>
      <BookVisitForm
        locationId={locationId}
        timezone={timezone}
        technicians={technicians}
        defaultTechnicianId={defaultTechnicianId}
        initialDate={tomorrow}
        counts={() => ({ due: dueCount, all: unitCount })}
        allBooked={allBooked}
        submitLabel="Generate visit"
        busyLabel="Generating…"
        onBooked={() => router.refresh()}
      />
    </Card>
  );
}
