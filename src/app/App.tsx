import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  Landmark,
  Moon,
  RefreshCw,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  Sun,
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
  reportLabel,
  loadVerified,
  percent,
  previousReading,
} from "./data/verified.mjs";
import { PAGES, resolvePage } from "./data/pages.mjs";
import {
  createRefreshController,
  bindRefreshLifecycle,
  refreshSnapshot,
  refreshView,
} from "./data/refresh.mjs";
import { bindPageNavigation, bindMenuDismissal } from "./data/interactions.mjs";
import "../styles/friendly.css";

const topics = {
  cpih: {
    eyebrow: "Cost of living",
    title: "How fast are prices rising?",
    short: "Inflation",
    Icon: ShoppingBasket,
    measurement: "CPIH · change over 12 months",
    color: "#b56b43",
    meaning:
      "CPIH measures price changes across everyday goods, services and housing costs. Your own inflation rate depends on what you spend money on.",
    caution:
      "Lower inflation means prices are rising more slowly. It does not usually mean prices are falling.",
  },
  bank_rate: {
    eyebrow: "Borrowing & saving",
    title: "What is Bank Rate?",
    short: "Bank Rate",
    Icon: Landmark,
    measurement: "Bank of England · annual interest rate",
    color: "#277567",
    meaning:
      "Bank Rate influences what lenders charge and what savers earn. Your mortgage or savings rate can differ, and fixed-rate deals usually change when the deal ends.",
    caution:
      "This is a daily observation of the policy rate, not a new MPC announcement.",
  },
  gdp: {
    eyebrow: "Growth & jobs",
    title: "Is the economy growing?",
    short: "Monthly GDP",
    Icon: Sprout,
    measurement: "Real GDP · change from the previous month",
    color: "#6b76b5",
    meaning:
      "GDP measures economic output. Growth can support business activity and jobs, but it does not tell us whether every household is better off.",
    caution:
      "One month can be volatile. Early estimates can change as the ONS receives more information.",
  },
};
const keys = ["cpih", "bank_rate", "gdp"] as const;
function checkedAt(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      }) + " UK time"
    : "Not yet checked";
}
function OfficialLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      className="fs-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children} <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}
function MetricCard({
  metric,
  kind,
  compact = false,
}: {
  metric: any;
  kind: keyof typeof topics;
  compact?: boolean;
}) {
  const topic = topics[kind];
  const status = freshness(metric);
  const previous = previousReading(metric);
  const delta = previous
    ? Number(metric.latest.value) - Number(previous.value)
    : null;
  return (
    <article
      className={`fs-stat ${compact ? "fs-stat-compact" : ""}`}
      style={{ "--topic": topic.color } as React.CSSProperties}
    >
      <div className="fs-stat-top">
        <span className="fs-eyebrow">
          <topic.Icon size={17} aria-hidden="true" />
          {topic.eyebrow}
        </span>
        <span className="fs-mini-label">Official data</span>
      </div>
      <h3>{topic.title}</h3>
      <p className="fs-number">{percent(metric.latest?.value)}</p>
      <p className="fs-measure">{topic.measurement}</p>
      <p className="fs-period">
        {metric.latest ? (
          <>
            {kind === "bank_rate" ? "Observed" : "For"}{" "}
            <strong>{formatPeriod(metric.latest.period)}</strong>
          </>
        ) : (
          "A verified reading is not available yet."
        )}
      </p>
      <div className="fs-comparison">
        {previous && delta !== null ? (
          <>
            <span>
              {Math.abs(delta) < 0.00001
                ? "Unchanged"
                : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(2).replace(/0$/, "")} percentage points`}
            </span>{" "}
            compared with {formatPeriod(previous.period)}
          </>
        ) : (
          "A directly comparable previous reading is not available."
        )}
      </div>
      {!compact && <p className="fs-stat-meaning">{topic.meaning}</p>}
      <div className={`fs-fresh fs-fresh-${status.kind}`}>
        <ShieldCheck size={14} aria-hidden="true" />
        {status.label}
      </div>
      <details className="fs-details">
        <summary>
          Where this figure comes from{" "}
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
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
        <p>{topic.caution}</p>
        <OfficialLink href={metric.definition.source_url}>
          View the official series
        </OfficialLink>
      </details>
    </article>
  );
}

function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fs-container fs-page-heading">
      <p className="fs-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{children}</p>
    </section>
  );
}

function Statistics({
  data,
  kinds,
  loading,
  error,
  refresh,
  compact = false,
}: any) {
  return (
    <section
      className="fs-container fs-section"
      id="figures"
      aria-labelledby="figures-title"
    >
      <div className="fs-section-heading">
        <div>
          <p className="fs-eyebrow">The latest verified figures</p>
          <h2 id="figures-title">Start with the numbers</h2>
          <p>
            Each figure describes its own month or day. Open its source details
            to check.
          </p>
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
                compact={compact}
              />
            ))}
          </div>
          <p className="fs-caption">
            FinStats export updated {checkedAt(data.published_at)}. Figures can
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

function Trends({ data, kinds }: any) {
  return (
    <section className="fs-container fs-section" id="trends">
      <div className="fs-section-heading">
        <div>
          <p className="fs-eyebrow">A little perspective</p>
          <h2>Look at the trend</h2>
          <p>One reading is only part of the story.</p>
        </div>
      </div>
      {data ? (
        <Suspense fallback={<p role="status">Loading charts…</p>}>
          <div className={`fs-chart-grid fs-chart-count-${kinds.length}`}>
            {kinds.map((kind: keyof typeof topics) => (
              <HistoricalTrendCard
                key={kind}
                title={topics[kind].measurement}
                label={topics[kind].short}
                color={topics[kind].color}
                data={chartPoints(data.metrics[kind])}
                curve={kind === "bank_rate" ? "stepAfter" : "linear"}
              />
            ))}
          </div>
        </Suspense>
      ) : (
        <p>Charts will appear when verified figures are available.</p>
      )}
      <p className="fs-caption">
        Latest revised values. Cards and charts share the same official
        snapshot; gaps stay visible.
      </p>
    </section>
  );
}

function Overview({ data }: any) {
  const inflation = data?.metrics.cpih.latest;
  const gdp = data?.metrics.gdp.latest;
  const intro =
    inflation && gdp
      ? `Prices were ${Number(inflation.value) > 0 ? "higher than" : Number(inflation.value) < 0 ? "lower than" : "unchanged from"} a year earlier in ${formatPeriod(inflation.period)}. Economic output ${Number(gdp.value) > 0 ? "grew" : Number(gdp.value) < 0 ? "fell" : "was unchanged"} in ${formatPeriod(gdp.period)}.`
      : "See what is happening to prices, borrowing and growth, then explore what it could mean for you.";
  return (
    <section className="fs-hero fs-container" id="overview">
      <div className="fs-hero-copy">
        <p className="fs-eyebrow">
          <span className="fs-dot" />
          The UK economy, made understandable
        </p>
        <h1>
          Big economic news.
          <br />
          <span>Everyday meaning.</span>
        </h1>
        <p className="fs-hero-description">
          A clear starting point for understanding prices, interest rates and
          the decisions that reach your pocket.
        </p>
        <a className="fs-button" href="#figures">
          See the latest figures <ArrowDown size={17} />
        </a>
      </div>
      <aside className="fs-hero-note">
        <span className="fs-note-icon">
          <Landmark size={26} />
        </span>
        <p className="fs-eyebrow">The quick read</p>
        <p>{intro}</p>
        <div>
          <Check size={15} />
          Figures from the ONS & Bank of England
        </div>
        <div>
          <Check size={15} />
          Dates and sources you can inspect
        </div>
        <a href="/economy#interest-rates">
          How do interest rates reach my pocket? <ArrowRight size={16} />
        </a>
      </aside>
    </section>
  );
}

function Explore() {
  return (
    <section className="fs-everyday" id="everyday">
      <div className="fs-container">
        <div className="fs-section-heading">
          <div>
            <p className="fs-eyebrow">Follow what matters to you</p>
            <h2>Your everyday economy</h2>
            <p>
              Choose a subject. Find the figures, a plain-English guide and the
              wider trend.
            </p>
          </div>
        </div>
        <div className="fs-explainer-grid fs-topic-links">
          <a href="/prices">
            <span className="fs-guide-icon fs-peach">
              <ShoppingBasket />
            </span>
            <h3>Prices & everyday costs</h3>
            <p>
              Is inflation easing? Why can the shopping bill still be rising?
            </p>
            <span className="fs-link">
              Explore prices <ArrowRight size={16} />
            </span>
          </a>
          <a href="/economy">
            <span className="fs-guide-icon fs-sage">
              <Landmark />
            </span>
            <h3>Borrowing, saving & growth</h3>
            <p>
              How interest rates and economic activity can affect households and
              businesses.
            </p>
            <span className="fs-link">
              Explore the economy <ArrowRight size={16} />
            </span>
          </a>
          <a href="/government-budget">
            <span className="fs-guide-icon fs-lilac">£</span>
            <h3>Tax & public spending</h3>
            <p>
              Understand Budget headlines, who is affected and when changes
              begin.
            </p>
            <span className="fs-link">
              Explore government decisions <ArrowRight size={16} />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

function PriceGuide({ data }: any) {
  const inflation = data?.metrics.cpih.latest;
  return (
    <section className="fs-everyday">
      <div className="fs-container fs-reading-grid">
        <article>
          <p className="fs-eyebrow">What it means for you</p>
          <h2>What inflation means for your shopping bill</h2>
          <p>
            {inflation
              ? `Annual CPIH inflation was ${percent(inflation.value)} in ${formatPeriod(inflation.period)}. ${Number(inflation.value) > 0 ? "Average prices were higher than a year earlier." : Number(inflation.value) < 0 ? "Average prices were lower than a year earlier." : "Average prices were unchanged from a year earlier."}`
              : "Inflation measures how average prices change over time."}{" "}
            Your own experience depends on what you buy.
          </p>
          <p>
            When inflation falls but stays above zero, prices are still rising,
            just more slowly. Falling inflation does not usually mean your
            shopping bill falls.
          </p>
          <p>
            Pay and benefits matter too: if your income rises more slowly than
            the prices you face, it buys less.
          </p>
          <OfficialLink href="https://www.ons.gov.uk/economy/inflationandpriceindices">
            Read the official inflation releases
          </OfficialLink>
        </article>
        <aside className="fs-context-card">
          <h3>What does CPIH mean?</h3>
          <p>
            The Consumer Prices Index including owner occupiers’ housing costs
            tracks a broad basket of goods, services and housing costs. It is an
            average, not every household’s inflation rate.
          </p>
          <p>
            The Bank of England’s 2% target applies to a different measure, CPI.
            Don’t compare this CPIH reading directly with that target.
          </p>
          <p className="fs-caption">
            Food, fuel and energy breakdowns are not yet part of our verified
            dataset. This page does not claim to measure your own bills.
          </p>
        </aside>
      </div>
    </section>
  );
}

function InterestGuide() {
  return (
    <section className="fs-decisions" id="interest-rates">
      <div className="fs-container fs-reading-grid">
        <article>
          <p className="fs-eyebrow">
            The decisions behind borrowing and saving
          </p>
          <h2>Who sets interest rates?</h2>
          <p>
            The Bank of England’s Monetary Policy Committee, or MPC, sets Bank
            Rate to help keep inflation low and stable. That rate influences
            mortgages, loans and savings, but your deal can have a different
            rate.
          </p>
          <p>
            A change can reach variable-rate borrowers sooner. Fixed mortgage
            payments usually stay the same during the fixed period, but the cost
            can change when the deal ends. Savings providers do not all pass on
            changes in the same way.
          </p>
          <OfficialLink href="https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate">
            Read the latest official rate decision
          </OfficialLink>
        </article>
        <aside className="fs-context-card">
          <h3>How to read a rate decision</h3>
          <ul>
            <li>
              <strong>The decision:</strong> did the rate change?
            </li>
            <li>
              <strong>The votes:</strong> did members agree, and why?
            </li>
            <li>
              <strong>The outlook:</strong> what evidence could change the next
              decision?
            </li>
          </ul>
          <p>
            A forecast or a voting split is not a promise about the next
            meeting. Effects on spending and inflation take time.
          </p>
          <p className="fs-caption">
            This is a general guide. The daily Bank Rate observation above is
            not a new policy announcement.
          </p>
        </aside>
      </div>
    </section>
  );
}

function GrowthGuide() {
  return (
    <section
      className="fs-container fs-section fs-reading-grid"
      id="work-and-businesses"
    >
      <article>
        <p className="fs-eyebrow">Growth and everyday life</p>
        <h2>A growing economy does not lift every household equally</h2>
        <p>
          Gross domestic product, or GDP, measures economic output. Growth can
          support hiring, investment and pay, but total GDP does not tell us how
          an individual worker or household is doing.
        </p>
        <p>
          One month can be volatile. Look at the broader trend and remember that
          early estimates can be revised as more information arrives.
        </p>
        <OfficialLink href="https://www.ons.gov.uk/economy/grossdomesticproductgdp">
          Explore the GDP releases
        </OfficialLink>
      </article>
      <aside className="fs-context-card">
        <h3>What about jobs, pay and housing?</h3>
        <p>
          They matter to the bigger picture. We are building verified coverage
          before adding dedicated pages for those subjects.
        </p>
        <p>
          For now, growth and Bank Rate provide context, not a substitute for
          employment, wage, rent or house-price figures.
        </p>
        <a className="fs-link" href="/prices">
          See what prices mean for purchasing power <ArrowRight size={16} />
        </a>
      </aside>
    </section>
  );
}

function GovernmentGuide() {
  return (
    <>
      <section className="fs-container fs-section fs-reading-grid">
        <article>
          <p className="fs-eyebrow">What to look for</p>
          <h2>Start with who is affected — and when</h2>
          <p>
            The Chancellor’s Budget sets out tax and spending plans. Parliament
            scrutinises the measures. A headline announcement may apply months
            or years later, and some plans need legislation.
          </p>
          <p>
            Ask which tax, benefit or service changes; which people or
            businesses it covers; and the date it takes effect. A tax-rate
            change and a frozen tax threshold can affect take-home pay in
            different ways.
          </p>
          <OfficialLink href="https://www.parliament.uk/about/how/role/check-and-approve-government-spending-and-taxation/the-budget-and-parliament/">
            How the Budget becomes policy
          </OfficialLink>
        </article>
        <aside className="fs-context-card">
          <h3>Three things to keep separate</h3>
          <ul>
            <li>
              <strong>An announcement:</strong> what the government says it
              plans to do.
            </li>
            <li>
              <strong>A measure in force:</strong> the rules that actually
              apply, and from when.
            </li>
            <li>
              <strong>A forecast:</strong> what might happen under stated
              assumptions.
            </li>
          </ul>
          <p>
            Political claims are not independent evidence of an economic
            outcome.
          </p>
        </aside>
      </section>
      <section className="fs-decisions">
        <div className="fs-container fs-reading-grid">
          <article>
            <p className="fs-eyebrow">Checking the wider picture</p>
            <h2>What do the independent forecasts say?</h2>
            <p>
              The Office for Budget Responsibility, or OBR, assesses the
              economic and public-finance outlook. Its forecasts help put
              government plans in context, but depend on assumptions about
              growth, inflation, interest rates and policy.
            </p>
            <p>
              Forecasts can change. Compare the assumptions and uncertainty, as
              well as the headline borrowing or debt numbers.
            </p>
            <OfficialLink href="https://obr.uk/efo/">
              Read the Economic and Fiscal Outlook
            </OfficialLink>
          </article>
          <aside className="fs-context-card">
            <h3>Latest Budget coverage</h3>
            <p>
              Source-checked summaries of individual Budget measures and OBR
              forecasts are not available here yet.
            </p>
            <p>
              This page explains how to read those announcements. It does not
              claim that a particular tax or benefit has just changed.
            </p>
            <OfficialLink href="https://www.gov.uk/government/organisations/hm-treasury">
              Visit HM Treasury
            </OfficialLink>
          </aside>
        </div>
      </section>
    </>
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
            Official publications and clearly labelled earlier AI commentary.
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
          Government Budgets & OBR forecasts <ArrowRight size={16} />
        </a>
        <OfficialLink href="https://obr.uk/">
          OBR forecasts & analysis
        </OfficialLink>
      </div>
      <details className="fs-archive">
        <summary>
          Earlier AI report summaries{" "}
          <span>
            {reports.length
              ? `${reports.length} saved summaries`
              : "Currently unavailable"}
          </span>
          <ChevronDown size={18} />
        </summary>
        <div className="fs-archive-body">
          <p className="fs-alert">
            Archived AI commentary
            {reportTime ? `, generated ${checkedAt(reportTime)}` : ""}. These
            summaries have not been checked against the verified figures above.
            Use the original publication to confirm facts, dates and forecasts.
          </p>
          {reports.map((report: any) => (
            <article key={report.key}>
              <p className="fs-eyebrow">
                Earlier AI summary · {formatPeriod(report.report_date)}
              </p>
              <h3>{reportLabel(report)}</h3>
              <p>{report.summary}</p>
              <OfficialLink href={report.source}>
                Original publication
              </OfficialLink>
            </article>
          ))}
          {!reports.length && (
            <p>
              Earlier summaries could not be loaded. Verified figures and
              official links remain available.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

function Sources() {
  return (
    <section className="fs-container fs-section fs-reading-grid">
      <article>
        <h2>Official statistics supply the numbers</h2>
        <p>
          FinStats downloads structured data from the ONS and Bank of England.
          We check the series definition, unit and reference period, keep source
          evidence and publish a consistent snapshot independently of AI.
        </p>
        <p>
          Every figure’s source disclosure shows the series, official
          publication date where supplied and last successful check. A
          collection time is not a new official release.
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
}: { pathname?: string; initialData?: any } = {}) {
  const page = resolvePage(
    pathname ??
      (typeof window === "undefined" ? "/" : window.location.pathname),
  );
  const needsData = ["overview", "prices", "economy"].includes(page.id);
  const [snapshot, setSnapshot] = useState(() =>
    refreshSnapshot(initialData, needsData ? "loading" : "idle"),
  );
  const [reportSnapshot, setReportSnapshot] = useState(() =>
    refreshSnapshot(null),
  );
  const [menuOpen, setMenuOpen] = useState(false);
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
  const header = useRef<HTMLElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.title = `${page.title} | FinStats`;
    return bindPageNavigation(window, document);
  }, [page.id]);
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
  const { loading, error, data } = refreshView(snapshot);
  const reports = useMemo(
    () => (reportSnapshot.data ? legacyReports(reportSnapshot.data) : []),
    [reportSnapshot.data],
  );
  const reportTime = reportSnapshot.data?.metadata?.generated_at ?? null;
  const stats = { data, error, loading, refresh };
  return (
    <div className="fs-root">
      <a className="fs-skip" href="#main-content">
        Skip to main content
      </a>
      <header className="fs-header" ref={header}>
        <div className="fs-header-inner">
          <a href="/" className="fs-brand" aria-label="FinStats home">
            <span className="fs-brand-mark">
              <Sprout size={23} />
            </span>
            finstats<span className="fs-brand-dot">.</span>
          </a>
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
          >
            {PAGES.map((item) => (
              <a
                key={item.id}
                href={item.path}
                aria-current={page.id === item.id ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <button
            className="fs-icon-button"
            onClick={() => setDark(!dark)}
            aria-label={dark ? "Use light theme" : "Use dark theme"}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {page.id === "overview" && (
          <>
            <Overview data={data} />
            <Statistics {...stats} kinds={keys} compact />
            <Explore />
          </>
        )}
        {page.id === "prices" && (
          <>
            <PageHeading eyebrow="Prices & everyday costs" title={page.title}>
              The pace of price rises matters. So does what your income can buy.
            </PageHeading>
            <Statistics {...stats} kinds={["cpih"]} />
            <PriceGuide data={data} />
            <Trends data={data} kinds={["cpih"]} />
          </>
        )}
        {page.id === "economy" && (
          <>
            <PageHeading eyebrow="The wider economy" title={page.title}>
              Understand the figures behind borrowing, saving and economic
              activity.
            </PageHeading>
            <Statistics {...stats} kinds={["bank_rate", "gdp"]} />
            <InterestGuide />
            <GrowthGuide />
            <Trends data={data} kinds={["bank_rate", "gdp"]} />
            <Publications reports={reports} reportTime={reportTime} />
          </>
        )}
        {page.id === "government" && (
          <>
            <PageHeading eyebrow="Government & Budget" title={page.title}>
              What to look for in announcements about taxes, public services and
              the wider outlook.
            </PageHeading>
            <GovernmentGuide />
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
              This address does not match a FinStats page.
            </PageHeading>
            <section className="fs-container fs-section">
              <a className="fs-button" href="/">
                Go to the overview <ArrowRight size={16} />
              </a>
            </section>
          </>
        )}
      </main>
      <p className="fs-container fs-caption">
        General economic information, not individual financial advice.
      </p>
      <footer className="fs-footer fs-container">
        <a className="fs-brand" href="/">
          finstats<span className="fs-brand-dot">.</span>
        </a>
        <p>The UK economy, explained.</p>
        <a className="fs-link" href="/sources">
          Sources & methodology
        </a>
      </footer>
    </div>
  );
}
