"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TapLink } from "@/components/ui/tap-link";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useSwipe } from "@/components/ui/use-swipe";
import {
  addDays, clockLabel, dayTitle, minutesOf, rangeTitle, shortDay, startOfWeek, stepDate, type CalendarView,
} from "@/lib/time/calendar";
import { MonthGrid, Timeline, WeekStrip, type DayMarks } from "./calendar-parts";
import { BookPanel, MissedList, OverdueList, UnfinishedList, VisitDetails, timeRange, type OverdueRow } from "./sheets";
import type { BookableLocation, CalendarVisit, UnfinishedTask } from "./types";

export type ListSheet = "missed" | "overdue" | "unfinished";

type SheetState =
  | { kind: "visit"; visit: CalendarVisit }
  | { kind: "book"; locationId: string | null; date: string; time: string }
  | { kind: ListSheet };

/** The day last picked, so coming back to the schedule finds it still picked. */
const SELECTED_KEY = "schedule-day";

function remember(day: string) {
  try { sessionStorage.setItem(SELECTED_KEY, day); } catch { /* private mode */ }
}

/**
 * The address of the week or month holding a day. This week (or month) is
 * plain /admin/schedule, the same page as the tab; others are keyed on their
 * first day, so each has one address and can be fetched ahead.
 */
function rangeHref(view: CalendarView, day: string, today: string): string {
  const params = new URLSearchParams();
  if (view === "month") params.set("view", "month");
  const anchor = view === "week" ? startOfWeek(day) : `${day.slice(0, 8)}01`;
  const current = view === "week" ? startOfWeek(today) : `${today.slice(0, 8)}01`;
  if (anchor !== current) params.set("date", anchor);
  const query = params.toString();
  return query ? `/admin/schedule?${query}` : "/admin/schedule";
}

const LIST_TITLES: Record<ListSheet, string> = {
  missed: "Missed visits",
  overdue: "Overdue work",
  unfinished: "Unfinished service",
};

export function ScheduleView({
  view, date, today, timezone, days, visits, missed, unfinished, locations, technicians, defaultTechnicianId, canManage, openList,
}: {
  view: CalendarView;
  /** The day the address asked for, or today. */
  date: string;
  today: string;
  /** The company's own zone, for where "now" is on the timeline. */
  timezone: string;
  /** Every day the calendar shows, in order. */
  days: string[];
  visits: CalendarVisit[];
  missed: CalendarVisit[];
  unfinished: UnfinishedTask[];
  locations: BookableLocation[];
  technicians: { id: string; name: string }[];
  defaultTechnicianId: string | null;
  canManage: boolean;
  openList: ListSheet | null;
}) {
  const router = useRouter();
  const dayset = useMemo(() => new Set(days), [days]);
  // The second row of a month grid is always inside the month.
  const month = days[Math.min(7, days.length - 1)].slice(0, 7);

  const [selected, setSelected] = useState(() => (dayset.has(date) ? date : days[0]));
  useLayoutEffect(() => {
    let stored: string | null = null;
    try { stored = sessionStorage.getItem(SELECTED_KEY); } catch { /* private mode */ }
    if (stored && dayset.has(stored)) setSelected(stored);
  }, [dayset]);
  useEffect(() => { remember(selected); }, [selected]);

  // What was just changed, shown at once; the page's own refresh replaces it.
  const [overrides, setOverrides] = useState<Record<string, Partial<CalendarVisit> | "cancelled">>({});
  useEffect(() => { setOverrides({}); }, [visits, missed]);

  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  // A visit booked in another week: refresh first, so that week is fetched
  // fresh, then go there. Going straight there could show it from before.
  const [goAfterRefresh, setGoAfterRefresh] = useState<string | null>(null);
  useEffect(() => {
    if (!goAfterRefresh) return;
    router.replace(goAfterRefresh);
    setGoAfterRefresh(null);
    // Only once the refreshed data has arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits]);

  const all = useMemo(() => {
    const byId = new Map<string, CalendarVisit>();
    for (const v of [...missed, ...visits]) byId.set(v.id, v);
    const out: CalendarVisit[] = [];
    for (const v of byId.values()) {
      const change = overrides[v.id];
      if (change === "cancelled") continue;
      const next = change ? { ...v, ...change } : v;
      if (change && next.status === "MISSED" && next.date >= today) next.status = "SCHEDULED";
      out.push(next);
    }
    return out;
  }, [visits, missed, overrides, today]);

  const visitsByDay = useMemo(() => {
    const map = new Map<string, CalendarVisit[]>();
    for (const v of all) {
      if (!dayset.has(v.date)) continue;
      map.set(v.date, [...(map.get(v.date) ?? []), v]);
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [all, dayset]);

  // Work due on each day from today on, by restaurant; earlier is overdue.
  const { dueByDay, overdue } = useMemo(() => {
    const dueByDay = new Map<string, { location: BookableLocation; units: number }[]>();
    const overdue: OverdueRow[] = [];
    for (const location of locations) {
      const counts = new Map<string, number>();
      let late = 0;
      for (const day of location.due) {
        if (day < today) late++;
        else if (dayset.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
      }
      for (const [day, units] of counts) dueByDay.set(day, [...(dueByDay.get(day) ?? []), { location, units }]);
      if (late) overdue.push({ location, units: late, since: location.due[0] });
    }
    overdue.sort((a, b) => a.since.localeCompare(b.since));
    return { dueByDay, overdue };
  }, [locations, today, dayset]);

  const marks = useMemo(() => {
    const map = new Map<string, DayMarks>();
    for (const day of days) {
      const dayVisits = visitsByDay.get(day) ?? [];
      const due = (dueByDay.get(day) ?? []).reduce((sum, d) => sum + d.units, 0);
      if (dayVisits.length || due) map.set(day, { visits: dayVisits, due });
    }
    return map;
  }, [days, visitsByDay, dueByDay]);

  const missedNow = all.filter((v) => v.status === "MISSED" && missed.some((m) => m.id === v.id));
  const overdueUnits = overdue.reduce((sum, row) => sum + row.units, 0);

  // Sheets: one at a time, with Back to the one it was opened from.
  const [stack, setStack] = useState<SheetState[]>([]);
  useEffect(() => { if (openList) setStack([{ kind: openList }]); }, [openList]);
  const sheet = stack[stack.length - 1] ?? null;
  const open = (next: SheetState, fromSheet = false) => setStack((s) => (fromSheet ? [...s, next] : [next]));
  const closeSheets = () => setStack([]);

  // Ahead of time and back.
  const anchor = view === "week" ? days[0] : `${month}-01`;
  const prevHref = rangeHref(view, stepDate(view, anchor, -1), today);
  const nextHref = rangeHref(view, stepDate(view, anchor, 1), today);
  useEffect(() => {
    router.prefetch(prevHref);
    router.prefetch(nextHref);
  }, [router, prevHref, nextHref]);

  const prevLink = useRef<HTMLAnchorElement>(null);
  const nextLink = useRef<HTMLAnchorElement>(null);
  /** A day the next range should open on, when a swipe crossed into it. */
  const landOn = useRef<string | null>(null);
  const step = (direction: 1 | -1) => () => {
    remember(landOn.current ?? stepDate(view, selected, direction));
    landOn.current = null;
  };

  const calendar = useRef<HTMLDivElement>(null);
  useSwipe(calendar, { prev: () => prevLink.current?.click(), next: () => nextLink.current?.click() });

  const agenda = useRef<HTMLDivElement>(null);
  const moveDay = (by: 1 | -1) => {
    const target = addDays(selected, by);
    if (dayset.has(target)) { setSelected(target); return; }
    landOn.current = target;
    (by > 0 ? nextLink : prevLink).current?.click();
  };
  useSwipe(agenda, { prev: () => moveDay(-1), next: () => moveDay(1) });

  const bookDate = selected < today ? today : selected;
  const dayVisits = visitsByDay.get(selected) ?? [];
  const dayDue = dueByDay.get(selected) ?? [];
  const dayUnits = dayVisits.reduce((sum, v) => sum + v.units, 0);
  const unassigned = dayVisits.filter((v) => !v.technician && v.status !== "COMPLETED").length;

  function afterChange(message: string, day: string | null) {
    closeSheets();
    setNotice(message);
    if (day && dayset.has(day)) setSelected(day);
    router.refresh();
  }

  function onBooked(booked: { date: string; time: string }) {
    const message = `Booked for ${shortDay(booked.date)} at ${clockLabel(minutesOf(booked.time))}`;
    if (dayset.has(booked.date)) { afterChange(message, booked.date); return; }
    closeSheets();
    setNotice(message);
    remember(booked.date);
    setGoAfterRefresh(rangeHref(view, booked.date, today));
    router.refresh();
  }

  const bookAt = (day: string, time: string) => open({ kind: "book", locationId: null, date: day, time });

  return (
    <main className="rise sched">
      <header className="sched-head">
        <h1 style={{ fontSize: 23, lineHeight: 1.15 }}>Schedule</h1>
        <nav className="segmented" aria-label="Calendar view">
          <TapLink href={rangeHref("week", selected, today)} replace aria-current={view === "week" ? "page" : undefined}
            onClick={() => remember(selected)}>Week</TapLink>
          <TapLink href={rangeHref("month", selected, today)} replace aria-current={view === "month" ? "page" : undefined}
            onClick={() => remember(selected)}>Month</TapLink>
        </nav>
      </header>

      {missedNow.length || overdueUnits || unfinished.length ? (
        <div className="sched-alerts">
          {missedNow.length ? (
            <button type="button" className="sched-alert bad" onClick={() => open({ kind: "missed" })}>
              <span className="sched-alert-count">{missedNow.length}</span>
              <span className="sched-alert-label">Missed visit{missedNow.length === 1 ? "" : "s"}</span>
            </button>
          ) : null}
          {overdueUnits ? (
            <button type="button" className="sched-alert bad" onClick={() => open({ kind: "overdue" })}>
              <span className="sched-alert-count">{overdueUnits}</span>
              <span className="sched-alert-label">Overdue, not booked</span>
            </button>
          ) : null}
          {unfinished.length ? (
            <button type="button" className="sched-alert warn" onClick={() => open({ kind: "unfinished" })}>
              <span className="sched-alert-count">{unfinished.length}</span>
              <span className="sched-alert-label">Unfinished service</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <section className={`sched-cal is-${view}`} aria-label="Calendar">
        <div className="sched-cal-nav">
          <TapLink ref={prevLink} href={prevHref} replace className="sched-nav-btn" onClick={step(-1)}
            aria-label={view === "week" ? "Previous week" : "Previous month"}>
            <Chevron flip />
          </TapLink>
          <div className="sched-cal-title">{rangeTitle(view, view === "week" ? days[0] : `${month}-01`)}</div>
          <TapLink ref={nextLink} href={nextHref} replace className="sched-nav-btn" onClick={step(1)}
            aria-label={view === "week" ? "Next week" : "Next month"}>
            <Chevron />
          </TapLink>
          {dayset.has(today) && selected === today ? null : (
            <TapLink href={rangeHref(view, today, today)} replace className="sched-today" onClick={() => remember(today)}>Today</TapLink>
          )}
        </div>
        <div ref={calendar}>
          {view === "week"
            ? <WeekStrip days={days} today={today} selected={selected} marks={marks} onSelect={setSelected} />
            : <MonthGrid days={days} month={month} today={today} selected={selected} marks={marks} onSelect={setSelected} />}
        </div>
        <div className="sched-legend" aria-hidden="true">
          <span><i className="sched-dot visit" /> Visit</span>
          <span><i className="sched-dot due" /> Work due</span>
          <span><i className="sched-dot missed" /> Missed</span>
          <span><i className="sched-dot done" /> Done</span>
        </div>
      </section>

      <div ref={agenda}>
        <div className="sched-dayhead">
          <div style={{ minWidth: 0 }}>
            <h2>
              {dayTitle(selected)}
              {selected === today ? <span className="sched-today-tag">Today</span> : null}
            </h2>
            <div className="sched-daymeta">
              {dayVisits.length
                ? `${dayVisits.length} visit${dayVisits.length === 1 ? "" : "s"} · ${dayUnits} unit${dayUnits === 1 ? "" : "s"}${unassigned ? ` · ${unassigned} not assigned` : ""}`
                : "Nothing booked"}
            </div>
          </div>
          {canManage ? (
            <Button size="sm" style={{ width: "auto", flexShrink: 0 }}
              onClick={() => open({ kind: "book", locationId: null, date: bookDate, time: "09:00" })}>
              + Book
            </Button>
          ) : null}
        </div>

        {dayDue.length ? (
          <div className="sched-due">
            <div className="sched-due-title">Work due this day</div>
            {dayDue.map(({ location, units }) => (
              <div key={location.id} className="sched-due-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="sched-due-name">{location.name}</div>
                  <div className="sched-due-meta">{units} unit{units === 1 ? "" : "s"} · {location.organizationName}</div>
                </div>
                {canManage ? (
                  <Button size="sm" variant="secondary" style={{ width: "auto", flexShrink: 0 }}
                    onClick={() => open({ kind: "book", locationId: location.id, date: bookDate, time: "09:00" })}>
                    Book
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {!dayVisits.length && canManage && selected >= today ? (
          <p className="sched-hint">Tap a time to book a visit then.</p>
        ) : null}

        <div className={view === "week" ? "sched-phone-only" : undefined}>
          <Timeline days={[selected]} today={today} selected={selected} visitsByDay={visitsByDay} timezone={timezone}
            canBook={canManage} onOpenVisit={(visit) => open({ kind: "visit", visit })} onBookAt={bookAt} />
        </div>
      </div>

      {view === "week" ? (
        <div className="sched-desk-only">
          <Timeline days={days} today={today} selected={selected} visitsByDay={visitsByDay} timezone={timezone}
            dueByDay={new Map([...marks].map(([day, m]) => [day, m.due]))}
            canBook={canManage} onSelectDay={setSelected} onOpenVisit={(visit) => open({ kind: "visit", visit })} onBookAt={bookAt} />
        </div>
      ) : null}

      {sheet ? (
        <Sheet
          title={sheet.kind === "visit" ? sheet.visit.locationName : sheet.kind === "book" ? "Book a visit" : LIST_TITLES[sheet.kind]}
          subtitle={sheet.kind === "visit" ? `${shortDay(sheet.visit.date)} · ${timeRange(sheet.visit)}` : undefined}
          onClose={closeSheets}
          onBack={stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : undefined}
        >
          {sheet.kind === "visit" ? (
            <VisitDetails
              key={sheet.visit.id}
              visit={sheet.visit}
              today={today}
              technicians={technicians}
              canManage={canManage}
              onSaved={(change) => {
                setOverrides((o) => ({ ...o, [sheet.visit.id]: change }));
                const moved = change.date !== sheet.visit.date || change.time !== sheet.visit.time;
                afterChange(moved ? `Moved to ${shortDay(change.date)} at ${clockLabel(minutesOf(change.time))}` : "Saved", change.date);
              }}
              onCancelled={() => {
                setOverrides((o) => ({ ...o, [sheet.visit.id]: "cancelled" }));
                afterChange("Visit cancelled", null);
              }}
            />
          ) : sheet.kind === "book" ? (
            <BookPanel
              key={`${sheet.locationId}:${sheet.date}:${sheet.time}`}
              locations={locations}
              locationId={sheet.locationId}
              date={sheet.date}
              time={sheet.time}
              technicians={technicians}
              defaultTechnicianId={defaultTechnicianId}
              onBooked={onBooked}
            />
          ) : sheet.kind === "missed" ? (
            <MissedList visits={missedNow} onOpen={(visit) => open({ kind: "visit", visit }, true)} />
          ) : sheet.kind === "overdue" ? (
            <OverdueList rows={overdue} canManage={canManage}
              onBook={(locationId) => open({ kind: "book", locationId, date: today, time: "09:00" }, true)} />
          ) : (
            <UnfinishedList tasks={unfinished} />
          )}
        </Sheet>
      ) : null}

      {notice ? <div className="toast" role="status">{notice}</div> : null}
    </main>
  );
}

function Chevron({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={flip ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
