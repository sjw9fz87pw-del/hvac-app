"use client";

import { useEffect, useState } from "react";
import { zonedParts } from "@/lib/time/zone";
import { clockLabel, durationLabel, layoutOverlaps, minutesOf, weekdayShort } from "@/lib/time/calendar";
import type { CalendarVisit } from "./types";

/** What a day carries, for the dots under its date. */
export interface DayMarks {
  visits: CalendarVisit[];
  /** Units with work due that day and not yet booked. */
  due: number;
}

const firstName = (name: string) => name.split(/\s+/)[0];

function Dots({ marks }: { marks?: DayMarks }) {
  if (!marks) return <span className="sched-dots" />;
  const dots = marks.visits.slice(0, 3).map((v) =>
    v.status === "MISSED" ? "missed" : v.status === "COMPLETED" ? "done" : "visit");
  return (
    <span className="sched-dots" aria-hidden="true">
      {dots.map((kind, i) => <span key={i} className={`sched-dot ${kind}`} />)}
      {marks.due > 0 ? <span className="sched-dot due" /> : null}
    </span>
  );
}

function describe(day: string, marks?: DayMarks): string {
  const parts = [new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })];
  const count = marks?.visits.length ?? 0;
  if (count) parts.push(`${count} visit${count === 1 ? "" : "s"}`);
  if (marks?.due) parts.push(`${marks.due} unit${marks.due === 1 ? "" : "s"} due`);
  return parts.join(", ");
}

function dayClass(base: string, day: string, today: string, selected: string) {
  return [base, day === today && "is-today", day === selected && "is-selected", day < today && "is-past"].filter(Boolean).join(" ");
}

/** Seven days across, each with its date and a dot for each visit and for due work. */
export function WeekStrip({ days, today, selected, marks, onSelect }: {
  days: string[]; today: string; selected: string; marks: Map<string, DayMarks>; onSelect: (day: string) => void;
}) {
  return (
    <div className="sched-week" role="group" aria-label="Days of the week">
      {days.map((day) => (
        <button key={day} type="button" className={dayClass("sched-day", day, today, selected)}
          aria-pressed={day === selected} aria-label={describe(day, marks.get(day))} onClick={() => onSelect(day)}>
          <span className="sched-day-name">{weekdayShort(day)}</span>
          <span className="sched-day-num">{Number(day.slice(8))}</span>
          <Dots marks={marks.get(day)} />
        </button>
      ))}
    </div>
  );
}

/** Six weeks, with the month's own days in full and its neighbours' faded. */
export function MonthGrid({ days, month, today, selected, marks, onSelect }: {
  days: string[]; month: string; today: string; selected: string; marks: Map<string, DayMarks>; onSelect: (day: string) => void;
}) {
  return (
    <div className="sched-month" role="group" aria-label="Days of the month">
      {days.slice(0, 7).map((day) => <div key={day} className="sched-month-head" aria-hidden="true">{weekdayShort(day).slice(0, 3)}</div>)}
      {days.map((day) => {
        const dayMarks = marks.get(day);
        const visits = dayMarks?.visits ?? [];
        return (
          <button key={day} type="button"
            className={`${dayClass("sched-mday", day, today, selected)}${day.slice(0, 7) === month ? "" : " is-outside"}`}
            aria-pressed={day === selected} aria-label={describe(day, dayMarks)} onClick={() => onSelect(day)}>
            <span className="sched-day-num">{Number(day.slice(8))}</span>
            <Dots marks={dayMarks} />
            {/* On a wide screen there is room to name the visits, as a wall calendar would. */}
            <span className="sched-chips" aria-hidden="true">
              {visits.slice(0, 3).map((v) => (
                <span key={v.id} className={`sched-chip is-${v.status}`}>
                  {clockLabel(minutesOf(v.time), true).replace(" ", "").toLowerCase()} {v.locationName}
                </span>
              ))}
              {visits.length > 3 ? <span className="sched-chip-more">+{visits.length - 3} more</span> : null}
              {dayMarks?.due ? <span className="sched-chip-due">{dayMarks.due} due</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const HOUR = 52;
const GUTTER = 52;
/** Room above the first hour and below the last, so their labels are not cut in half. */
const PAD = 10;
/** A short visit still needs room for its name. */
const MIN_MINUTES = 45;
/** A visit covering every unit can run past a working day; draw at most this much of it. */
const MAX_MINUTES = 8 * 60;

/**
 * The day (or the week) as hours down the side, with each visit drawn as a
 * block at its time and as long as its work takes. A free hour is a button
 * that books a visit then.
 */
export function Timeline({ days, today, selected, visitsByDay, dueByDay, timezone, canBook, onSelectDay, onOpenVisit, onBookAt }: {
  days: string[];
  /** Units due each day, shown under the day's name when the whole week is drawn. */
  dueByDay?: Map<string, number>;
  today: string;
  selected: string;
  visitsByDay: Map<string, CalendarVisit[]>;
  timezone: string;
  canBook: boolean;
  onSelectDay?: (day: string) => void;
  onOpenVisit: (visit: CalendarVisit) => void;
  onBookAt: (day: string, time: string) => void;
}) {
  // The current time is only known in the browser; drawing it on the server
  // would disagree with the page once it arrives.
  const [now, setNow] = useState<{ date: string; minutes: number } | null>(null);
  useEffect(() => {
    const tick = () => {
      const parts = zonedParts(new Date(), timezone);
      setNow({ date: parts.date, minutes: minutesOf(parts.time) });
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [timezone]);

  const blocks = days.map((day) => (visitsByDay.get(day) ?? []).map((visit) => {
    const start = minutesOf(visit.time);
    return { id: visit.id, visit, start, end: start + Math.min(Math.max(visit.minutes, MIN_MINUTES), MAX_MINUTES) };
  }));
  const all = blocks.flat();
  const firstHour = Math.min(7, ...all.map((b) => Math.floor(b.start / 60)));
  const lastHour = Math.min(24, Math.max(18, ...all.map((b) => Math.ceil(b.end / 60))));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const height = hours.length * HOUR + PAD * 2;
  const top = (minutes: number) => PAD + ((minutes - firstHour * 60) / 60) * HOUR;
  const wide = days.length > 1;

  return (
    <div className="tl" style={{ ["--tl-days" as string]: days.length }}>
      {wide ? (
        <div className="tl-cols tl-heads">
          <span />
          {days.map((day) => (
            <button key={day} type="button" className={dayClass("tl-head", day, today, selected)} onClick={() => onSelectDay?.(day)}>
              <span className="tl-head-name">{weekdayShort(day)}</span>
              <span className="tl-head-num">{Number(day.slice(8))}</span>
              <span className="tl-head-due">{dueByDay?.get(day) ? `${dueByDay.get(day)} due` : ""}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="tl-cols tl-body" style={{ height }}>
        <div className="tl-gutter" aria-hidden="true">
          {[...hours, lastHour].map((hour, i) => (
            <span key={hour} className="tl-hour-label" style={{ top: PAD + i * HOUR }}>{clockLabel(hour * 60, true)}</span>
          ))}
        </div>
        {[...hours, lastHour].map((hour, i) => (
          <span key={hour} className="tl-hour-line" style={{ top: PAD + i * HOUR, left: GUTTER }} aria-hidden="true" />
        ))}

        {days.map((day, column) => {
          const placed = layoutOverlaps(blocks[column]);
          const bookable = canBook && day >= today;
          return (
            <div key={day} className={`tl-day${wide && day === selected ? " is-selected" : ""}`}>
              {bookable ? hours.map((hour, i) => (
                <button key={hour} type="button" className="tl-slot" style={{ top: PAD + i * HOUR, height: HOUR }}
                  aria-label={`Book a visit at ${clockLabel(hour * 60, true)} on ${weekdayShort(day)} ${Number(day.slice(8))}`}
                  onClick={() => onBookAt(day, `${String(hour).padStart(2, "0")}:00`)} />
              )) : null}

              {blocks[column].map(({ id, visit, start, end }) => {
                const spot = placed.get(id)!;
                const y = top(start);
                const h = Math.max(top(Math.min(end, lastHour * 60)) - y, 30);
                const width = 100 / spot.columns;
                return (
                  <button key={id} type="button" className={`tl-visit is-${visit.status}`}
                    style={{ top: y + 1, height: h - 2, left: `calc(${spot.column * width}% + 2px)`, width: `calc(${width}% - 4px)` }}
                    onClick={() => onOpenVisit(visit)}
                    aria-label={`${visit.locationName}, ${clockLabel(start)}, ${visit.technician?.name ?? "not assigned"}`}>
                    <span className="tl-visit-time">
                      {clockLabel(start)}
                      {wide ? "" : ` · ${visit.technician?.name ?? "Not assigned"}`}
                    </span>
                    <span className="tl-visit-name">{visit.locationName}</span>
                    {h >= 60 ? (
                      <span className="tl-visit-meta">
                        {wide
                          ? (visit.technician ? firstName(visit.technician.name) : "Not assigned")
                          : `${visit.done} of ${visit.units} unit${visit.units === 1 ? "" : "s"} done · ${durationLabel(visit.minutes || MIN_MINUTES)}`}
                      </span>
                    ) : null}
                  </button>
                );
              })}

              {now && now.date === day && now.minutes >= firstHour * 60 && now.minutes <= lastHour * 60 ? (
                <span className="tl-now" style={{ top: top(now.minutes) }} aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
