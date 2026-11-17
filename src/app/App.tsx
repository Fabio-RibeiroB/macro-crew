import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Fuel,
  Landmark,
  Moon,
  RefreshCw,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  Sun,
  TrendingUp,
} from "lucide-react";
const HistoricalTrendCard = lazy(() =>
  import("./components/HistoricalTrendCard").then((module) => ({
    default: module.HistoricalTrendCard,
  })),
);
import {
  chartPoints,
  formatPeriod,
  freshness,
  legacyReports,
  lastRateChange,
  loadVerified,
  percent,
  previousReading,
  previousPublishedWindow,
  referenceWindow,
} from "./data/verified.mjs";
import {
  NAV_PAGES,
  FOOTER_PAGES,
  documentTitle,
  resolvePage,
} from "./data/pages.mjs";
import {
  createRefreshController,
  bindRefreshLifecycle,
  refreshSnapshot,
  refreshView,
} from "./data/refresh.mjs";
import {
  NAV_COLLAPSE_QUERY,
  bindPageNavigation,
  bindMenuDismissal,
  menuFocusAction,
} from "./data/interactions.mjs";
import { loadEvents } from "./data/events.mjs";
import { loadAiStatus } from "./data/aiStatus.mjs";
import { IndicatorTable } from "./components/IndicatorTable";
import { OfficialLink } from "./components/OfficialLink";
import { EconomyPage } from "./components/EconomyPage";
import { JobsPayPage } from "./components/JobsPayPage";
import { HousingPage } from "./components/HousingPage";
import { GovernmentPage } from "./components/GovernmentPage";
import { PricesPage } from "./components/PricesPage";
import { checkedAt } from "./data/format.mjs";
import { EventList } from "./components/EventList";
import { ReleaseSummaries } from "./components/ReleaseSummaries";
import { createSummaryRefreshController, loadSummaries } from "./data/summaries.mjs";
import "../styles/friendly.css";

const topics = {
  cpi: {
    short: "CPI inflation",
    Icon: TrendingUp,
    measurement: "CPI · change over 12 months",
    color: "#a03b28",
    detailHref: "/prices#figures",
    meaning:
      "CPI measures price changes across everyday goods and services. The Bank of England's 2% target applies to this measure.",
    caution:
      "Lower inflation means prices are rising more slowly. It does not usually mean prices are falling.",
  },
  cpih: {
    short: "Inflation (CPIH)",
    Icon: ShoppingBasket,
    measurement: "CPIH · change over 12 months",
    color: "#b56b43",
    detailHref: "/prices#figures",
    meaning:
      "CPIH measures price changes across everyday goods, services and housing costs. Your own inflation rate depends on what you spend money on.",
    caution:
      "Lower inflation means prices are rising more slowly. It does not usually mean prices are falling.",
  },
  bank_rate: {
    short: "Bank Rate",
    Icon: Landmark,
    measurement: "Bank of England · annual interest rate",
    color: "#277567",
    detailHref: "/economy#interest-rates",
    meaning:
      "Bank Rate influences what lenders charge and what savers earn. Your mortgage or savings rate can differ, and fixed-rate deals usually change when the deal ends.",
    caution:
      "This is a daily observation of the policy rate, not a new MPC announcement.",
  },
  gdp: {
    short: "GDP",
    Icon: Sprout,
    measurement: "Real GDP · change from the previous month",
    color: "#6b76b5",
    detailHref: "/economy#gdp",
    meaning:
      "GDP measures economic output. Growth can support business activity and jobs, but it does not tell us whether every household is better off.",
    caution:
      "One month can be volatile. Early estimates can change as the ONS receives more information.",
  },
  public_debt: {
    short: "Public debt",
    Icon: Landmark,
    measurement: "ONS public sector net debt · percent of GDP",
    color: "#69748b",
    detailHref: "/government-budget#public-debt",
    meaning: "The amount of public sector debt outstanding, compared with the value of the UK economy over a year.",
    caution: "Debt is a balance at a point in time. It is different from the deficit or borrowing during a period, and from the wider net financial liabilities measure.",
  },
  gilt_5y: {
    short: "5-year gilt yield", Icon: Landmark, measurement: "BoE · fitted nominal par yield · 5 years",
    color: "#5f8094", detailHref: "/government-budget#gilt-yields",
    meaning: "A fitted yield at a fixed 5-year maturity that reflects market financing conditions.",
    caution: "This is a fitted nominal par yield, not the redemption yield on one benchmark gilt or the average cost of all outstanding government debt.",
  },
  gilt_10y: {
    short: "10-year gilt yield", Icon: Landmark, measurement: "BoE · fitted nominal par yield · 10 years",
    color: "#276f87", detailHref: "/government-budget#gilt-yields",
    meaning: "A fitted yield at a fixed 10-year maturity that reflects market financing conditions.",
    caution: "This is a fitted nominal par yield, not the redemption yield on one benchmark gilt or the average cost of all outstanding government debt.",
  },
  gilt_20y: {
    short: "20-year gilt yield", Icon: Landmark, measurement: "BoE · fitted nominal par yield · 20 years",
    color: "#866d9c", detailHref: "/government-budget#gilt-yields",
    meaning: "A fitted yield at a fixed 20-year maturity that reflects market financing conditions.",
    caution: "This is a fitted nominal par yield, not the redemption yield on one benchmark gilt or the average cost of all outstanding government debt.",
  },
  regular_pay_nominal_growth: {
    short: "Regular pay growth",
    Icon: TrendingUp,
    measurement: "Great Britain · regular pay annual growth, excluding bonuses",
    color: "#547b46",
    detailHref: "/jobs-pay#wages",
    meaning: "Average regular earnings growth across Great Britain, before inflation.",
  caution:
    "This is a three-month average compared with the same period a year earlier; adjacent published windows overlap.",
  },
  unemployment: {
    short: "Unemployment",
    Icon: TrendingUp,
    measurement: "UK · people aged 16+ · seasonally adjusted",
    color: "#865c82",
    detailHref: "/jobs-pay#unemployment",
    meaning: "The share of the economically active population aged 16 and over who are unemployed, measured by the Labour Force Survey.",
    caution: "This Labour Force Survey estimate has greater sampling uncertainty than before the pandemic.",
  },
  house_price_level: {
    short: "House prices", Icon: Landmark, measurement: "UK average house price · pounds", color: "#547b8a", detailHref: "/housing#house-prices", meaning: "The average price of a home sold in the United Kingdom.", caution: "Recent UK HPI estimates are provisional and can be revised."
  },
  household_energy: {
    short: "Household energy", Icon: Fuel,
    measurement: "Great Britain · typical dual-fuel bill · pounds per year",
    color: "#547b8a", detailHref: "/prices#household-energy",
    meaning: "Ofgem's illustrative annual bill for a typical household on a default variable tariff paying by Direct Debit.",
    caution: "The cap limits rates, not total bills. Actual charges vary by region and use; it does not cover Northern Ireland or fixed tariffs.",
  },
  petrol_price: {
    short: "Petrol & Diesel", Icon: Fuel,
    measurement: "UK average retail pump prices · pence per litre",
    color: "#547b8a", detailHref: "/prices#petrol-diesel",
    meaning: "A UK-wide average from the DESNZ sample, not a price at your local forecourt.",
    caution: "The sample is weighted by sales and is not a quote for an individual station.",
  },
  private_rent_growth: {
    short: "Rent",
    Icon: Landmark,
    measurement: "UK private rent · annual growth",
    color: "#9b6b32",
    detailHref: "/housing#rent",
    meaning: "Annual change in average private rents across the United Kingdom.",
    caution: "The latest two UK months are provisional; Northern Ireland inputs are imputed and revised later.",
  },
};
const metricValue = (metric: any) => ["GBP_per_month", "GBP", "GBP_per_year"].includes(metric?.definition?.unit)
  ? (metric.latest?.value == null ? "Not available" : `£${Number(metric.latest.value).toLocaleString("en-GB")}`)
  : metric?.definition?.unit === "pence_per_litre"
    ? (metric.latest?.value == null ? "Not available" : `${metric.latest.value}p`)
  : percent(metric?.latest?.value);
function MetricCard({
  metric,
  kind,
  secondaryMetric,
}: {
  metric: any;
  kind: keyof typeof topics;
  secondaryMetric?: any;
}) {
  const topic = topics[kind];
  const Tag = "h3";
  if (!metric) {
    return (
      <article className="fs-stat">
        <div className="fs-stat-top">
          <Tag>{topic.short}</Tag>
          <topic.Icon size={18} aria-hidden="true" />
        </div>
        <p className="fs-number">Not available</p>
        <p className="fs-measure">{topic.measurement}</p>
        <p className="fs-period">A verified reading is not available yet.</p>
    <a className="fs-stat-link" href={topic.detailHref}>
        See {topic.short.toLowerCase()} details <ArrowRight size={15} aria-hidden="true" />
        </a>
      </article>
    );
  }
  const status = freshness(metric);
  const previous = previousReading(metric);
  const isPay = kind === "regular_pay_nominal_growth";
  const isGilt = kind.startsWith("gilt_");
  const isRolling = isPay || kind === "unemployment";
  const payPrevious = isRolling ? previousPublishedWindow(metric) : null;
  const comparisonPoint = isRolling ? payPrevious : previous;
  const currentWindow = isRolling ? referenceWindow(metric.latest) : null;
  const secondaryWindow = isPay ? referenceWindow(secondaryMetric?.latest) : null;
  const oldWindow = isRolling ? referenceWindow(payPrevious) : null;
  const rateChange = kind === "bank_rate" ? lastRateChange(metric) : null;
  const delta = comparisonPoint
    ? Number(metric.latest.value) - Number(comparisonPoint.value)
    : null;
  return (
    <article
      className="fs-stat"
      style={{ "--topic": topic.color } as React.CSSProperties}
    >
      <div className="fs-stat-top">
        <Tag>{topic.short}</Tag>
        <topic.Icon size={18} aria-hidden="true" />
      </div>
      <p className="fs-number">{metricValue(metric)}</p>
      <p className="fs-measure">{topic.measurement}</p>
      <p className="fs-period">
        {metric.latest ? (
          <>
            {kind === "bank_rate" ? "Observed" : "For"}{" "}
            <strong>
              {currentWindow
                ? `${formatPeriod(currentWindow.start_month)} to ${formatPeriod(currentWindow.end_month)}`
                : formatPeriod(metric.latest.period)}
            </strong>
          </>
        ) : (
          "A verified reading is not available yet."
        )}
      </p>
      {isPay && (
        <p className="fs-comparison">
          {secondaryMetric?.latest?.value != null ? (
            <>
              Official CPIH-adjusted regular pay: {percent(secondaryMetric.latest.value)} for{" "}
              {secondaryWindow
                ? ` ${formatPeriod(secondaryWindow.start_month)} to ${formatPeriod(secondaryWindow.end_month)}`
                : ` ${formatPeriod(secondaryMetric.latest.period)}`}
              {currentWindow && secondaryWindow &&
              currentWindow.start_month === secondaryWindow.start_month &&
              currentWindow.end_month === secondaryWindow.end_month
                ? " (same published window)"
                : "; separate window, not directly matched to nominal pay"}
              {secondaryMetric.collection_status !== "ok" ? " · update delayed, showing last verified figure" : ""}
            </>
          ) : (
            "Official CPIH-adjusted regular pay is currently unavailable."
          )}
        </p>
      )}
      {kind === "private_rent_growth" && <p className="fs-comparison">Average monthly rent: {secondaryMetric?.latest?.value == null ? "not available" : `£${Number(secondaryMetric.latest.value).toLocaleString("en-GB")}`} {secondaryMetric?.latest?.period ? `in ${formatPeriod(secondaryMetric.latest.period)}` : ""}{secondaryMetric?.collection_status === "degraded" ? " · update delayed, showing the last verified rent" : ""}</p>}
      {kind !== "house_price_level" && <div className="fs-comparison">
        {kind === "bank_rate" ? rateChange ? (
          <>
            Latest evidenced change: {rateChange.difference > 0 ? "+" : "−"}
            {Math.abs(rateChange.difference).toFixed(2).replace(/\.?0+$/, "")} percentage point
            {Math.abs(rateChange.difference) === 1 ? "" : "s"} at the{" "}
            {formatPeriod(rateChange.period)} observation
          </>
        ) : "The last rate change cannot be established from the available history." : isGilt && comparisonPoint && delta !== null ? (
          <><span>{delta === 0 ? "Unchanged" : `${delta > 0 ? "+" : "−"}${Math.abs(delta * 100).toFixed(2).replace(/\.00$/, "")} basis points`}</span> compared with the previous available trading observation on {formatPeriod(comparisonPoint.period)}. One percentage point equals 100 basis points.</>
        ) : comparisonPoint && delta !== null ? (
          <>
            <span>
              {Math.abs(delta) < 0.00001
                ? "Unchanged"
                : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(2).replace(/0$/, "")} percentage points`}
            </span>{" "}
            compared with {oldWindow
              ? `${formatPeriod(oldWindow.start_month)} to ${formatPeriod(oldWindow.end_month)}`
              : formatPeriod(comparisonPoint.period)}
            {isRolling ? "; these published three-month windows overlap" : ""}
          </>
        ) : (
          "A directly comparable previous reading is not available."
        )}
      </div>}
      <p className="fs-stat-meaning">{topic.meaning}</p>
      <div className={`fs-fresh fs-fresh-${status.kind}`}>
        <ShieldCheck size={14} aria-hidden="true" />
        {status.label}
      </div>
      <details className="fs-details fs-info">
        <summary>
          About {topic.short}{" "}
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <p>{topic.caution}</p>
        <dl>
          <div>
            <dt>Source series</dt>
            <dd>
              {metric.definition.dataset} / {metric.definition.series}
            </dd>
          </div>
          <div>
            <dt>Official release</dt>
            <dd>
              {metric.source_published_date
                ? formatPeriod(metric.source_published_date)
                : "Not supplied by the daily feed"}
            </dd>
          </div>
          <div>
            <dt>Last successful check</dt>
            <dd>{checkedAt(metric.last_successful_check_at)}</dd>
          </div>
          <div>
            <dt>Next expected release</dt>
            <dd>
              {metric.next_release_date
                ? formatPeriod(metric.next_release_date)
                : "See the official calendar"}
            </dd>
          </div>
        </dl>
        <OfficialLink href={metric.definition.source_url}>
          View the official series
        </OfficialLink>
      </details>
      <a className="fs-stat-link" href={topic.detailHref}>
        See {topic.short} details <ArrowRight size={15} aria-hidden="true" />
      </a>
    </article>
  );
}

function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="fs-container fs-page-heading">
      {eyebrow ? <p className="fs-eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </section>
  );
}

function UkFlag() {
  return (
    <span className="fs-flag" aria-hidden="true">
      <svg viewBox="0 0 60 30" focusable="false">
        <rect width="60" height="30" fill="#012169" />
        <path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0 L60 30 M60 0 L0 30" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0 V30 M0 15 H60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0 V30 M0 15 H60" stroke="#C8102E" strokeWidth="6" />
      </svg>
    </span>
  );
}

function BrandLink() {
  return (
    <a className="fs-brand" href="/" aria-label="finstats UK home">
      <UkFlag />
      <span>
        FinStats <b>UK</b>
      </span>
    </a>
  );
}

function Statistics({
  data,
  kinds,
  loading,
  error,
  refresh,
  sectionId,
  title,
  eyebrow,
  alias,
  children,
}: any) {
  const headingId = sectionId ? `${sectionId}-title` : "figures-title";
  return (
    <section
      className="fs-container fs-section"
      id={sectionId ?? "figures"}
      aria-labelledby={headingId}
    >
      {alias && <span id={alias} className="fs-anchor-alias" />}
      <div className="fs-section-heading">
        <div>
          <p className="fs-eyebrow">{eyebrow ?? "The latest verified figures"}</p>
          <h2 id={headingId}>{title ?? "Latest verified figures"}</h2>
          <p>Each figure has its own reference period and official source.</p>
        </div>
        <button
          className="fs-text-button"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} className={loading ? "fs-spin" : ""} />
          {loading ? "Checking figures…" : "Check for updates"}
        </button>
      </div>
      {error && (
        <div className="fs-alert" role="status">
          {error}{" "}
          {data
            ? "The last successfully loaded figures remain below."
            : "Verified figures are unavailable. You can still read the guides and visit the official sources."}
        </div>
      )}
      {data ? (
        <>
          <div className={`fs-stat-grid fs-stat-count-${kinds.length}`}>
            {kinds.map((kind: keyof typeof topics) => (
              <MetricCard
                key={kind}
                kind={kind}
                metric={data.metrics[kind]}
                secondaryMetric={kind === "regular_pay_nominal_growth" ? data.metrics.regular_pay_real_growth : kind === "private_rent_growth" ? data.metrics.private_rent_level : kind === "house_price_level" ? data.metrics.house_price_growth : undefined}
              />
            ))}
          </div>
          <p className="fs-caption">
            finstats UK export updated {checkedAt(data.published_at)}. Figures can
            be revised. <a href="/sources">How we check the data</a>
          </p>
        </>
      ) : (
        !error && (
          <p className="fs-loading" role="status">
            Checking the official-data export…
          </p>
        )
      )}
      {children}
    </section>
  );
}

function Overview({ data, loading, error, refresh }: any) {
  return (
    <section className="fs-container fs-section fs-overview" id="overview" aria-labelledby="overview-title">
      <span id="figures" className="fs-anchor-alias" />
      <div className="fs-pagehead">
        <h1 id="overview-title">Latest figures</h1>
        <p className="fs-lede">
          Official releases from the ONS, Bank of England, Ofgem, DESNZ and HM Land Registry.
        </p>
        <button className="fs-text-button" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw size={15} className={loading ? "fs-spin" : ""} aria-hidden="true" />
          {loading ? "Checking figures…" : "Check for updates"}
        </button>
      </div>
      {error && (
        <div className="fs-alert" role="status">
          {error}{" "}
          {data
            ? "The last successfully loaded figures remain below."
            : "Verified figures are unavailable. You can still read the guides and visit the official sources."}
        </div>
      )}
      {data ? (
        <>
          <IndicatorTable
            data={data}
            hrefs={Object.fromEntries(Object.entries(topics).map(([kind, topic]) => [kind, topic.detailHref]))}
          />
          <p className="fs-ledger-note" id="change-note">
            * Change is the latest value minus the previous one, calculated by FinStats from the official
            series. pp means percentage points. Figures last updated {checkedAt(data.published_at)} and can
            be revised. <a href="/sources">How we check the data</a>
          </p>
        </>
      ) : (
        !error && (
          <p className="fs-loading" role="status">
            Checking the official-data export…
          </p>
        )
      )}
    </section>
  );
}

function Publications({ reports, reportTime }: any) {
  return (
    <section className="fs-container fs-section" id="publications">
      <div className="fs-section-heading">
        <div>
          <p className="fs-eyebrow">Read a little deeper</p>
          <h2>The Bank’s outlook & financial stability</h2>
          <p>
            Official Bank of England and OBR publications.
          </p>
        </div>
      </div>
      <div className="fs-report-links">
        <OfficialLink href="https://www.bankofengland.co.uk/monetary-policy-report">
          Monetary Policy Reports
        </OfficialLink>
        <OfficialLink href="https://www.bankofengland.co.uk/financial-stability-report">
          Financial Stability Reports
        </OfficialLink>
        <a className="fs-link" href="/government-budget">
          Government Budgets & OBR forecasts <ArrowRight size={16} aria-hidden="true" />
        </a>
        <OfficialLink href="https://obr.uk/">
          OBR forecasts & analysis
        </OfficialLink>
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="fs-container fs-section fs-reading-grid">
      <article>
        <h2>What is published now</h2>
        <p>
          The verified figures are UK-wide: CPI and CPIH from the Office for
          National Statistics, Bank Rate from the Bank of England, and monthly
          real GDP from the Office for National Statistics. Each figure shows
          its reference period, unit and source. A time when finstats UK
          checked a feed is not a new official release.
        </p>
        <p>
          Wages and unemployment are published from verified official series.
          UK private-rent growth and average monthly rent are also published.
          UK average house prices are published from the HM Land Registry UK HPI.
          Household energy bills and road fuel prices are published from
          official Ofgem and government feeds. If a statistic covers a smaller area than the UK,
          such as Great Britain, that geography is named with the figure.
        </p>
        <h2>Official figures and AI summaries</h2>
        <p>
          The numbers come from the named official series. Some pages also keep
          earlier summaries produced with AI. Those summaries are labelled as
          commentary. They are separate from the verified figures, they are not
          official statistics, and they are not forecasts produced by this
          site.
        </p>
        <p>
          <a className="fs-link" href="/economy#ai-summary">Read the AI summary</a>
        </p>
        <p>
          <a className="fs-link" href="/sources">
            Sources and methodology
          </a>
        </p>
      </article>
      <aside className="fs-context-card">
        <h3>Scope and limits</h3>
        <p>
          This is a public website that republishes official statistics with
          attribution. It is not a government website, and it does not produce
          official statistics.
        </p>
        <p>Nothing here is individual financial advice.</p>
      </aside>
    </section>
  );
}

function Sources() {
  return (
    <section className="fs-container fs-section fs-reading-grid">
      <article>
        <h2>Official statistics supply the numbers</h2>
        <p>
          finstats UK downloads structured data from the ONS and Bank of England.
          We check the series definition, unit and reference period, keep source
          evidence and publish a consistent snapshot independently of AI.
        </p>
        <p>
          Every figure’s source disclosure shows the series, official
          publication date where supplied and last successful check. A
          collection time is not a new official release.
        </p>
        <p>
          Rent uses ONS PIPR UK Table 1, United Kingdom area code K02000001.
          Annual change and average monthly pounds are separate series. The
          latest two UK months are provisional; Northern Ireland inputs for
          those months are imputed and revised when observed data arrive.
        </p>
        <h3>Revisions are part of the record</h3>
        <p>
          Charts show the latest accepted values. Earlier source snapshots are
          retained privately so changes can be inspected. Our local revision
          archive starts when collection began; it does not reconstruct every
          past publication vintage.
        </p>
        <p>
          If a source fails, previously verified data stays available with
          freshness information. An AI failure cannot stop valid figures being
          published.
        </p>
        <OfficialLink href="https://github.com/Fabio-RibeiroB/macro-crew/blob/main/docs/architecture-assessment.md">
          Read the methodology
        </OfficialLink>
      </article>
      <aside className="fs-context-card">
        <ShieldCheck size={27} />
        <h3>Know what you’re reading</h3>
        <p>
          <strong>Observed facts:</strong> a named official series for a stated
          period.
        </p>
        <p>
          <strong>Forecasts:</strong> expectations about the future, not results
          already observed.
        </p>
        <p>
          <strong>Interpretation:</strong> possible meaning, with uncertainty
          kept in view.
        </p>
        <p>
          Household guides are general explanations. Earlier AI summaries are
          labelled and kept separate from verified current statistics.
        </p>
        <p>Nothing here is an individual financial recommendation.</p>
      </aside>
    </section>
  );
}

export default function App({
  pathname,
  initialData = null,
  initialEvents = null,
  initialSummaries = null,
}: { pathname?: string; initialData?: any; initialEvents?: any; initialSummaries?: any } = {}) {
  const page = resolvePage(
    pathname ??
      (typeof window === "undefined" ? "/" : window.location.pathname),
  );
  const needsData = ["overview", "prices", "economy", "jobs-pay", "housing", "government"].includes(page.id);
  const needsSummaries = ["prices", "economy", "jobs-pay", "housing", "government"].includes(page.id);
  const needsEvents = ["overview", "calendar", "prices", "economy", "jobs-pay", "housing", "government"].includes(page.id);
  const [snapshot, setSnapshot] = useState(() =>
    refreshSnapshot(initialData, needsData ? "loading" : "idle"),
  );
  const [reportSnapshot, setReportSnapshot] = useState(() =>
    refreshSnapshot(null),
  );
  const [aiStatusSnapshot, setAiStatusSnapshot] = useState(() =>
    refreshSnapshot(null),
  );
  const [summarySnapshot, setSummarySnapshot] = useState(() =>
    refreshSnapshot(initialSummaries, needsSummaries ? (initialSummaries ? "success" : "loading") : "idle"),
  );
  const [eventSnapshot, setEventSnapshot] = useState(() =>
    refreshSnapshot(initialEvents, needsEvents ? "loading" : "idle"),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return false;
    return window.matchMedia(NAV_COLLAPSE_QUERY).matches;
  });
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch {
      return false;
    }
  });
  const refreshOwner = useRef<ReturnType<
    typeof createRefreshController
  > | null>(null);
  const eventsOwner = useRef<ReturnType<typeof createRefreshController> | null>(null);
  const summariesOwner = useRef<ReturnType<typeof createRefreshController> | null>(null);
  const header = useRef<HTMLElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const menuWasOpen = useRef(false);
  const menuOpenRef = useRef(false);
  const pendingMenuFocus = useRef<null | "toggle">(null);
  menuOpenRef.current = menuOpen;
  useEffect(() => {
    document.title = documentTitle(page);
    return bindPageNavigation(window, document);
  }, [page.id, page.title]);
  useEffect(() => {
    const media = window.matchMedia(NAV_COLLAPSE_QUERY);
    const apply = () => {
      const nav = document.getElementById("main-navigation");
      const hiding = media.matches && !menuOpenRef.current;
      if (
        hiding &&
        menuFocusAction({
          collapsed: true,
          transition: "none",
          focusInsideNav: Boolean(nav?.contains(document.activeElement)),
          navHidden: true,
        }) === "toggle"
      ) {
        pendingMenuFocus.current = "toggle";
      }
      setNarrow(media.matches);
      if (!media.matches) setMenuOpen(false);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    if (menuOpen)
      return bindMenuDismissal(
        document,
        header.current,
        menuToggle.current,
        () => setMenuOpen(false),
      );
  }, [menuOpen]);
  useEffect(() => {
    const nav = document.getElementById("main-navigation");
    const transition =
      menuOpen === menuWasOpen.current ? "none" : menuOpen ? "open" : "close";
    if (
      menuFocusAction({
        collapsed: narrow,
        transition,
        focusInsideNav: false,
        navHidden: false,
      }) === "first-link"
    ) {
      const link = nav?.querySelector("a");
      if (link instanceof HTMLElement) link.focus({ preventScroll: true });
    } else if (pendingMenuFocus.current === "toggle") {
      menuToggle.current?.focus({ preventScroll: true });
      pendingMenuFocus.current = null;
    }
    menuWasOpen.current = menuOpen;
  }, [menuOpen, narrow]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      /* Optional preference. */
    }
  }, [dark]);
  const refresh = () => refreshOwner.current?.refresh();
  useEffect(() => {
    if (!needsData) return;
    const owner = createRefreshController({
      initialData,
      initialStatus: "loading",
      load: (signal) =>
        loadVerified(import.meta.env.BASE_URL, (url, options) =>
          fetch(url, { ...options, signal }),
        ),
      onState: setSnapshot,
    });
    refreshOwner.current = owner;
    const cleanup = bindRefreshLifecycle(owner, window);
    return () => {
      cleanup();
      if (refreshOwner.current === owner) refreshOwner.current = null;
    };
  }, [needsData]);
  useEffect(() => {
    if (!needsEvents) return;
    const owner = createRefreshController({
      initialData: initialEvents,
      initialStatus: "loading",
      load: (signal) => loadEvents(import.meta.env.BASE_URL, (url, options) =>
        fetch(url, { ...options, signal }),
      ),
      onState: setEventSnapshot,
    });
    eventsOwner.current = owner;
    const cleanup = bindRefreshLifecycle(owner, window);
    return () => {
      cleanup();
      if (eventsOwner.current === owner) eventsOwner.current = null;
    };
  }, [needsEvents]);
  useEffect(() => {
    if (!needsSummaries) return;
    const owner = createSummaryRefreshController({
      initialData: initialSummaries,
      load: (signal) => loadSummaries(import.meta.env.BASE_URL, (url, options) =>
        fetch(url, { ...options, signal }), signal),
      onState: setSummarySnapshot,
    });
    summariesOwner.current = owner;
    const cleanup = bindRefreshLifecycle(owner, window);
    return () => {
      cleanup();
      if (summariesOwner.current === owner) summariesOwner.current = null;
    };
  }, [needsSummaries]);
  useEffect(() => {
    if (page.id !== "economy") return;
    const owner = createRefreshController({
      load: async (signal) => {
        const response = await fetch(
          `${import.meta.env.BASE_URL}research_report.json`,
          { cache: "no-store", signal },
        );
        if (!response.ok) throw new Error("Commentary unavailable");
        return response.json();
      },
      // Commentary failure stays on this snapshot and never changes verified figures.
      onState: setReportSnapshot,
    });
    return bindRefreshLifecycle(owner, window);
  }, [page.id]);
  useEffect(() => {
    if (page.id !== "economy") return;
    // Optional job status: any failure to load it leaves the page unchanged.
    const owner = createRefreshController({
      load: (signal) => loadAiStatus(import.meta.env.BASE_URL, (url, options) =>
        fetch(url, { ...options, signal }), signal),
      onState: setAiStatusSnapshot,
    });
    return bindRefreshLifecycle(owner, window);
  }, [page.id]);
  const { loading, error, data } = refreshView(snapshot);
  const reports = useMemo(
    () => (reportSnapshot.data ? legacyReports(reportSnapshot.data) : []),
    [reportSnapshot.data],
  );
  const reportTime = reportSnapshot.data?.metadata?.generated_at ?? null;
  const aiStatus = aiStatusSnapshot.data ?? null;
  const stats = { data, error, loading, refresh };
  const eventView = refreshView(eventSnapshot);
  const summaryView = refreshView(summarySnapshot);
  const summaryProps = {
    data: summaryView.data,
    metrics: data?.metrics,
    loading: summaryView.loading,
    error: summaryView.error,
    refresh: () => summariesOwner.current?.refresh(),
  };
  const refreshEvents = () => eventsOwner.current?.refresh();
  const eventProps = { payload: eventView.data, error: eventView.error, loading: eventView.loading, refresh: refreshEvents };
  return (
    <div className="fs-root">
      <a className="fs-skip" href="#main-content">
        Skip to main content
      </a>
      <header className="fs-header" ref={header}>
        <div className="fs-header-inner">
          <BrandLink />
          <button
            type="button"
            className="fs-menu-button"
            id="navigation-toggle"
            ref={menuToggle}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
          >
            {menuOpen ? "Close menu" : "Menu"}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          <nav
            id="main-navigation"
            className={menuOpen ? "fs-nav-open" : ""}
            aria-label="Main navigation"
            hidden={narrow && !menuOpen}
          >
            {NAV_PAGES.map((item) => (
              <a
                key={item.id}
                href={item.path}
                aria-current={page.id === item.id ? "page" : undefined}
                onClick={() => {
                  // Hide the menu only when the document stays put. Hiding the
                  // link during a cross-page click can cancel navigation.
                  if (item.path !== window.location.pathname) return;
                  if (
                    menuFocusAction({
                      collapsed: narrow,
                      transition: "close",
                      focusInsideNav: true,
                      navHidden: true,
                    }) === "toggle"
                  ) {
                    pendingMenuFocus.current = "toggle";
                  }
                  setMenuOpen(false);
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <button
            type="button"
            className="fs-icon-button"
            onClick={() => setDark(!dark)}
            aria-label={dark ? "Use light theme" : "Use dark theme"}
          >
            {dark ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
          </button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {page.id === "overview" && (
          <>
            <Overview {...stats} />
            <EventList {...eventProps} limit={5} compact />
            <section className="fs-container fs-section">
              <a className="fs-link" href="/economy#ai-summary">
                Read the AI summary of the latest Bank of England reports <ArrowRight size={16} aria-hidden="true" />
              </a>
            </section>
          </>
        )}
        {page.id === "calendar" && <><PageHeading eyebrow="Official dates" title={page.title}>Known release and meeting dates from official sources.</PageHeading><EventList {...eventProps} /></>}
        {page.id === "prices" && (
          <>
            <PageHeading eyebrow="Prices & everyday costs" title={page.title}>
              The pace of price rises matters. So does what your income can buy.
            </PageHeading>
            <PricesPage {...stats} topics={topics} HistoricalTrendCard={HistoricalTrendCard} />
            <EventList {...eventProps} indicatorIds={["uk.cpi.annual_rate", "uk.cpih.annual_rate", "uk.road_fuel.unleaded_petrol_price", "uk.road_fuel.diesel_price", "uk.energy_price_cap.typical_dual_fuel_bill"]} compact />
            <ReleaseSummaries subject="prices" {...summaryProps} />
          </>
        )}
        {page.id === "economy" && (
          <>
            <PageHeading eyebrow="The wider economy" title={page.title}>
              Understand the figures behind borrowing, saving and economic
              activity.
            </PageHeading>
            <EconomyPage
              {...stats}
              topics={topics}
              reports={reports}
              reportTime={reportTime}
              aiStatus={aiStatus}
              releaseExplanations={<ReleaseSummaries embedded subject="economy" {...summaryProps} />}
              HistoricalTrendCard={HistoricalTrendCard}
            />
            <EventList {...eventProps} indicatorIds={["uk.bank_rate.daily", "uk.gdp.monthly_growth"]} compact />
            <Publications reports={reports} reportTime={reportTime} />
          </>
        )}
        {page.id === "jobs-pay" && (
          <>
            <PageHeading eyebrow="Jobs & Pay" title={page.title}>
              Official figures on pay and unemployment.
            </PageHeading>
            <JobsPayPage {...stats} topics={topics} HistoricalTrendCard={HistoricalTrendCard} />
            <EventList {...eventProps} indicatorIds={["uk.regular_pay.nominal_annual_growth", "uk.regular_pay.real_annual_growth", "uk.unemployment.rate"]} compact />
            <ReleaseSummaries subject="jobs-pay" {...summaryProps} />
          </>
        )}
        {page.id === "housing" && <><PageHeading eyebrow="Housing costs" title="Housing costs">Official UK-wide private rents and house prices, with levels and annual changes shown separately.</PageHeading><HousingPage {...stats} HistoricalTrendCard={HistoricalTrendCard} /><EventList {...eventProps} indicatorIds={["uk.private_rent.annual_growth", "uk.private_rent.monthly_level", "uk.house_price.average_level", "uk.house_price.annual_change"]} compact /><ReleaseSummaries subject="housing" {...summaryProps} /></>}
        {page.id === "government" && (
          <>
            <PageHeading eyebrow="Government & Budget" title={page.title}>
              What to look for in announcements about taxes, public services and
              the wider outlook.
            </PageHeading>
            <GovernmentPage {...stats} topics={topics} HistoricalTrendCard={HistoricalTrendCard} />
            <EventList {...eventProps} indicatorIds={["uk.public_debt.net_debt_gdp"]} compact />
            <ReleaseSummaries subject="government" {...summaryProps} />
          </>
        )}
        {page.id === "about" && (
          <>
            <PageHeading title="About">
              finstats UK gives residents a clear view of the UK economy, using
              official statistics and plain-English context.
            </PageHeading>
            <About />
          </>
        )}
        {page.id === "sources" && (
          <>
            <PageHeading
              eyebrow="Clear sources, honest limits"
              title={page.title}
            >
              See where the numbers come from and how we keep facts, forecasts
              and explanations distinct.
            </PageHeading>
            <Sources />
          </>
        )}
        {page.id === "missing" && (
          <>
            <PageHeading
              eyebrow="Let’s get you back on track"
              title="Page not found"
            >
              This address does not match a finstats UK page.
            </PageHeading>
            <section className="fs-container fs-section">
              <a className="fs-button" href="/">
                Go to the overview <ArrowRight size={16} aria-hidden="true" />
              </a>
            </section>
          </>
        )}
      </main>
      <p className="fs-container fs-caption">
        General economic information, not individual financial advice.
      </p>
      <footer className="fs-footer fs-container">
        <BrandLink />
        <p>Official statistics with plain-English context.</p>
        <nav className="fs-footer-nav" aria-label="Footer">
          {FOOTER_PAGES.map((item) => (
            <a
              key={item.id}
              href={item.path}
              aria-current={page.id === item.id ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </footer>
    </div>
  );
}
