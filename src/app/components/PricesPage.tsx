import { Suspense } from "react";
import { chartUpdated, inflationTargetLine } from "../data/chartMeta.mjs";
import { chartPoints, formatPeriod } from "../data/verified.mjs";
import { changeDirection, comparableEnergyPrevious, decimalDifference, overviewRows } from "../data/overview.mjs";
import { checkedAt } from "../data/format.mjs";
import { Delta, Lines } from "./IndicatorTable";
import { PageContents } from "./PageContents";
import { OfficialLink } from "./OfficialLink";
import { MoreDetail } from "./MoreDetail";
import { BigValue, KeyFigure, Row, Sources } from "./SubjectBlock";

/**
 * Prices: each measure (inflation, household energy, petrol and diesel) reads in one fixed
 * order, Key figure, What it means, Chart, Sources. There is no AI summary row: the current
 * AI reports cover Bank of England publications only, so none is about prices. Anchors from
 * the earlier layout (#figures, #trends, #household-energy, #petrol-diesel) still resolve.
 */
const money = (value: unknown) => `£${Number(value).toLocaleString("en-GB")}`;

function energyComparison(metric: any): React.ReactNode {
  const latest = metric?.latest;
  if (!latest?.reference) return "A verified previous comparable cap period is not available.";
  const comparison = comparableEnergyPrevious(metric);
  if (comparison.kind === "tax_change") return "No direct comparison: Ofgem says the tax treatment changed.";
  if (comparison.kind !== "comparable" || !comparison.previous)
    return "A previous cap period on the same consumption and tax basis is not available.";
  const { previous } = comparison;
  const change = decimalDifference(String(latest.value), String(previous.value));
  const sign = change.startsWith("+") || change.startsWith("−") ? change[0] : "";
  const amount = `${sign}${money(change.replace(/^[+−]/, ""))}/year`;
  const rest = ` compared with ${formatPeriod(previous.reference.effective_start)} to ${formatPeriod(previous.reference.effective_end)} on the same basis.`;
  return <><Delta direction={changeDirection(change)}>{amount}</Delta>{rest}</>;
}

/** One fuel as its own labelled figure: petrol and diesel are never blended. */
function FuelFigure({ label, tag, row, metric }: { label: string; tag: string; row: any; metric: any }) {
  const pick = (lines: any[]) => lines.filter((line: any) => line.tag === tag).map(({ tag: _tag, ...line }: any) => line);
  const latest = pick(row.latest)[0];
  const periodOf = metric?.latest?.period ? formatPeriod(metric.latest.period) : null;
  return (
    <div className="fs-fig fs-fuel-fig">
      <h4 className="fs-fig-name">{label}</h4>
      <BigValue text={latest?.text ?? "Not available"} />
      <dl className="fs-kv">
        <div><dt>Previous week</dt><dd><Lines lines={pick(row.previous)} /></dd></div>
        <div><dt>Change*</dt><dd><Lines lines={pick(row.change)} /></dd></div>
        <div><dt>Week of</dt><dd>{periodOf ?? "Not available"}</dd></div>
      </dl>
      <p className="fs-fig-src">
        {metric?.latest ? <>Pence per litre · official figure · DESNZ</> : "A verified reading is not available yet."}
        {metric?.latest && metric.collection_status !== "ok" && <span className="fs-fresh-warning"> · Update delayed · showing last verified figure</span>}
      </p>
    </div>
  );
}

export function PricesPage({ data, loading, error, refresh, topics, HistoricalTrendCard }: any) {
  const metrics = data?.metrics ?? {};
  const cpi = metrics.cpi;
  const cpih = metrics.cpih;
  const energy = metrics.household_energy;
  const petrol = metrics.petrol_price;
  const diesel = metrics.diesel_price;
  const rows = data ? Object.fromEntries(overviewRows(data).map((row: any) => [row.id, row])) : {};
  // CPI is the headline once it has a verified reading; CPIH is then secondary, else the fallback.
  const cpiHeadline = cpi?.latest?.value != null;
  const cpihRow = data ? overviewRows({ metrics: { cpih } })[0] : null;
  const inflationKinds = (cpiHeadline ? ["cpi", "cpih"] : ["cpih"]) as ("cpi" | "cpih")[];
  const inflation = { cpi: { metric: cpi, row: rows.inflation }, cpih: { metric: cpih, row: cpiHeadline ? cpihRow : rows.inflation } };
  const headline = cpiHeadline ? cpi.latest : cpih?.latest;
  const headlineLabel = cpiHeadline ? "CPI" : "CPIH";

  const waiting = !data && (
    error
      ? <p>Verified figures are unavailable. You can still read the explanations and visit the official sources.</p>
      : <p className="fs-loading" role="status">Checking the official-data export…</p>
  );
  const chart = (metric: any, props: any) =>
    !data ? (
      <p>Charts will appear when verified figures are available.</p>
    ) : metric?.history?.length ? (
      <Suspense fallback={<p role="status">Loading chart…</p>}>
        <HistoricalTrendCard {...props} data={chartPoints(metric)} updated={chartUpdated(metric)} />
      </Suspense>
    ) : null;
  const noHistory = <p>A verified history is not available yet.</p>;
  const fuels = [
    { label: "Unleaded petrol", tag: "petrol", metric: petrol },
    { label: "Diesel", tag: "diesel", metric: diesel },
  ];
  const r = energy?.latest?.reference;
  const upcoming = energy?.upcoming_period;

  return (
    <div className="fs-container fs-economy fs-prices" id="figures">
      <div className="fs-statusbar">
        <p>
          {data ? <>Figures last updated {checkedAt(data.published_at)}. We check official sources every 30 minutes and this page updates itself. <a href="/sources">How we check the data</a></> : "Official figures"}
        </p>
      </div>
      {error && (
        <div className="fs-alert" role="status">
          {error}{" "}
          {data ? "The last successfully loaded figures remain below." : "Verified figures are unavailable."}
        </div>
      )}

      <PageContents items={[{ id: "inflation", label: "Inflation" }, { id: "household-energy", label: "Household energy" }, { id: "petrol-diesel", label: "Petrol and diesel" }]} />

      <section className="fs-block" id="inflation" aria-labelledby="inflation-title">
        <h2 id="inflation-title">Inflation</h2>
        <Row label="Key figure" labelId="inflation-key-label">
          {data ? (
            inflationKinds.map((kind) => (
              <div className="fs-fig-set" key={kind}>
                <h4 className="fs-fig-name">{topics[kind].short}{kind === "cpih" && cpiHeadline ? " · secondary measure" : ""}</h4>
                <p className="fs-fig-measure">{topics[kind].measurement}</p>
                <KeyFigure row={inflation[kind].row} metric={inflation[kind].metric} publisher="Office for National Statistics" observedLabel="Month" />
              </div>
            ))
          ) : waiting}
        </Row>
        <Row label="What it means" labelId="inflation-means-label">
          <div className="fs-means">
            <p>
              {headline
                ? `Annual ${headlineLabel} inflation was ${(cpiHeadline ? inflation.cpi : inflation.cpih).row.latest[0].text} in ${formatPeriod(headline.period)}, so average prices were ${Number(headline.value) > 0 ? "higher than" : Number(headline.value) < 0 ? "lower than" : "unchanged from"} a year earlier.`
                : "Inflation measures how average prices change over time."}{" "}
              If your pay and benefits rise more slowly than prices, they buy less.
            </p>
            <MoreDetail label="How it's measured">
              <p>Your own experience depends on what you buy.</p>
              <p>{topics.cpi.meaning} {topics.cpi.caution}</p>
              <p>
                CPIH also includes owner occupiers’ housing costs, so its readings differ from CPI and should not be
                compared directly with the 2% target. The Consumer Prices Index (CPI) covers everyday goods and services.
              </p>
              <p className="fs-caption">Food-price breakdowns are not yet part of our verified dataset.</p>
              <OfficialLink href="https://www.ons.gov.uk/economy/inflationandpriceindices">
                Read the official inflation releases
              </OfficialLink>
            </MoreDetail>
          </div>
        </Row>
        <Row label="Chart" id="trends" labelId="inflation-chart-label">
          {!data ? chart(null, {}) : inflationKinds.some((kind) => inflation[kind].metric?.history?.length) ? (
            <div className={`fs-chart-grid fs-chart-count-${inflationKinds.filter((kind) => inflation[kind].metric?.history?.length).length}`}>
              {inflationKinds.map((kind) => (
                <div key={kind}>
                  {chart(inflation[kind].metric, { title: topics[kind].measurement, label: topics[kind].short, color: topics[kind].color, referenceLine: inflationTargetLine(kind) })}
                </div>
              ))}
            </div>
          ) : noHistory}
        </Row>
        <Row label="Sources" labelId="inflation-sources-label">
          {inflationKinds.map((kind) => (
            <div className="fs-src-set" key={kind}>
              {inflationKinds.length > 1 && <h4 className="fs-fig-name">{topics[kind].short}</h4>}
              <Sources metric={inflation[kind].metric} />
            </div>
          ))}
        </Row>
      </section>

      <section className="fs-block" id="household-energy" aria-labelledby="household-energy-title">
        <h2 id="household-energy-title">Household energy</h2>
        <Row label="Key figure" labelId="energy-key-label">
          {data ? <KeyFigure row={rows.energy} metric={energy} publisher="Ofgem" observedLabel="Cap period" /> : waiting}
        </Row>
        <Row label="What it means" labelId="energy-means-label">
          <div className="fs-means">
            <p>
              The energy price cap is Ofgem’s illustrative yearly gas and electricity bill for a typical household.
              Your own bill depends on how much energy you use and where you live.
            </p>
            <MoreDetail label="How it's measured">
              <p>{topics.household_energy.meaning} {topics.household_energy.caution}</p>
              <p>
                The benchmark is medium typical consumption: {r?.electricity_kwh_per_year?.toLocaleString("en-GB") ?? "2,500"} kWh of
                single-rate electricity and {r?.gas_kwh_per_year?.toLocaleString("en-GB") ?? "9,500"} kWh of gas per year. It is the
                Ofgem average for England, Scotland and Wales, not a quote for a particular region.
              </p>
              {r && (
                <>
                  <p>
                    Effective {formatPeriod(r.effective_start)} to {formatPeriod(r.effective_end)}. Electricity: {r.electricity.unit_rate_p_per_kwh}p/kWh and {r.electricity.standing_charge_p_per_day}p/day. Gas: {r.gas.unit_rate_p_per_kwh}p/kWh and {r.gas.standing_charge_p_per_day}p/day.
                  </p>
                  <p>
                    Tax: {r.tax_treatment}. The annual figure is Ofgem's published amount, not recalculated from rounded rates. {energyComparison(energy)}
                  </p>
                </>
              )}
              {upcoming && (
                <p>
                  Announced upcoming cap: {money(upcoming.value)}/year for {formatPeriod(upcoming.reference.effective_start)} to {formatPeriod(upcoming.reference.effective_end)}. It will become current only when that effective period begins. Announcement date: {upcoming.reference.announcement_date ?? "not supplied"}.
                </p>
              )}
              <p>The cap limits unit rates and standing charges, not total bills. Actual costs depend on use and region. It does not cover Northern Ireland, fixed tariffs or heating oil.</p>
              <OfficialLink href={energy?.definition.source_url ?? "https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-unit-rates-and-standing-charges"}>
                Ofgem energy cap rates and standing charges
              </OfficialLink>
            </MoreDetail>
          </div>
        </Row>
        <Row label="Chart" labelId="energy-chart-label">
          {/* Cap periods are listed, not charted: a line across a tax-treatment change would imply a like-for-like fall or rise. */}
          {!data ? <p>Charts will appear when verified figures are available.</p> : (
            <>
              <h4 className="fs-fig-name">Past cap periods</h4>
              {energy?.history?.length ? (
                <ol className="fs-energy-history">
                  {[...energy.history].reverse().map((point: any) => (
                    <li key={point.period}>
                      <strong>{point.reference.period_status === "expired" ? "Ended" : "Current"} · {formatPeriod(point.reference.effective_start)} to {formatPeriod(point.reference.effective_end)} · {money(point.value)}/year</strong>
                      <span>{point.reference.electricity_kwh_per_year.toLocaleString("en-GB")} kWh electricity and {point.reference.gas_kwh_per_year.toLocaleString("en-GB")} kWh gas · {point.reference.tax_treatment}</span>
                    </li>
                  ))}
                </ol>
              ) : <p>A verified cap period is not available yet.</p>}
              {energy?.validation_status === "unavailable" && energy?.history?.length > 0 && (
                <p>No effective cap is currently verified; the periods above have ended.</p>
              )}
            </>
          )}
        </Row>
        <Row label="Sources" labelId="energy-sources-label">
          <Sources
            metric={energy}
            extra={
              <>
                <p className="fs-caption">
                  Cap announcement date: {r?.announcement_date ?? "not supplied on this rates page"}. Source page publication date: {energy?.source_published_date ?? "not supplied"}. Last successful check: {checkedAt(energy?.last_successful_check_at ?? null)}.{!upcoming && " No next cap announcement is currently published on this source page."}
                </p>
                {energy?.definition?.consumption_source_url && (
                  <OfficialLink href={energy.definition.consumption_source_url}>Ofgem final decision on typical consumption values (2026)</OfficialLink>
                )}
              </>
            }
          />
        </Row>
      </section>

      <section className="fs-block" id="petrol-diesel" aria-labelledby="petrol-diesel-title">
        <h2 id="petrol-diesel-title">Petrol and diesel</h2>
        <Row label="Key figure" labelId="fuel-key-label">
          {data ? (
            <div className="fs-fuel-pair">
              {fuels.map(({ label, tag, metric }) => (
                <FuelFigure key={tag} label={label} tag={tag} row={rows.fuel} metric={metric} />
              ))}
            </div>
          ) : waiting}
        </Row>
        <Row label="What it means" labelId="fuel-means-label">
          <div className="fs-means">
            <p>
              These are average petrol and diesel pump prices across the UK, in pence per litre.
              Your local station may charge more or less.
            </p>
            <MoreDetail label="How it's measured">
              <p>{topics.petrol_price.meaning} {topics.petrol_price.caution}</p>
              <p>
                The week is referenced to Monday. DESNZ samples on Monday morning, or the next working morning on a bank
                holiday; this does not assert that the actual sample was taken on Monday. The shared sample is weighted
                by company sales and is a UK average, not a local forecourt quote.
              </p>
              <p>
                Petrol and diesel are independent pump-price series in pence per litre, so they are shown separately and
                never combined. Duty and VAT are already included in the published pump prices and are not recalculated.
              </p>
              <p>
                DESNZ Weekly road fuel prices CSV, 2018 onward. The accompanying workbook describes a sales-weighted UK average from six companies, covering around 60% of market volume using 2022 sales.
              </p>
              <OfficialLink href={petrol?.definition?.source_url ?? "https://www.gov.uk/government/statistics/weekly-road-fuel-prices"}>
                DESNZ weekly road fuel prices and current downloads
              </OfficialLink>
            </MoreDetail>
          </div>
        </Row>
        <Row label="Chart" labelId="fuel-chart-label">
          {!data ? <p>Charts will appear when verified figures are available.</p> : fuels.some(({ metric }) => metric?.history?.length) ? (
            <div className={`fs-chart-grid fs-chart-count-${fuels.filter(({ metric }) => metric?.history?.length).length}`}>
              {fuels.map(({ label, tag, metric }) => (
                <div key={tag}>
                  {chart(metric, {
                    title: metric?.definition?.title, label: `${label} · pence per litre`,
                    unit: "p", unitDescription: "pence per litre", color: tag === "petrol" ? "#547b8a" : "#9b6b32",
                  })}
                </div>
              ))}
            </div>
          ) : noHistory}
        </Row>
        <Row label="Sources" labelId="fuel-sources-label">
          {fuels.map(({ label, tag, metric }) => (
            <div className="fs-src-set" key={tag}>
              <h4 className="fs-fig-name">{label}</h4>
              <Sources metric={metric} />
            </div>
          ))}
        </Row>
      </section>
      <p className="fs-ledger-note" id="change-note">
        * Change is the latest value minus the previous one, calculated by FinStats from the official series. pp means percentage points. Green and red show direction only, not good or bad.
      </p>
    </div>
  );
}
