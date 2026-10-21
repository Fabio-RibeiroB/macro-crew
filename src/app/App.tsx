import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
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
  reportLabel,
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
const metricValue = (metric: any) => ["GBP_per_month", "GBP"].includes(metric?.definition?.unit)
  ? (metric.latest?.value == null ? "Not available" : `£${Number(metric.latest.value).toLocaleString("en-GB")}`)
  : percent(metric?.latest?.value);
// CPI headlines the inflation card once a verified reading exists; CPIH stays
// the labelled fallback and the supporting measure on the Prices page.
function inflationKind(data: any) {
  return data?.metrics?.cpi?.latest?.value != null ? "cpi" : "cpih";
}
function priceKinds(data: any) {
  return data?.metrics?.cpi?.latest?.value != null
    ? (["cpi", "cpih"] as const)
    : (["cpih"] as const);
}
function priceTrendKinds(data: any) {
  return ["cpi", "cpih"].filter(
    (kind) => (data?.metrics?.[kind]?.history?.length ?? 0) > 0,
  );
}
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
  secondaryMetric,
}: {
  metric: any;
  kind: keyof typeof topics;
  compact?: boolean;
  secondaryMetric?: any;
}) {
  const topic = topics[kind];
  const Tag = compact ? "h2" : "h3";
  if (!metric) {
    return (
      <article className={`fs-stat ${compact ? "fs-stat-compact" : ""}`}>
        <div className="fs-stat-top">
          <Tag>{topic.short}</Tag>
          <topic.Icon size={18} aria-hidden="true" />
        </div>
        <p className="fs-number">Not available</p>
        <p className="fs-measure">{topic.measurement}</p>
        <p className="fs-period">A verified reading is not available yet.</p>
        {kind === "house_price_level" && compact && secondaryMetric?.latest?.value != null && <p className="fs-comparison">Annual change: {percent(secondaryMetric.latest.value)} for {formatPeriod(secondaryMetric.latest.period)}{secondaryMetric.collection_status === "degraded" ? " · update delayed; last verified figure shown" : ""}</p>}
    <a className="fs-stat-link" href={topic.detailHref}>
        See {topic.short.toLowerCase()} details <ArrowRight size={15} aria-hidden="true" />
        </a>
      </article>
    );
  }
  const status = freshness(metric);
  const previous = previousReading(metric);
  const isPay = kind === "regular_pay_nominal_growth";
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
      className={`fs-stat ${compact ? "fs-stat-compact" : ""}`}
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
      {!compact && isPay && (
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
      {!compact && kind === "private_rent_growth" && <p className="fs-comparison">Average monthly rent: {secondaryMetric?.latest?.value == null ? "not available" : `£${Number(secondaryMetric.latest.value).toLocaleString("en-GB")}`} {secondaryMetric?.latest?.period ? `in ${formatPeriod(secondaryMetric.latest.period)}` : ""}{secondaryMetric?.collection_status === "degraded" ? " · update delayed, showing the last verified rent" : ""}</p>}
      {!compact && <div className="fs-comparison">
        {kind === "house_price_level" ? null : kind === "bank_rate" ? rateChange ? (
          <>
            Latest evidenced change: {rateChange.difference > 0 ? "+" : "−"}
            {Math.abs(rateChange.difference).toFixed(2).replace(/\.?0+$/, "")} percentage point
            {Math.abs(rateChange.difference) === 1 ? "" : "s"} at the{" "}
            {formatPeriod(rateChange.period)} observation
          </>
        ) : "The last rate change cannot be established from the available history." : comparisonPoint && delta !== null ? (
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
      {!compact && <p className="fs-stat-meaning">{topic.meaning}</p>}
      <div className={`fs-fresh fs-fresh-${status.kind}`}>
        <ShieldCheck size={14} aria-hidden="true" />
        {status.label}
      </div>
      <details className="fs-details fs-info">
        <summary>
          About {topic.short}{" "}
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        {compact && <p className="fs-stat-meaning">{topic.meaning}</p>}
        {compact && <p>{topic.measurement}</p>}
        {compact && isPay && <p>{secondaryMetric?.latest?.value != null ? <>Official CPIH-adjusted regular pay: {percent(secondaryMetric.latest.value)} for {secondaryWindow ? `${formatPeriod(secondaryWindow.start_month)} to ${formatPeriod(secondaryWindow.end_month)}` : formatPeriod(secondaryMetric.latest.period)} · Great Britain{currentWindow && secondaryWindow && currentWindow.start_month === secondaryWindow.start_month && currentWindow.end_month === secondaryWindow.end_month ? " (same published window)" : "; separate window, not directly matched to nominal pay"}{secondaryMetric.collection_status !== "ok" ? " · update delayed, last verified figure shown" : ""}.</> : "Official CPIH-adjusted regular pay is currently unavailable."}</p>}
        {compact && kind === "private_rent_growth" && <p>Average monthly rent: {secondaryMetric?.latest?.value != null ? `£${Number(secondaryMetric.latest.value).toLocaleString("en-GB")} in ${formatPeriod(secondaryMetric.latest.period)}` : "not available"}{secondaryMetric?.collection_status === "degraded" ? " · update delayed, last verified rent shown" : ""}.</p>}
        {compact && kind === "house_price_level" && <p>Annual change: {secondaryMetric?.latest?.value != null ? `${percent(secondaryMetric.latest.value)} for ${formatPeriod(secondaryMetric.latest.period)}` : "not available"}{secondaryMetric?.collection_status === "degraded" ? " · update delayed, last verified figure shown" : ""}.</p>}
        {compact && kind === "bank_rate" && rateChange && <p>Latest evidenced change: {rateChange.difference > 0 ? "+" : "−"}{Math.abs(rateChange.difference).toFixed(2).replace(/\.?0+$/, "")} percentage point{Math.abs(rateChange.difference) === 1 ? "" : "s"} at the {formatPeriod(rateChange.period)} observation.</p>}
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

function Wages({ data, loading, error, refresh }: any) {
  const nominal = data?.metrics?.regular_pay_nominal_growth;
  const real = data?.metrics?.regular_pay_real_growth;
  const matching = nominal?.latest && real?.latest &&
    nominal.latest.reference?.start_month === real.latest.reference?.start_month &&
    nominal.latest.reference?.end_month === real.latest.reference?.end_month;
  const realPrevious = real?.latest ? previousPublishedWindow(real) : null;
  const realCurrentWindow = referenceWindow(real?.latest);
  const realPreviousWindow = referenceWindow(realPrevious);
  const realDelta = realPrevious && real.latest
    ? Number(real.latest.value) - Number(realPrevious.value)
    : null;
  const relationship = !nominal?.latest || !real?.latest
    ? "A matched nominal and CPIH-adjusted comparison is unavailable because both series need a current verified window."
    : matching
      ? "For the same published three-month window, the ONS also reports regular pay growth adjusted for CPIH. This is the official real-pay series, not an inflation subtraction."
      : "The official CPIH-adjusted regular-pay figure is retained independently. Its window differs from nominal pay, so the figures are not presented as a matched comparison.";
  return (
    <Statistics data={data} kinds={["regular_pay_nominal_growth"]} loading={loading} error={error} refresh={refresh} sectionId="wages" title="Regular pay growth" eyebrow="Official earnings measure" alias="figures">
        <div>
        {real ? (
          <>
            <p>{relationship}</p>
            <div className="fs-stat-grid fs-stat-count-1">
              <article className="fs-stat">
                <div className="fs-stat-top"><h3>Real regular pay growth</h3><TrendingUp size={18} aria-hidden="true" /></div>
                <p className="fs-number">{percent(real.latest?.value)}</p>
                <p className="fs-measure">Official annual growth, adjusted using CPIH</p>
                <p className="fs-period">{real.latest?.reference
                  ? `${formatPeriod(real.latest.reference.start_month)} to ${formatPeriod(real.latest.reference.end_month)}`
                  : "A verified reading is not available yet."}</p>
                {realDelta !== null && realCurrentWindow && realPreviousWindow ? (
                  <p className="fs-comparison">
                    {Math.abs(realDelta) < 0.00001
                      ? "Unchanged (0 percentage points)"
                      : `${realDelta > 0 ? "+" : "−"}${Math.abs(realDelta).toFixed(2).replace(/0$/, "")} percentage points`}
                    {" compared with "}
                    {formatPeriod(realPreviousWindow.start_month)} to {formatPeriod(realPreviousWindow.end_month)}
                    {"; current window "}
                    {formatPeriod(realCurrentWindow.start_month)} to {formatPeriod(realCurrentWindow.end_month)}
                    {". These published three-month windows overlap."}
                  </p>
                ) : (
                  <p className="fs-comparison">A directly comparable previous CPIH-adjusted published window is not available.</p>
                )}
                {matching && <p className="fs-comparison">Secondary context for the same nominal-pay window.</p>}
                <p className="fs-fresh">{freshness(real).label}</p>
                <details className="fs-details fs-info"><summary>Source details <ChevronDown size={15} aria-hidden="true" /></summary>
                  <p>ONS A2FA / LMS · Great Britain · seasonally adjusted regular pay · CPIH-adjusted.</p>
                  <p>Source publication: {real.source_published_date ? formatPeriod(real.source_published_date) : "not supplied"}. Last successful check: {checkedAt(real.last_successful_check_at)}.</p>
                  <OfficialLink href={real.definition.source_url}>View official real regular-pay series</OfficialLink>
                </details>
              </article>
            </div>
          </>
        ) : <p>The official CPIH-adjusted regular-pay measure is not available yet.</p>}
        <Suspense fallback={<p role="status">Loading charts…</p>}>
          <div className="fs-chart-grid fs-chart-count-2">
            {nominal && <HistoricalTrendCard title="Annual regular-pay growth, before inflation" label="Nominal regular pay" color="#547b46" data={chartPoints(nominal)} />}
            {real && <HistoricalTrendCard title="Official CPIH-adjusted annual regular-pay growth" label="Real regular pay · CPIH" color="#6b76b5" data={chartPoints(real)} />}
          </div>
        </Suspense>
        <p className="fs-caption">Points are located by the ending month; exact values and chart tooltips show the full rolling three-month window. Consecutive published windows overlap.</p>
        <details className="fs-details fs-info"><summary>Sources and method <ChevronDown size={15} aria-hidden="true" /></summary>
          <p>Both series cover Great Britain and are seasonally adjusted annual growth in regular average weekly earnings excluding bonuses. Each observation is the official rolling three-month measure.</p>
          {nominal && <p><OfficialLink href={nominal.definition.source_url}>ONS KAI9 / LMS nominal regular-pay series</OfficialLink></p>}
          {real && <p><OfficialLink href={real.definition.source_url}>ONS A2FA / LMS CPIH-adjusted regular-pay series</OfficialLink></p>}
          <p><OfficialLink href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/averageweeklyearningsingreatbritain/october2026">ONS Average weekly earnings in Great Britain bulletin</OfficialLink> confirms the June–August reference window and CPIH treatment. The source publishes provisional estimates that can later be revised.</p>
        </details>
        </div>
    </Statistics>
  );
}

function Unemployment({ data, loading, error, refresh }: any) {
  const metric = data?.metrics?.unemployment;
  const previous = metric?.latest ? previousPublishedWindow(metric) : null;
  const currentWindow = referenceWindow(metric?.latest);
  const previousWindow = referenceWindow(previous);
  const delta = previous && metric?.latest
    ? Number(metric.latest.value) - Number(previous.value)
    : null;
  return (
    <Statistics data={data} kinds={["unemployment"]} loading={loading} error={error} refresh={refresh} sectionId="unemployment" title="Unemployment rate" eyebrow="Labour Force Survey estimate">
      <p className="fs-caption">UK residents aged 16 and over · seasonally adjusted · Labour Force Survey</p>
      {metric?.latest ? (
        <p className="fs-comparison">
          Reference window: <strong>{formatPeriod(currentWindow?.start_month)} to {formatPeriod(currentWindow?.end_month)}</strong>.
          {delta !== null && previousWindow ? <> Change: {Math.abs(delta) < 0.00001 ? "unchanged (0 percentage points)" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(2).replace(/0$/, "")} percentage points`} compared with {formatPeriod(previousWindow.start_month)} to {formatPeriod(previousWindow.end_month)}. These published windows overlap.</> : " A previous consecutive published window is not available for comparison."}
        </p>
      ) : null}
      <Suspense fallback={<p role="status">Loading chart…</p>}>
        {metric && <div className="fs-chart-grid fs-chart-count-1"><HistoricalTrendCard title="UK unemployment rate, aged 16 and over" label="Unemployment rate · seasonally adjusted" color="#865c82" data={chartPoints(metric)} /></div>}
      </Suspense>
      <p className="fs-caption">Chart points are located by the ending month. Exact values show the full rolling three-month window.</p>
      <aside className="fs-context-card">
        <h3>Labour Force Survey quality</h3>
        <p>{metric?.quality_note ?? "The Labour Force Survey unemployment rate's 95% confidence intervals remain wider than before the pandemic."} Treat small movements with care.</p>
        <OfficialLink href={metric?.quality_source_url ?? "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/articles/labourforcesurveyqualityupdate/october2026"}>ONS Labour Force Survey quality update, October 2026</OfficialLink>
      </aside>
      <details className="fs-details fs-info"><summary>Sources and method <ChevronDown size={15} aria-hidden="true" /></summary>
        <p>ONS MGSX / LMS · UK residents aged 16 and over · seasonally adjusted unemployment rate. The source date identifies the middle month; the full reference window comes from the ONS period label.</p>
        {metric && <OfficialLink href={metric.definition.source_url}>ONS unemployment rate series, MGSX / LMS</OfficialLink>}
        <p><OfficialLink href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/uklabourmarket/october2026">ONS Labour market overview, October 2026</OfficialLink> · provisional survey estimates may be revised.</p>
      </details>
    </Statistics>
  );
}

function Housing({ data, loading, error, refresh }: any) {
  const growth = data?.metrics?.private_rent_growth;
  const level = data?.metrics?.private_rent_level;
  const charts = [growth, level].filter((metric) => metric?.history?.length);
  const houseLevel = data?.metrics?.house_price_level;
  const houseGrowth = data?.metrics?.house_price_growth;
  const houseCharts = [houseLevel, houseGrowth].filter((metric) => metric?.history?.length);
  return <>
    <PageHeading eyebrow="Housing costs" title="Housing costs">Official UK-wide private rents and house prices, with levels and annual changes shown separately.</PageHeading>
    <Statistics data={data} kinds={["private_rent_growth"]} loading={loading} error={error} refresh={refresh} sectionId="rent" title="Private rents" eyebrow="ONS Price Index of Private Rents">
      <article className="fs-stat"><div className="fs-stat-top"><h3>Average monthly private rent</h3><Landmark size={18} aria-hidden="true" /></div><p className="fs-number">{metricValue(level)}</p><p className="fs-measure">United Kingdom · pounds per month</p><p className="fs-period">{level?.latest ? `For ${formatPeriod(level.latest.period)}` : "A verified reading is not available yet."}</p><p className="fs-fresh">{level ? freshness(level).label : "Unavailable"}</p><details className="fs-details fs-info"><summary>Source details <ChevronDown size={15} aria-hidden="true" /></summary><p>ONS PIPR Table 1 · Rental price · United Kingdom · pounds per month.</p><p>Source publication: {level?.source_published_date ? formatPeriod(level.source_published_date) : "not supplied"}. Last successful check: {checkedAt(level?.last_successful_check_at ?? null)}.</p>{level && <OfficialLink href={level.definition.source_url}>ONS Price Index of Private Rents, UK: monthly price statistics</OfficialLink>}</details></article>
      <p className="fs-caption">ONS publishes UK estimates with a two-month revision window. Northern Ireland data for the latest two months are imputed; figures are provisional.</p>
      <Suspense fallback={<p role="status">Loading charts…</p>}>
        <div className={`fs-chart-grid fs-chart-count-${charts.length}`}>
          {charts.map((metric) => <HistoricalTrendCard key={metric.definition.metric_id} title={metric.definition.title} label={metric.definition.unit === "percent" ? "Annual rent growth" : "Average monthly rent"} color={metric.definition.unit === "percent" ? "#9b6b32" : "#547b8a"} unit={metric.definition.unit === "percent" ? "%" : "£"} data={chartPoints(metric)} />)}
        </div>
      </Suspense>
      <details className="fs-details fs-info"><summary>Sources and method <ChevronDown size={15} aria-hidden="true" /></summary>
        <p>ONS PIPR, UK, Table 1, United Kingdom row K02000001. Annual change and average monthly rental price are separate series. The reference month is the source month; release date and FinStats check time remain separate.</p>
        <p>ONS describes the latest two UK estimates as provisional. Northern Ireland inputs for those months are imputed from its latest available two-month inflation rate, then revised when observed data arrive.</p>
        {growth && <OfficialLink href={growth.definition.source_url}>ONS Price Index of Private Rents, UK: monthly price statistics</OfficialLink>}
      </details>
    </Statistics>
    <Statistics data={data} kinds={["house_price_level"]} loading={loading} error={error} refresh={refresh} sectionId="house-prices" title="House prices" eyebrow="UK House Price Index">
      {houseGrowth?.latest && <article className="fs-stat fs-housing-support"><div className="fs-stat-top"><h3>Annual change in average house prices</h3><Landmark size={18} aria-hidden="true" /></div><p className="fs-number">{percent(houseGrowth.latest.value)}</p><p className="fs-measure">United Kingdom · annual percentage change</p><p className="fs-period">For {formatPeriod(houseGrowth.latest.period)}</p><p className="fs-fresh">{freshness(houseGrowth).label}</p><details className="fs-details fs-info"><summary>Source details <ChevronDown size={15} aria-hidden="true" /></summary><p>HM Land Registry UK HPI, Average price CSV · Annual_Change series · United Kingdom (K02000001). The release date and last successful check are recorded separately.</p><p>Source release date: {houseGrowth.source_published_date ?? "not supplied"}. Last successful check: {checkedAt(houseGrowth.last_successful_check_at ?? null)}. Recent observations are provisional and subject to revision.</p><OfficialLink href={houseGrowth.definition.source_url}>UK House Price Index releases</OfficialLink></details></article>}
      <Suspense fallback={<p role="status">Loading charts…</p>}><div className={`fs-chart-grid fs-chart-count-${houseCharts.length}`}>{houseCharts.map((metric) => <HistoricalTrendCard key={metric.definition.metric_id} title={metric.definition.title} label={metric.definition.unit === "GBP" ? "Average house price" : "Annual change"} color={metric.definition.unit === "GBP" ? "#547b8a" : "#9b6b32"} unit={metric.definition.unit === "GBP" ? "£" : "%"} unitDescription={metric.definition.unit === "GBP" ? "pounds" : "percent"} data={chartPoints(metric)} />)}</div></Suspense>
      <p className="fs-caption">The national average covers the United Kingdom; latest estimates are provisional and may be revised.</p>
    </Statistics>
  </>;
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
      finstats UK
    </a>
  );
}

function Statistics({
  data,
  kinds,
  loading,
  error,
  refresh,
  compact = false,
  overview = false,
  sectionId,
  title,
  eyebrow,
  alias,
  children,
}: any) {
  const headingId = sectionId ? `${sectionId}-title` : "figures-title";
  return (
    <section
      className={`fs-container fs-section ${overview ? "fs-overview" : ""}`}
      id={sectionId ?? (overview ? "overview" : "figures")}
      aria-labelledby={headingId}
    >
      {(overview || alias) && <span id={alias ?? "figures"} className="fs-anchor-alias" />}
      <div className="fs-section-heading">
        <div>
          {!overview && <p className="fs-eyebrow">{eyebrow ?? "The latest verified figures"}</p>}
          {overview ? (
            <h1 id={headingId}>{title ?? "Latest verified figures"}</h1>
          ) : (
            <h2 id={headingId}>{title ?? "Latest verified figures"}</h2>
          )}
          {!overview && (
            <p>Each figure has its own reference period and official source.</p>
          )}
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
                compact={compact}
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

function PriceGuide({ data }: any) {
  const cpi = data?.metrics?.cpi?.latest;
  const cpih = data?.metrics?.cpih?.latest;
  const headline = cpi ?? cpih;
  const headlineLabel = cpi ? "CPI" : "CPIH";
  return (
    <section className="fs-everyday">
      <div className="fs-container fs-reading-grid">
        <article>
          <p className="fs-eyebrow">What it means for you</p>
          <h2>What inflation means for your shopping bill</h2>
          <p>
            {headline
              ? `Annual ${headlineLabel} inflation was ${percent(headline.value)} in ${formatPeriod(headline.period)}. ${Number(headline.value) > 0 ? "Average prices were higher than a year earlier." : Number(headline.value) < 0 ? "Average prices were lower than a year earlier." : "Average prices were unchanged from a year earlier."}`
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
          <h3>CPI and CPIH</h3>
          <p>
            The Consumer Prices Index (CPI) covers everyday goods and services,
            and the Bank of England’s 2% target applies to it. The CPI figure
            above shows its annual change when a verified reading is available.
          </p>
          <p>
            CPIH also includes owner occupiers’ housing costs, so its readings
            differ from CPI and should not be compared directly with the 2%
            target.
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
      <article id="gdp">
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
          Energy and other measures stay off the site until their feeds are
          ready. If a statistic covers a smaller area than the UK,
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
}: { pathname?: string; initialData?: any } = {}) {
  const page = resolvePage(
    pathname ??
      (typeof window === "undefined" ? "/" : window.location.pathname),
  );
  const needsData = ["overview", "prices", "economy", "jobs-pay", "housing"].includes(page.id);
  const [snapshot, setSnapshot] = useState(() =>
    refreshSnapshot(initialData, needsData ? "loading" : "idle"),
  );
  const [reportSnapshot, setReportSnapshot] = useState(() =>
    refreshSnapshot(null),
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
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {page.id === "overview" && (
          <>
            <Statistics
              {...stats}
              kinds={[inflationKind(data), "bank_rate", "regular_pay_nominal_growth", "unemployment", "private_rent_growth", "house_price_level", "gdp"]}
              compact
              overview
            />
          </>
        )}
        {page.id === "prices" && (
          <>
            <PageHeading eyebrow="Prices & everyday costs" title={page.title}>
              The pace of price rises matters. So does what your income can buy.
            </PageHeading>
            <Statistics {...stats} kinds={priceKinds(data)} />
            <PriceGuide data={data} />
            <Trends data={data} kinds={priceTrendKinds(data)} />
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
        {page.id === "jobs-pay" && (
          <>
            <PageHeading eyebrow="Jobs & Pay" title={page.title}>
              Official figures on pay and unemployment.
            </PageHeading>
            <Wages {...stats} />
            <Unemployment {...stats} />
          </>
        )}
        {page.id === "housing" && <Housing {...stats} />}
        {page.id === "government" && (
          <>
            <PageHeading eyebrow="Government & Budget" title={page.title}>
              What to look for in announcements about taxes, public services and
              the wider outlook.
            </PageHeading>
            <GovernmentGuide />
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
        <BrandLink />
        <p>Official UK statistics with plain-English context.</p>
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
