import type { ReactNode } from "react";
import { requireActor } from "@/lib/auth/session";
import { commandCenter } from "@/lib/api/dashboards";
import { TapLink } from "@/components/ui/tap-link";
import { companyTimezone } from "@/lib/time/company";
import { zonedParts } from "@/lib/time/zone";
import { clockLabel, minutesOf } from "@/lib/time/calendar";

type Tone = "bad" | "warn";

/** Line icons, drawn on a 24-unit grid like the tab bar's. */
const ICONS = {
  calendarPlus: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 13v6M9 16h6",
  calendarX: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM10 14l4 4M14 14l-4 4",
  store: "M3 9l1.6-5h14.8L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6",
  tag: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  clock: "M12 7v5l3 3M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v4M12 14h.01",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  failed: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6",
  clipboard: "M9 3h6v4H9zM9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3M12 11v4M12 18h.01",
  check: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14l-3-3",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  chevron: "M9 18l6-6-6-6",
} as const;

function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={ICONS[name]} />
    </svg>
  );
}

function Section({ title, action, className, children }: {
  title: string; action?: { label: string; href: string }; className?: string; children: ReactNode;
}) {
  return (
    <section className={`dash-section ${className ?? ""}`}>
      <div className="dash-section-head">
        <h2>{title}</h2>
        {action ? <TapLink href={action.href} className="dash-section-link">{action.label}<Icon name="chevron" size={15} /></TapLink> : null}
      </div>
      {children}
    </section>
  );
}

/** Done out of booked for today, as a ring. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 34;
  const length = 2 * Math.PI * r;
  const share = total > 0 ? done / total : 0;
  return (
    <div className="dash-ring" role="img" aria-label={`${done} of ${total} units done`}>
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="8" />
        {/* Nothing done draws nothing: a round cap on an empty arc would still leave a dot. */}
        {share > 0 ? (
          <circle cx="44" cy="44" r={r} fill="none" stroke="var(--accent-2)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${length * share} ${length}`} transform="rotate(-90 44 44)" />
        ) : null}
      </svg>
      <div className="dash-ring-label">
        <strong>{Math.round(share * 100)}%</strong>
        <span>done</span>
      </div>
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The office dashboard: today's work at a glance, what needs someone to step
 * in, what is coming up, and how the equipment stands overall. Today's
 * visits themselves are one tap away on the schedule; listing them here as
 * well read as the same thing twice.
 *
 * Exceptions are surfaced rather than buried — an asset without a tag or a
 * service closed without proof is a problem you should not have to go
 * looking for — but as one tidy list, worst first, each a tap from where it
 * is dealt with.
 */
export default async function CommandCenter() {
  const actor = await requireActor();
  const [data, timeZone] = await Promise.all([
    commandCenter(actor),
    companyTimezone(actor.serviceCompanyId),
  ]);
  const can = (capability: Parameters<typeof actor.capabilities.has>[0]) => actor.capabilities.has(capability);

  // The company's today and time of day, not the server's: that is UTC.
  const now = new Date();
  const hour = minutesOf(zonedParts(now, timeZone).time) / 60;
  // Past midnight is still the evening to anyone awake then.
  const greeting = hour < 4 ? "Good evening" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone });

  const today = data.today;
  const unitsToday = today.equipmentScheduled;

  const exceptions: { label: string; detail: string; value: number; href: string; tone: Tone; icon: keyof typeof ICONS }[] = [
    { label: "Missed visits", detail: "Booked days that passed unfinished", value: data.exceptions.missedVisits, href: "/admin/schedule?status=missed", tone: "bad", icon: "calendarX" },
    { label: "Overdue service", detail: "Jobs past their due date", value: data.exceptions.overdueAssets, href: "/admin/equipment?status=OVERDUE", tone: "bad", icon: "clock" },
    { label: "Incomplete service proof", detail: "Started and never finished", value: data.exceptions.incompleteProof, href: "/admin/schedule?status=incomplete", tone: "bad", icon: "clipboard" },
    { label: "Failed tag pairings", detail: "In the last 24 hours", value: data.exceptions.failedTagPairings, href: "/admin/nfc?filter=failed", tone: "bad", icon: "failed" },
    { label: "Customer-reported problems", detail: "Raised by restaurant staff", value: data.exceptions.customerReportedProblems, href: "/admin/issues?source=CUSTOMER", tone: "warn", icon: "message" },
    { label: "Awaiting verification", detail: "New units to check over", value: data.exceptions.assetsAwaitingVerification, href: "/admin/equipment?status=PENDING_SETUP", tone: "warn", icon: "shield" },
    { label: "Untagged units", detail: "No NFC tag paired yet", value: data.exceptions.assetsWithoutTags, href: "/admin/nfc?filter=untagged", tone: "warn", icon: "tag" },
  ];
  const needsAttention = exceptions.filter((e) => e.value > 0);

  const shortcuts = [
    can("visit.manage") && { label: "Book a visit", href: "/admin/schedule", icon: "calendarPlus" as const },
    can("location.manage") && { label: "Add a restaurant", href: "/admin/locations/new", icon: "store" as const },
    can("tag.viewHistory") && { label: "NFC tags", href: "/admin/nfc", icon: "tag" as const },
    can("report.view") && { label: "Reports", href: "/admin/reports", icon: "chart" as const },
  ].filter(Boolean) as { label: string; href: string; icon: keyof typeof ICONS }[];

  const fleet = data.fleet;
  const tracked = fleet.units - fleet.notSetUp;
  const onSchedule = tracked > 0 ? Math.round(((tracked - fleet.overdue) / tracked) * 100) : null;
  const bar = [
    { key: "overdue", label: "Overdue", value: fleet.overdue },
    { key: "due", label: "Due soon", value: fleet.dueSoon },
    { key: "current", label: "On schedule", value: fleet.current },
    { key: "none", label: "No work set up", value: fleet.notSetUp },
  ];

  return (
    <main className="rise dash">
      <header className="dash-greeting">
        <div className="dash-kicker">{dateLabel}</div>
        <h1>{greeting}</h1>
      </header>

      <div className="dash-cols">
        <div className="dash-col">
          {/* Today, in the brand's navy. */}
          <section className="dash-hero dash-o1" aria-label="Today">
            <div className="dash-hero-top">
              <div style={{ minWidth: 0 }}>
                <div className="dash-hero-kicker">Today&rsquo;s work</div>
                {unitsToday > 0 ? (
                  <>
                    <div className="dash-hero-title">
                      {plural(unitsToday, "unit")} at {plural(today.restaurants.length, "restaurant")}
                    </div>
                    <div className="dash-hero-sub">
                      {today.servicesRemaining > 0 ? `${today.servicesRemaining} still to do` : "All done for today"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="dash-hero-title">No visits today</div>
                    <div className="dash-hero-sub">The schedule shows what&rsquo;s coming and what&rsquo;s due.</div>
                  </>
                )}
              </div>
              {unitsToday > 0 ? <ProgressRing done={today.servicesCompleted} total={unitsToday} /> : null}
            </div>
            <div className="dash-hero-stats">
              <div><strong>{today.restaurants.length}</strong><span>Visits</span></div>
              <div><strong>{today.servicesCompleted}</strong><span>Units done</span></div>
              <div><strong>{today.techniciansWorking}</strong><span>Technicians working</span></div>
            </div>
            <TapLink href="/admin/schedule" className="dash-hero-link">
              Open the schedule <Icon name="chevron" size={16} />
            </TapLink>
          </section>

          <Section title="Coming up" className="dash-o5" action={{ label: "See all", href: "/admin/schedule" }}>
            {data.upcoming.length === 0 ? (
              <div className="dash-empty">Nothing booked after today yet.</div>
            ) : (
              <div className="dash-card dash-rows">
                {data.upcoming.map((visit) => {
                  const at = new Date(visit.scheduledFor);
                  const part = (options: Intl.DateTimeFormatOptions) => at.toLocaleDateString("en-US", { ...options, timeZone: visit.timezone });
                  return (
                    <TapLink key={visit.id} href={`/admin/schedule/${visit.id}`} className="dash-row tap">
                      <div className="dash-date" aria-hidden="true">
                        <span>{part({ weekday: "short" })}</span>
                        <strong>{part({ day: "numeric" })}</strong>
                      </div>
                      <div className="dash-row-main">
                        <div className="dash-row-title">{visit.locationName}</div>
                        <div className="dash-row-sub">
                          {part({ month: "short", day: "numeric" })} · {clockLabel(minutesOf(zonedParts(at, visit.timezone).time))} · {plural(visit.taskCount, "unit")} · {visit.technician ?? "Not assigned"}
                        </div>
                      </div>
                      <span className="dash-chevron"><Icon name="chevron" size={18} /></span>
                    </TapLink>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <div className="dash-col">
          {shortcuts.length ? (
            <nav className="dash-shortcuts dash-o2" aria-label="Shortcuts">
              {shortcuts.map((s) => (
                <TapLink key={s.href} href={s.href} className="dash-shortcut tap">
                  <span className="dash-shortcut-icon"><Icon name={s.icon} /></span>
                  <span>{s.label}</span>
                </TapLink>
              ))}
            </nav>
          ) : null}

          <Section title={needsAttention.length ? `Needs attention · ${needsAttention.length}` : "Needs attention"} className="dash-o3">
            {needsAttention.length === 0 ? (
              <div className="dash-card dash-clear">
                <span className="dash-icon-tile good"><Icon name="check" /></span>
                <div>
                  <div className="dash-row-title">All clear</div>
                  <div className="dash-row-sub">Nothing needs you right now.</div>
                </div>
              </div>
            ) : (
              <div className="dash-card dash-rows">
                {needsAttention.map((item) => (
                  <TapLink key={item.label} href={item.href} className="dash-row tap">
                    <span className={`dash-icon-tile ${item.tone}`}><Icon name={item.icon} /></span>
                    <div className="dash-row-main">
                      <div className="dash-row-title">{item.label}</div>
                      <div className="dash-row-sub">{item.detail}</div>
                    </div>
                    <span className={`dash-count ${item.tone}`}>{item.value}</span>
                    <span className="dash-chevron"><Icon name="chevron" size={18} /></span>
                  </TapLink>
                ))}
                {data.exceptions.technicianExceptions.map((exception, index) => (
                  <div key={`${exception.technicianId}-${index}`} className="dash-row">
                    <span className="dash-icon-tile warn"><Icon name="user" /></span>
                    <div className="dash-row-main">
                      <div className="dash-row-title">{exception.technicianName}</div>
                      <div className="dash-row-sub">{exception.issue}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Equipment" className="dash-o6" action={{ label: "All units", href: "/admin/equipment" }}>
            {fleet.units === 0 ? (
              <div className="dash-empty">No units yet. Add them from a restaurant&rsquo;s page.</div>
            ) : (
              <div className="dash-card dash-fleet">
                <div className="dash-fleet-head">
                  <strong>{onSchedule === null ? "—" : `${onSchedule}%`}</strong>
                  <span>of units with work set up are on schedule · {plural(fleet.units, "unit")} in all</span>
                </div>
                <div className="dash-fleet-bar" role="img"
                  aria-label={bar.map((b) => `${b.label} ${b.value}`).join(", ")}>
                  {bar.filter((b) => b.value > 0).map((b) => (
                    <span key={b.key} className={`is-${b.key}`} style={{ flexGrow: b.value }} />
                  ))}
                </div>
                <ul className="dash-fleet-legend">
                  {bar.map((b) => (
                    <li key={b.key}><i className={`is-${b.key}`} />{b.label}<strong>{b.value}</strong></li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        </div>
      </div>
    </main>
  );
}
