import { ArrowRight, ExternalLink, RefreshCw } from "lucide-react";
import { eventsAreStale, upcomingEvents } from "../data/events.mjs";
import { dateParts, eventTime, publisherTag, relativeDayLabel, shortEventTitle } from "../data/eventDisplay.mjs";
import "../../styles/events.css";

const PROVIDER_NAMES: Record<string, string> = {
  ons: "ONS releases",
  boe_mpc: "Bank of England MPC dates",
  desnz_fuel: "DESNZ fuel prices",
  obr: "OBR publications",
  hm_treasury: "HM Treasury announcements",
  ofgem_energy: "Ofgem energy announcements",
};

function EventItems({ events, now }: { events: any[]; now: Date }) {
  if (!events.length) return <p className="fs-event-empty">No known upcoming dates are available.</p>;
  return <ol className="fs-ev-list">
    {events.map((event) => {
      const parts = dateParts(event.date, now);
      const tag = publisherTag(event.source);
      const short = shortEventTitle(event);
      const relative = relativeDayLabel(event.date, now);
      const time = eventTime(event);
      return <li key={event.id} className={`fs-ev-item ${event.status === "cancelled" ? "fs-ev-cancelled" : ""}`}>
        <time className="fs-ev-date" dateTime={event.time ?? event.date}>
          <span className="fs-ev-sr">{parts.full}{time ? `, ${time} London time` : ""}</span>
          <span className="fs-ev-weekday" aria-hidden="true">{parts.weekday}</span>
          <span className="fs-ev-day" aria-hidden="true">{parts.day}</span>
          <span className="fs-ev-month" aria-hidden="true">{parts.month}{parts.year ? ` ${parts.year}` : ""}</span>
        </time>
        <div className="fs-ev-main">
          <div className="fs-ev-meta">
            <span className="fs-ev-tag" data-tone={tag.tone} title={tag.name}>{tag.label}</span>
            {relative && <span className="fs-ev-when" data-soon={relative === "Today" || relative === "Tomorrow"}>{relative}</span>}
            {time && <span className="fs-ev-time">{time} London time</span>}
            {event.status !== "scheduled" && <span className={`fs-event-status fs-event-${event.status}`}>{event.status === "cancelled" ? "Cancelled" : "Rescheduled"}</span>}
          </div>
          <strong className="fs-ev-title" title={short.derived ? event.title : undefined}>{short.title}</strong>
          {short.detail && <p className="fs-ev-detail">{short.detail}</p>}
          <a className="fs-ev-link" href={event.source_url} target="_blank" rel="noreferrer">Official source <ExternalLink size={12} aria-hidden="true" /></a>
        </div>
      </li>;
    })}
  </ol>;
}

export function EventList({ payload, loading, error, refresh, limit = Infinity, indicatorIds = null, compact = false, now = new Date() }: any) {
  const stale = payload ? eventsAreStale(payload, now) : false;
  const events = payload ? upcomingEvents(payload.events, { now, limit, indicatorIds }) : [];
  const providers = Object.entries(payload?.providers ?? {}) as [string, any][];
  const degraded = providers.filter(([, provider]) => provider.status !== "ok");
  const heading = compact ? (indicatorIds ? "Next release dates" : "Upcoming dates") : "Upcoming official events";
  return <section className={`fs-container fs-section fs-events ${compact ? "fs-events-compact" : ""}`} aria-labelledby={compact ? "upcoming-heading" : "calendar-heading"}>
    <div className="fs-section-heading">
      <div><h2 id={compact ? "upcoming-heading" : "calendar-heading"}>{heading}</h2>
        {!compact && <p>Known official release and meeting dates. Dates appear when a source publishes them.</p>}
      </div>
      <div className="fs-event-actions">
        {!compact && <button className="fs-text-button" type="button" onClick={refresh} disabled={loading}><RefreshCw size={14} aria-hidden="true" /> Check dates</button>}
        {compact && <a className="fs-text-button" href="/calendar">Full calendar <ArrowRight size={15} aria-hidden="true" /></a>}
      </div>
    </div>
    {error && <p className="fs-event-warning" role="status">The latest calendar check failed. Previously checked dates are retained.</p>}
    {stale && <p className="fs-event-warning" role="status">Calendar check is more than 24 hours old or a source is stale. Confirm dates with the official source.</p>}
    {degraded.length > 0 && <p className="fs-event-provider-note">Source status: {degraded.map(([name, provider]) => `${PROVIDER_NAMES[name] ?? name}: ${provider.status}`).join(" · ")}. Unqualified sources have not been checked for dated events.</p>}
    {!payload && loading && <p className="fs-event-empty" aria-live="polite">Checking official dates…</p>}
    {!payload && error && <p className="fs-event-empty">Calendar dates are unavailable.</p>}
    {payload && <EventItems events={events} now={now} />}
    {payload && <p className="fs-event-checked">Last calendar check: {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(payload.checked_at))} · London time</p>}
  </section>;
}
