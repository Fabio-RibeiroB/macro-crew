import { lazy, Suspense, useEffect, useState } from "react";
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
  loadVerified,
  percent,
  previousReading,
} from "./data/verified.mjs";
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
}: {
  metric: any;
  kind: keyof typeof topics;
}) {
  const topic = topics[kind];
  const status = freshness(metric);
  const previous = previousReading(metric);
  const delta = previous
    ? Number(metric.latest.value) - Number(previous.value)
    : null;
  return (
    <article
      className="fs-stat"
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
        {kind === "bank_rate" ? "Observed" : "For"}{" "}
        <strong>{formatPeriod(metric.latest?.period)}</strong>
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
      <p className="fs-stat-meaning">{topic.meaning}</p>
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

export default function App() {
  const [data, setData] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [reportTime, setReportTime] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      /* Theme still works without storage. */
    }
  }, [dark]);
  const refresh = async () => {
    setLoading(true);
    try {
      const next = await loadVerified(import.meta.env.BASE_URL);
      setData(next);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The latest figures could not be checked",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}research_report.json`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Commentary unavailable");
        return r.json();
      })
      .then((value) => {
        setReports(legacyReports(value));
        setReportTime(value?.metadata?.generated_at ?? null);
      })
      .catch(() => {});
    const timer = window.setInterval(() => {
      void refresh();
    }, 5 * 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);
  const inflation = data?.metrics.cpih.latest;
  const gdp = data?.metrics.gdp.latest;
  const intro =
    inflation && gdp
      ? `Prices were ${Number(inflation.value) > 0 ? "higher than" : Number(inflation.value) < 0 ? "lower than" : "unchanged from"} a year earlier in ${formatPeriod(inflation.period)}, while economic output ${Number(gdp.value) > 0 ? "grew" : Number(gdp.value) < 0 ? "fell" : "was unchanged"} in ${formatPeriod(gdp.period)}. Reference periods and publication dates are shown below.`
      : "Start with the big picture, then explore what the numbers and policy decisions could mean for everyday life.";
  return (
    <div className="fs-root">
      <a className="fs-skip" href="#overview">
        Skip to the economy overview
      </a>
      <header className="fs-header">
        <div className="fs-header-inner">
          <a href="#" className="fs-brand" aria-label="FinStats home">
            <span className="fs-brand-mark">
              <Sprout size={23} />
            </span>
            finstats<span className="fs-brand-dot">.</span>
          </a>
          <nav aria-label="Main navigation">
            <a href="#overview">Overview</a>
            <a href="#everyday">Everyday life</a>
            <a href="#decisions">MPC & Budgets</a>
            <a href="#sources">Sources</a>
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
      <main>
        <section className="fs-hero fs-container" id="overview">
          <div className="fs-hero-copy">
            <p className="fs-eyebrow">
              <span className="fs-dot" /> The UK economy, made understandable
            </p>
            <h1>
              Big economic news.
              <br />
              <span>Everyday meaning.</span>
            </h1>
            <p className="fs-hero-description">
              Prices, interest rates and the decisions behind them. A calmer way
              to understand what’s happening — and why it matters to you.
            </p>
            <a className="fs-button" href="#figures">
              Start with the latest figures <ArrowDown size={17} />
            </a>
          </div>
          <aside className="fs-hero-note">
            <span className="fs-note-icon">
              <Landmark size={26} />
            </span>
            <p className="fs-eyebrow">Your two-minute overview</p>
            <p>{intro}</p>
            <div>
              <Check size={15} /> Figures from the ONS & Bank of England
            </div>
            <div>
              <Check size={15} /> Sources and dates you can inspect
            </div>
            <a href="#decisions">
              How do decisions reach my pocket? <ArrowRight size={16} />
            </a>
          </aside>
        </section>
        <section className="fs-container fs-section" id="figures">
          <div className="fs-section-heading">
            <div>
              <p className="fs-eyebrow">The big picture</p>
              <h2>Three figures to start with</h2>
              <p>
                What they measure, when they apply, and what they leave out.
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
              {error}.{" "}
              {data
                ? "The last successfully loaded figures remain below."
                : "We’ll show figures once their official export can be verified. The guides below are still available."}
            </div>
          )}
          {data ? (
            <>
              <div className="fs-stat-grid">
                {keys.map((key) => (
                  <MetricCard key={key} kind={key} metric={data.metrics[key]} />
                ))}
              </div>
              <p className="fs-caption">
                FinStats export updated {checkedAt(data.published_at)}. Each
                card shows its own reference period and source check. Figures
                can be revised.
              </p>
            </>
          ) : (
            !error && (
              <div className="fs-loading" role="status">
                Checking the official-data export…
              </div>
            )
          )}
        </section>
        <section className="fs-everyday" id="everyday">
          <div className="fs-container">
            <div className="fs-section-heading">
              <div>
                <p className="fs-eyebrow">Your everyday economy</p>
                <h2>From headlines to your household</h2>
                <p>
                  Useful context, without pretending everyone is affected in the
                  same way.
                </p>
              </div>
            </div>
            <div className="fs-explainer-grid">
              <article>
                <span className="fs-guide-icon fs-peach">
                  <ShoppingBasket />
                </span>
                <h3>At the checkout</h3>
                <p>
                  {inflation
                    ? Number(inflation.value) > 0
                      ? `Annual CPIH inflation of ${percent(inflation.value)} means average prices were higher than a year before. It says how fast prices changed, not how expensive your own basket is.`
                      : `Annual CPIH inflation was ${percent(inflation.value)}. This is an average across goods, services and housing costs, not a reading of your own shopping basket.`
                    : "Inflation measures the change in average prices over time. Your experience depends on your spending."}
                </p>
                <p className="fs-takeaway">
                  When inflation falls but stays above zero, prices are still
                  rising. Pay growth matters for what you can afford.
                </p>
                <OfficialLink href="https://www.ons.gov.uk/economy/inflationandpriceindices">
                  About the inflation figures
                </OfficialLink>
              </article>
              <article>
                <span className="fs-guide-icon fs-sage">
                  <Landmark />
                </span>
                <h3>For borrowers and savers</h3>
                <p>
                  The Bank’s rate influences mortgages, loans and savings. A
                  change can reach variable-rate deals sooner than fixed deals.
                  Fixed mortgage borrowers may feel it most when they refinance.
                </p>
                <p className="fs-takeaway">
                  An MPC decision does not change every household’s payments on
                  the same day.
                </p>
                <OfficialLink href="https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate">
                  How Bank Rate works
                </OfficialLink>
              </article>
              <article>
                <span className="fs-guide-icon fs-lilac">
                  <Sprout />
                </span>
                <h3>For work and businesses</h3>
                <p>
                  Growth can create room for hiring, investment and pay rises.
                  But GDP is a measure of total output, not a promise about an
                  individual job or household income.
                </p>
                <p className="fs-takeaway">
                  Look at the trend. One small monthly change cannot tell the
                  whole story.
                </p>
                <OfficialLink href="https://www.ons.gov.uk/economy/grossdomesticproductgdp">
                  Explore the GDP releases
                </OfficialLink>
              </article>
            </div>
            <p className="fs-caption">
              These are general explanations of economic mechanisms, not
              individual financial recommendations.
            </p>
          </div>
        </section>
        <section className="fs-container fs-section" id="trends">
          <div className="fs-section-heading">
            <div>
              <p className="fs-eyebrow">A little perspective</p>
              <h2>The trend matters more than a headline</h2>
              <p>
                Latest revised values, plotted by the month or day they
                describe.
              </p>
            </div>
          </div>
          {data ? (
            <Suspense fallback={<p>Loading charts…</p>}>
              <div className="fs-chart-grid">
                {keys.map((key) => (
                  <HistoricalTrendCard
                    key={key}
                    title={topics[key].measurement}
                    label={topics[key].short}
                    color={topics[key].color}
                    data={chartPoints(data.metrics[key])}
                    curve={key === "bank_rate" ? "stepAfter" : "linear"}
                  />
                ))}
              </div>
            </Suspense>
          ) : (
            <p>Charts will appear when verified figures are available.</p>
          )}
          <p className="fs-caption">
            Cards and charts use the same official source snapshot. Gaps are
            left visible; Bank Rate is shown as a step line. CPIH is not the CPI
            measure used for the Bank’s 2% target.
          </p>
        </section>
        <section className="fs-decisions" id="decisions">
          <div className="fs-container">
            <div className="fs-section-heading">
              <div>
                <p className="fs-eyebrow">The decisions behind the numbers</p>
                <h2>Who decides what — and why should I care?</h2>
                <p>
                  Two different sets of decisions can affect your household in
                  different ways.
                </p>
              </div>
            </div>
            <div className="fs-policy-grid">
              <article className="fs-policy-card">
                <div className="fs-policy-top">
                  <span className="fs-mini-label">Bank of England</span>
                  <Landmark size={26} />
                </div>
                <h3>The MPC: interest rates</h3>
                <p className="fs-policy-intro">
                  The Monetary Policy Committee sets Bank Rate to help keep
                  inflation low and stable.
                </p>
                <dl>
                  <div>
                    <dt>What to look for</dt>
                    <dd>
                      The rate decision, how members voted, their reasons and
                      what could change their view.
                    </dd>
                  </div>
                  <div>
                    <dt>How it reaches you</dt>
                    <dd>
                      Through borrowing costs, savings returns and spending
                      across the economy. Effects take time and differ between
                      households.
                    </dd>
                  </div>
                  <div>
                    <dt>What remains uncertain</dt>
                    <dd>
                      Future rate decisions depend on the evidence. A forecast
                      or a voting split is not a promise about the next meeting.
                    </dd>
                  </div>
                </dl>
                <OfficialLink href="https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate">
                  Read the latest official decision
                </OfficialLink>
              </article>
              <article className="fs-policy-card">
                <div className="fs-policy-top">
                  <span className="fs-mini-label">Government & Parliament</span>
                  <span className="fs-budget-icon">£</span>
                </div>
                <h3>The Budget: tax & spending</h3>
                <p className="fs-policy-intro">
                  The Chancellor sets out tax and spending plans. Parliament
                  scrutinises the measures; the OBR provides independent
                  forecasts.
                </p>
                <dl>
                  <div>
                    <dt>What to look for</dt>
                    <dd>
                      Which taxes or services change, who is affected and when
                      each measure takes effect.
                    </dd>
                  </div>
                  <div>
                    <dt>How it reaches you</dt>
                    <dd>
                      Through take-home pay, benefits, public services and
                      business costs. An announcement date may differ from its
                      start date.
                    </dd>
                  </div>
                  <div>
                    <dt>What remains uncertain</dt>
                    <dd>
                      Plans, legislation and forecasts are different things.
                      Economic forecasts depend on assumptions and can be
                      revised.
                    </dd>
                  </div>
                </dl>
                <OfficialLink href="https://www.parliament.uk/about/how/role/check-and-approve-government-spending-and-taxation/the-budget-and-parliament/">
                  How the Budget works
                </OfficialLink>
              </article>
            </div>
            <p className="fs-caption">
              This is a guide to understanding announcements. It is not a
              summary of a newly released Budget or MPC meeting.
            </p>
          </div>
        </section>
        <section className="fs-container fs-section" id="reports">
          <div className="fs-section-heading">
            <div>
              <p className="fs-eyebrow">Read a little deeper</p>
              <h2>Official publications & earlier commentary</h2>
              <p>
                Follow the original publications, or browse the AI summaries
                retained from the earlier dashboard.
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
                {reportTime ? `, generated ${checkedAt(reportTime)}` : ""}.
                These summaries have not been checked against the verified
                figures above. Use the official publication to confirm facts,
                dates and forecasts.
              </p>
              {reports.map((report) => (
                <article key={report.key}>
                  <p className="fs-eyebrow">
                    Earlier AI summary · {formatPeriod(report.report_date)}
                  </p>
                  <h3>
                    {report.key === "financial_stability_report"
                      ? "Financial stability commentary"
                      : report.source.includes("/monetary-policy-report/")
                        ? "Monetary Policy Report commentary"
                        : "MPC / monetary policy commentary"}
                  </h3>
                  <p>{report.summary}</p>
                  <OfficialLink href={report.source}>
                    Original source
                  </OfficialLink>
                </article>
              ))}
              {!reports.length && (
                <p>
                  Earlier summaries could not be loaded. The verified statistics
                  and official links remain available.
                </p>
              )}
            </div>
          </details>
        </section>
        <section className="fs-container fs-method" id="sources">
          <div>
            <ShieldCheck size={27} />
            <h2>Know what you’re looking at</h2>
            <p>
              Official statistics supply the numbers. FinStats checks their
              definitions, keeps source snapshots and publishes the figures
              independently of AI commentary.
            </p>
          </div>
          <div className="fs-method-list">
            <p>
              <strong>Observed facts</strong> Figures with a named series,
              reference period and source.
            </p>
            <p>
              <strong>Forecasts</strong> Expectations about the future, not
              outcomes already observed.
            </p>
            <p>
              <strong>Interpretation</strong> An explanation of possible
              meaning, with uncertainty kept in view.
            </p>
            <OfficialLink href="https://github.com/Fabio-RibeiroB/macro-crew/blob/main/docs/architecture-assessment.md">
              Read the methodology
            </OfficialLink>
          </div>
        </section>
      </main>
      <footer className="fs-footer fs-container">
        <a className="fs-brand" href="#">
          finstats<span className="fs-brand-dot">.</span>
        </a>
        <p>The UK economy, explained.</p>
        <span>Official sources. Human questions.</span>
      </footer>
    </div>
  );
}
