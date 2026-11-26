import { Suspense, lazy } from "react";
import { chartUpdated } from "../data/chartMeta.mjs";
import { MORTGAGE_BASIS, MORTGAGE_RATES, mortgageChart, mortgageFigureRow, mortgageMetrics } from "../data/mortgageRates.mjs";
import { MoreDetail } from "./MoreDetail";
import { KeyFigure, Row, Sources } from "./SubjectBlock";

// Charts are lazy like the other trend cards: Recharts stays out of the first load.
const MortgageRatesChart = lazy(() =>
  import("./MortgageRatesChart").then((module) => ({ default: module.MortgageRatesChart })),
);

/**
 * Housing, Mortgage rates: Key figure, What it means, Chart, Sources, like every other
 * block. It renders nothing unless at least one quoted rate has a verified reading, so
 * an export without these optional members (or a failed fetch) leaves Housing as it was.
 */
export function MortgageRatesSection({ data }: { data: any }) {
  const present = mortgageMetrics(data);
  if (!present.length) return null;
  const chart = mortgageChart(data);
  const first = present[0].metric;
  return (
    <section className="fs-block" id="mortgage-rates" aria-labelledby="mortgage-rates-title">
      <h2 id="mortgage-rates-title">Mortgage rates</h2>
      <Row label="Key figure" labelId="mortgage-key-label">
        {MORTGAGE_RATES.map(({ key, name }) => {
          const metric = data.metrics[key];
          return (
            <div className="fs-fig-set" key={key}>
              <h4 className="fs-fig-name">{name}</h4>
              <p className="fs-fig-measure">{MORTGAGE_BASIS}</p>
              {metric?.latest ? (
                <KeyFigure row={mortgageFigureRow(metric)} metric={metric} publisher="Bank of England" observedLabel="Month" />
              ) : (
                <p>This rate has no verified reading yet.</p>
              )}
            </div>
          );
        })}
      </Row>
      <Row label="What it means" labelId="mortgage-means-label">
        <div className="fs-means">
          <p>
            Average advertised rates on new two-year and five-year fixed-rate mortgages. They are averages, not offers:
            the rate you are offered depends on you, the property and the lender.
          </p>
          <MoreDetail label="How it’s measured">
            <p>
              {MORTGAGE_BASIS}. They are averages of the headline rates that banks and building societies advertise
              for new two-year and five-year fixed-rate mortgages, taking each lender’s lowest available rate at 75%
              loan-to-value (a 25% deposit) and weighting lenders by their lending.
            </p>
            <p>
              They are not the rate paid on existing mortgages. Fees and cashback are used to pick the product but are not
              in the rate. Bank Rate, the Bank of England policy rate, is drawn for context as its value on the last day of
              each month. The change compares with the previous month, in percentage points (pp). The latest month can be
              revised.
            </p>
          </MoreDetail>
        </div>
      </Row>
      <Row label="Chart" labelId="mortgage-chart-label">
        {chart ? (
          <Suspense fallback={<p role="status">Loading chart…</p>}>
            <MortgageRatesChart rows={chart.rows} series={chart.series} updated={chartUpdated(first)} />
          </Suspense>
        ) : (
          <p>A verified history is not available yet.</p>
        )}
      </Row>
      <Row label="Sources" labelId="mortgage-sources-label">
        {MORTGAGE_RATES.filter(({ key }) => data.metrics[key]?.definition).map(({ key, name }) => (
          <div className="fs-src-set" key={key}>
            <h4 className="fs-fig-name">{name}</h4>
            <Sources metric={data.metrics[key]} />
          </div>
        ))}
        <MoreDetail label="How the rates are compiled">
          <p className="fs-src-note">
            Both rates come from Bank of England Bankstats Table G1.3 (2-year fixed: IUMBV34; 5-year fixed: IUMBV42),
            with data from January 1995. Before February 2019, figures used month-end values from a sample of lenders;
            from February 2019 they are monthly averages across the whole market.
          </p>
        </MoreDetail>
      </Row>
    </section>
  );
}
