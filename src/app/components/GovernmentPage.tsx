import { Suspense } from "react";
import { RefreshCw } from "lucide-react";
import { chartUpdated } from "../data/chartMeta.mjs";
import { chartPoints, previousReading } from "../data/verified.mjs";
import { NOT_AVAILABLE, changeDirection, dayLabel, decimalDifference, monthLabel } from "../data/overview.mjs";
import { checkedAt } from "../data/format.mjs";
import { OfficialLink } from "./OfficialLink";
import { Lines } from "./IndicatorTable";
import { KeyFigure, Row, Sources } from "./SubjectBlock";

/**
 * Government: Public debt and Gilt yields each read in one fixed order, Key figure,
 * What it means, Chart, Sources. There is no AI summary row: the only AI reports are
 * Bank of England MPC and Financial Stability Report commentary, neither of which
 * covers public debt or gilt yields, so an irrelevant or empty row is omitted. The
 * validated release explanations stay below this page's blocks. Anchors from the
 * earlier layout (#public-debt, #gilt-yields) still resolve.
 */
const MINUS = "−";
const na = (text = NOT_AVAILABLE) => ({ text, missing: true, direction: null });
const sub = (text: string) => ({ text, sub: true });
/** Published decimals are kept exactly as supplied ("94.0", "5.3516"). */
const percent = (value: string) => `${String(value).replace(/^-/, MINUS)}%`;
/** Move the decimal point two places right: percentage points to basis points. */
function basisPoints(difference: string) {
  const sign = /^[+−]/.test(difference) ? difference[0] : "";
  const [whole, fraction = ""] = difference.replace(/^[+−]/, "").split(".");
  const padded = fraction.padEnd(2, "0");
  const shifted = `${whole}${padded.slice(0, 2)}${padded.length > 2 ? `.${padded.slice(2)}` : ""}`
    .replace(/^0+(?=\d)/, "")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  return `${sign}${shifted}`;
}
/** pp change; colour, arrow and sign show direction only, not good or bad. */
function changeLine(current: string, previous: string) {
  const difference = decimalDifference(current, previous);
  const direction = changeDirection(difference);
  return direction === "flat" ? { text: "No change", direction } : { text: `${difference} pp`, direction };
}

/** Lines for KeyFigure and the maturity table. A missing value stays "Not available". */
function figureRow(metric: any, previous: any, daily: boolean, extraChange: any[] = []) {
  if (!metric?.latest) {
    return { latest: [na()], previous: [na()], change: [na()], period: [na("No verified reading yet")] };
  }
  const when = (period: string) => (daily ? dayLabel(period) : monthLabel(period));
  return {
    latest: [{ text: percent(metric.latest.value) }],
    previous: previous ? [{ text: percent(previous.value) }, sub(when(previous.period))] : [na()],
    change: previous ? [changeLine(metric.latest.value, previous.value), ...extraChange] : [na()],
    period: [{ text: when(metric.latest.period) }],
  };
}

const GILTS = [
  ["gilt_10y", "10-year", "10-year nominal par yield", "10-year yield · percent"],
  ["gilt_5y", "5-year", "5-year nominal par yield", "5-year yield · percent"],
  ["gilt_20y", "20-year", "20-year nominal par yield", "20-year yield · percent"],
] as const;

export function GovernmentPage({ data, loading, error, refresh, topics, HistoricalTrendCard }: any) {
  const debt = data?.metrics?.public_debt;
  const primary = data?.metrics?.gilt_10y;
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
  const placeholder = () =>
    error ? (
      <p>Verified figures are unavailable. You can still read the explanations and visit the official sources.</p>
    ) : (
      <p className="fs-loading" role="status">Checking the official-data export…</p>
    );

  const debtPrevious = debt?.latest ? previousReading(debt) : null;
  const debtRow = figureRow(debt, debtPrevious, false);

  const giltRows = GILTS.map(([key, tenor, title, label]) => {
    const metric = data?.metrics?.[key];
    const previous = metric?.latest ? previousReading(metric) : null;
    const bp = previous ? basisPoints(decimalDifference(metric.latest.value, previous.value)) : null;
    const extra = previous && bp && !/^[+−]?0$/.test(bp) ? [sub(`${bp} basis points`)] : [];
    return { key, tenor, title, label, metric, row: figureRow(metric, previous, true, extra) };
  });
  const [tenYear, ...otherTenors] = giltRows;

  return (
    <>
      <div className="fs-container fs-economy fs-government" id="figures">
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

        <section className="fs-block" id="public-debt" aria-labelledby="public-debt-title">
          <h2 id="public-debt-title">Public debt</h2>
          <Row label="Key figure" labelId="debt-key-label">
            {data ? (
              <KeyFigure row={debtRow} metric={debt} publisher="Office for National Statistics" observedLabel="End of" />
            ) : placeholder()}
          </Row>
          <Row label="What it means" labelId="debt-means-label">
            <div className="fs-means">
              <p>
                Public sector net debt excluding public sector banks, as a share of GDP. It is the debt the public sector
                owes, less its liquid assets, compared with the value of the UK economy over a year.
              </p>
              <p>
                Debt is the outstanding balance at the end of a month. The deficit, or net borrowing, is the amount borrowed
                over a period. Public sector net financial liabilities (PSNFL) is a wider balance-sheet measure that includes
                more financial assets and liabilities. The change is in percentage points (pp), not percent growth.
              </p>
              <p>
                UK, monthly, not seasonally adjusted. The ONS can revise the history, including when GDP estimates change.
              </p>
            </div>
          </Row>
          <Row label="Chart" labelId="debt-chart-label">
            {chart(debt, { title: "Public sector net debt excluding public sector banks, as a share of GDP", label: "Debt · % of GDP", color: topics.public_debt.color })}
          </Row>
          <Row label="Sources" labelId="debt-sources-label">
            <Sources metric={debt} />
            {!debt?.definition && (
              <OfficialLink href="https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6x/pusf">
                ONS HF6X public debt series
              </OfficialLink>
            )}
          </Row>
        </section>

        <section className="fs-block" id="gilt-yields" aria-labelledby="gilt-yields-title">
          <h2 id="gilt-yields-title">Gilt yields</h2>
          <Row label="Key figure" labelId="gilt-key-label">
            {data ? (
              <>
                <KeyFigure row={tenYear.row} metric={primary} publisher="Bank of England" observedLabel="Observed on" />
                <div className="fs-tenors-wrap" tabIndex={0} role="region" aria-label="5-year and 20-year yields">
                <table className="fs-tenors">
                  <caption>5-year and 20-year yields, same measure</caption>
                  <thead>
                    <tr>
                      <th scope="col">Maturity</th>
                      <th scope="col">Yield</th>
                      <th scope="col">Previous</th>
                      <th scope="col">Change*</th>
                      <th scope="col">Observed on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherTenors.map(({ key, tenor, row }) => (
                      <tr key={key}>
                        <th scope="row">{tenor}</th>
                        <td><Lines lines={row.latest} /></td>
                        <td><Lines lines={row.previous} /></td>
                        <td><Lines lines={row.change} /></td>
                        <td><Lines lines={row.period} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            ) : placeholder()}
          </Row>
          <Row label="What it means" labelId="gilt-means-label">
            <div className="fs-means">
              <p>
                A gilt yield is the return investors require to lend to the UK government for a set number of years. The
                headline figure is the 10-year yield, with the 5-year and 20-year yields beside it. Each yield describes
                market financing conditions at that maturity.
              </p>
              <p>
                It is not the average cost of the government’s outstanding debt, and not the redemption yield on one
                benchmark gilt. It is a fitted nominal par yield from a Bank of England model.
              </p>
              <p>
                The change compares with the previous available trading observation, in percentage points (pp). One
                percentage point equals 100 basis points. Weekends and other non-trading dates have no value, and are never
                filled with zero.
              </p>
            </div>
          </Row>
          <Row label="Chart" labelId="gilt-chart-label">
            {!data ? (
              <p>Charts will appear when verified figures are available.</p>
            ) : giltRows.some(({ metric }) => metric?.history?.length) ? (
              <div className="fs-gov-charts">
                {giltRows.map(({ key, tenor, title, label, metric }) =>
                  metric?.history?.length ? (
                    <Suspense key={key} fallback={<p role="status">Loading chart…</p>}>
                      <HistoricalTrendCard title={title} label={label} data={chartPoints(metric)} updated={chartUpdated(metric)} color={topics[key].color} />
                    </Suspense>
                  ) : (
                    <p key={key}>A verified history for the {tenor} yield is not available yet.</p>
                  ))}
              </div>
            ) : (
              <p>A verified history is not available yet.</p>
            )}
          </Row>
          <Row label="Sources" labelId="gilt-sources-label">
            <Sources
              metric={primary}
              extra={
                <p className="fs-src-note">
                  Bank of England Database nominal par yields (IUDSNPY, IUDMNPY and IUDLNPY), fitted with its Variable
                  Roughness Penalty term-structure model at fixed 5-, 10- and 20-year maturities. The 10-year maturity is
                  primary. The comparable family begins 4 January 2000. Last successful checks: 5-year{" "}
                  {checkedAt(data?.metrics?.gilt_5y?.last_successful_check_at ?? null)}; 10-year{" "}
                  {checkedAt(primary?.last_successful_check_at ?? null)}; 20-year{" "}
                  {checkedAt(data?.metrics?.gilt_20y?.last_successful_check_at ?? null)}.
                </p>
              }
            />
            {!primary?.definition && (
              <OfficialLink href="https://www.bankofengland.co.uk/boeapps/database/">
                Bank of England Database nominal par yields
              </OfficialLink>
            )}
          </Row>
        </section>
        <p className="fs-ledger-note" id="change-note">
          * Change is the latest value minus the previous one, calculated by FinStats from the official series. pp means
          percentage points; 1 pp = 100 basis points. Green and red show direction only, not good or bad.
        </p>
      </div>
      <GovernmentGuide />
    </>
  );
}

/** Budget and OBR reading guidance. It explains how to read announcements; it makes no claim about current policy. */
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
