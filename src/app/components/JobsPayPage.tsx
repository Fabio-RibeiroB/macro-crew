import { Suspense } from "react";
import { RefreshCw } from "lucide-react";
import { chartUpdated } from "../data/chartMeta.mjs";
import { chartPoints, previousPublishedWindow, referenceWindow } from "../data/verified.mjs";
import { changeDirection, decimalDifference, NOT_AVAILABLE, overviewRows, windowLabel } from "../data/overview.mjs";
import { checkedAt } from "../data/format.mjs";
import { PageContents } from "./PageContents";
import { OfficialLink } from "./OfficialLink";
import { Delta } from "./IndicatorTable";
import { MoreDetail } from "./MoreDetail";
import { KeyFigure, Row, Sources } from "./SubjectBlock";

const CHART_CAPTION =
  "Chart points sit at the ending month of each rolling three-month window; exact values and tooltips show the full window. Consecutive published windows overlap.";
const BULLETIN_PAY =
  "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/averageweeklyearningsingreatbritain/october2026";
const BULLETIN_JOBS =
  "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/uklabourmarket/october2026";
const LFS_QUALITY =
  "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/articles/labourforcesurveyqualityupdate/october2026";

const sameWindow = (a: any, b: any) => !!a && !!b && a.start_month === b.start_month && a.end_month === b.end_month;
const withoutSub = (lines: any[]) => lines.filter((line: any) => !line.sub);

/** The official CPIH-adjusted series, shown beside nominal pay with its own window. */
function RealPay({ nominal, real }: any) {
  if (!real?.latest || real.latest.value == null)
    return (
      <div className="fs-jp-real">
        <h4>After inflation (CPIH-adjusted)</h4>
        <p><span className="fs-na">{NOT_AVAILABLE}</span>. The official CPIH-adjusted regular-pay measure is not available yet.</p>
      </div>
    );
  const current = referenceWindow(real.latest);
  const previous = previousPublishedWindow(real);
  const earlier = referenceWindow(previous);
  const matching = sameWindow(referenceWindow(nominal?.latest), current);
  const difference = previous ? decimalDifference(String(real.latest.value), String(previous.value)) : null;
  const relationship = !nominal?.latest
    ? "A matched comparison with nominal pay is unavailable because nominal pay has no current verified window."
    : matching
      ? "Same published window as nominal pay. This is the ONS real-pay series, not an inflation subtraction."
      : "Separate window, not directly matched to nominal pay. The ONS CPIH-adjusted figure is kept independently.";
  return (
    <div className="fs-jp-real">
      <h4>After inflation (CPIH-adjusted)</h4>
      <p>
        <strong className="fs-jp-real-v">{String(real.latest.value)}%</strong>{" "}
        for {current ? windowLabel(current.start_month, current.end_month) : real.latest.period}
        {difference !== null && earlier
          ? <> · {difference === "0" ? "No change" : <>Change <Delta direction={changeDirection(difference)}>{difference} pp</Delta></>} vs {windowLabel(earlier.start_month, earlier.end_month)} (windows overlap)</>
          : " · A directly comparable previous window is not available."}
      </p>
      {real.collection_status !== "ok" && <p>Update delayed, showing the last verified figure.</p>}
      <MoreDetail label="How it's matched">
        <p>{relationship}</p>
      </MoreDetail>
    </div>
  );
}

/**
 * Jobs & Pay: each measure reads in one fixed order, Key figure, What it means, Chart,
 * Sources. The AI summary row is omitted: the only AI reports are Bank of England
 * MPC/FSR commentary, which says nothing about pay or unemployment. Anchors #wages,
 * #unemployment and the older #figures still resolve.
 */
export function JobsPayPage({ data, loading, error, refresh, topics, HistoricalTrendCard }: any) {
  const rows = data ? Object.fromEntries(overviewRows(data).map((row: any) => [row.id, row])) : {};
  const nominal = data?.metrics?.regular_pay_nominal_growth;
  const real = data?.metrics?.regular_pay_real_growth;
  const unemployment = data?.metrics?.unemployment;
  const chart = (metric: any, props: any) =>
    !data ? (
      <p>Charts will appear when verified figures are available.</p>
    ) : metric?.history?.length ? (
      <Suspense fallback={<p role="status">Loading chart…</p>}>
        <HistoricalTrendCard {...props} data={chartPoints(metric)} updated={chartUpdated(metric)} />
      </Suspense>
    ) : (
      <p>A verified history is not available yet.</p>
    );
  const figure = (id: string, metric: any, extra?: React.ReactNode) =>
    data ? (
      <>
        <KeyFigure
          row={{ ...rows[id], change: withoutSub(rows[id].change) }}
          metric={metric}
          publisher="Office for National Statistics"
          observedLabel="Reference window"
        />
        {extra}
      </>
    ) : error ? (
      <p>Verified figures are unavailable. You can still read the explanations and visit the official sources.</p>
    ) : (
      <p className="fs-loading" role="status">Checking the official-data export…</p>
    );
  return (
    <div className="fs-container fs-economy fs-jobs-pay" id="figures">
      <div className="fs-statusbar">
        <p>
          {data ? <>Figures last updated {checkedAt(data.published_at)} and can be revised. <a href="/sources">How we check the data</a></> : "Official figures"}
        </p>
        <button className="fs-text-button" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw size={15} className={loading ? "fs-spin" : ""} aria-hidden="true" />
          {loading ? "Checking figures…" : "Check for updates"}
        </button>
      </div>
      {error && (
        <div className="fs-alert" role="status">
          {error}{" "}
          {data ? "The last successfully loaded figures remain below." : "Verified figures are unavailable."}
        </div>
      )}

      <PageContents items={[{ id: "wages", label: "Wages" }, { id: "unemployment", label: "Unemployment" }]} />

      <section className="fs-block" id="wages" aria-labelledby="wages-title">
        <h2 id="wages-title">Wages</h2>
        <Row label="Key figure" labelId="wages-key-label">
          {figure("wages", nominal, <RealPay nominal={nominal} real={real} />)}
        </Row>
        <Row label="What it means" labelId="wages-means-label">
          <div className="fs-means">
            <p>
              Regular pay growth is how much average earnings, leaving out bonuses, have risen compared with a year
              earlier. The after-inflation figure shows whether pay is keeping up with prices.
            </p>
            <MoreDetail label="How it's measured">
              <p>{topics.regular_pay_nominal_growth.meaning}</p>
              <p>
                Regular pay excludes bonuses and covers Great Britain. The headline figure is not adjusted for rising
                prices. The after-inflation figure is the ONS series adjusted using CPIH, and it is dated separately.
              </p>
              <p>{topics.regular_pay_nominal_growth.caution}</p>
              <OfficialLink href={BULLETIN_PAY}>ONS Average weekly earnings in Great Britain</OfficialLink>
            </MoreDetail>
          </div>
        </Row>
        <Row label="Chart" labelId="wages-chart-label">
          {chart(nominal, { title: "Annual regular-pay growth, before inflation", label: "Nominal regular pay" })}
          {data && real?.history?.length > 0 && (
            <div className="fs-jp-chart-2">
              {chart(real, { title: "Official CPIH-adjusted annual regular-pay growth", label: "Real regular pay · CPIH" })}
            </div>
          )}
          <MoreDetail label="How to read this chart"><p>{CHART_CAPTION}</p></MoreDetail>
        </Row>
        <Row label="Sources" labelId="wages-sources-label">
          <Sources
            metric={nominal}
            extra={real?.definition && (
              <>
                <h4 className="fs-jp-src-title">After-inflation series</h4>
                <Sources metric={real} />
              </>
            )}
          />
        </Row>
      </section>

      <section className="fs-block" id="unemployment" aria-labelledby="unemployment-title">
        <h2 id="unemployment-title">Unemployment</h2>
        <Row label="Key figure" labelId="unemployment-key-label">{figure("unemployment", unemployment)}</Row>
        <Row label="What it means" labelId="unemployment-means-label">
          <div className="fs-means">
            <p>
              The unemployment rate is the share of people in the workforce who are out of work and looking for a job.
              Small changes from one reading to the next should be treated with care.
            </p>
            <MoreDetail label="How it's measured">
              <p>{topics.unemployment.meaning}</p>
              <p>Covers UK residents aged 16 and over, seasonally adjusted. Each reading is a rolling three-month window.</p>
              <p>
                {unemployment?.quality_note ?? "The Labour Force Survey unemployment rate's 95% confidence intervals remain wider than before the pandemic."}{" "}
                Treat small movements with care.
              </p>
              <OfficialLink href={unemployment?.quality_source_url ?? LFS_QUALITY}>
                ONS Labour Force Survey quality update, October 2026
              </OfficialLink>
            </MoreDetail>
          </div>
        </Row>
        <Row label="Chart" labelId="unemployment-chart-label">
          {chart(unemployment, { title: "UK unemployment rate, aged 16 and over", label: "Unemployment rate · seasonally adjusted" })}
          <MoreDetail label="How to read this chart"><p>{CHART_CAPTION}</p></MoreDetail>
        </Row>
        <Row label="Sources" labelId="unemployment-sources-label">
          <Sources
            metric={unemployment}
            extra={<p><OfficialLink href={BULLETIN_JOBS}>ONS Labour market overview, October 2026</OfficialLink> Provisional survey estimates may be revised.</p>}
          />
        </Row>
      </section>
      <p className="fs-ledger-note" id="change-note">
        * Change is the latest value minus the previous published window, calculated by FinStats from the official series. pp means percentage points. Green and red show direction only, not good or bad. Published three-month windows overlap.
      </p>
    </div>
  );
}
