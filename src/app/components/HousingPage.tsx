import { Suspense } from "react";
import { RefreshCw } from "lucide-react";
import { chartUpdated } from "../data/chartMeta.mjs";
import { chartPoints } from "../data/verified.mjs";
import { realPriceSeries, realPriceTitle, baseMonthLabel } from "../data/realPrices.mjs";
import { overviewRows, priceToEarningsRow } from "../data/overview.mjs";
import { checkedAt } from "../data/format.mjs";
import { PageContents } from "./PageContents";
import { MoreDetail } from "./MoreDetail";
import { OfficialLink } from "./OfficialLink";
import { KeyFigure, Row, Sources } from "./SubjectBlock";
import { MortgageRatesSection } from "./MortgageRatesSection";
import { hasMortgageRates } from "../data/mortgageRates.mjs";

/**
 * Housing: each measure reads in one fixed order, Key figure, What it means, Chart,
 * Sources. There is no AI summary row: the only AI reports are Bank of England MPC and
 * Financial Stability Report commentary, which is not about rents or house prices, and
 * an empty row would imply coverage that does not exist. The anchors #rent and
 * #house-prices from the earlier layout still resolve.
 */
export function HousingPage({ data, loading, error, refresh, HistoricalTrendCard }: any) {
  const rows = data ? Object.fromEntries(overviewRows(data).map((row: any) => [row.id, row])) : {};
  const { private_rent_growth: rent, private_rent_level: rentLevel, house_price_level: price, house_price_growth: priceGrowth } =
    data?.metrics ?? {};
  // Annual, England and Wales only: shown once a verified reading exists, otherwise hidden.
  const ratio = data?.metrics?.price_to_earnings;
  const showRatio = Boolean(ratio?.latest);
  // FinStats calculation, not an official figure: shown only when both verified series exist.
  const real = price?.history?.length && data?.metrics?.cpi_index?.history?.length
    ? realPriceSeries(price.history, data.metrics.cpi_index.history)
    : null;
  const charts = (items: [any, any][]) =>
    !data ? (
      <p>Charts will appear when verified figures are available.</p>
    ) : items.some(([metric]) => metric?.history?.length) ? (
      <Suspense fallback={<p role="status">Loading chart…</p>}>
        <div className="fs-housing-charts">
          {items.filter(([metric]) => metric?.history?.length).map(([metric, props]) => (
            <HistoricalTrendCard key={metric.definition.metric_id} {...props} data={chartPoints(metric)} updated={chartUpdated(metric)} />
          ))}
        </div>
      </Suspense>
    ) : (
      <p>A verified history is not available yet.</p>
    );
  const figure = (id: string, metric: any, publisher: string) =>
    data ? (
      <KeyFigure row={rows[id]} metric={metric} publisher={publisher} observedLabel="Period" />
    ) : error ? (
      <p>Verified figures are unavailable. You can still read the explanations and visit the official sources.</p>
    ) : (
      <p className="fs-loading" role="status">Checking the official-data export…</p>
    );
  const secondarySource = (metric: any, name: string) =>
    metric?.definition ? (
      <dl className="fs-src fs-housing-second">
        <div><dt>{name}</dt><dd>{metric.definition.dataset} / {metric.definition.series}</dd></div>
        <div><dt>Last successful check</dt><dd>{checkedAt(metric.last_successful_check_at ?? null)}</dd></div>
      </dl>
    ) : (
      <p>{name}: source details appear when a verified reading is available.</p>
    );
  return (
    <div className="fs-container fs-economy fs-housing">
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

      <PageContents items={[{ id: "rent", label: "Rent" }, { id: "house-prices", label: "House prices" }, { id: "price-to-earnings", label: "House price to earnings", show: showRatio }, { id: "mortgage-rates", label: "Mortgage rates", show: hasMortgageRates(data) }]} />

      <section className="fs-block" id="rent" aria-labelledby="rent-title">
        <h2 id="rent-title">Rent</h2>
        <Row label="Key figure" labelId="rent-key-label">{figure("rent", rent, "Office for National Statistics")}</Row>
        <Row label="What it means" labelId="rent-means-label">
          <div className="fs-means">
            <p>
              How much UK private rents changed over the past year, with the average monthly rent in pounds beside it
              (mix-adjusted, not the median). It shows how much more or less renters pay than a year ago.
            </p>
            <MoreDetail label="How it’s measured">
              <p>
                Annual change in private rents across the United Kingdom, from the ONS Price Index of Private Rents.
                Beside it is the average monthly rent in pounds: the index's mix-adjusted average (a weighted geometric
                mean), not the median.
              </p>
              <p>
                ONS publishes UK estimates with a two-month revision window: the latest two months are provisional.
                Northern Ireland data for those two months are imputed from its latest available two-month inflation
                rate, then revised when observed data arrive.
              </p>
            </MoreDetail>
            <OfficialLink href="https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/privaterentandhousepricesuk/latest">
              Read the latest ONS release
            </OfficialLink>
          </div>
        </Row>
        <Row label="Chart" labelId="rent-chart-label">
          {charts([
            [rent, { title: rent?.definition?.title, label: "Annual rent growth", unit: "%", unitDescription: "percent" }],
            [rentLevel, { title: "Average monthly private rent (ONS PIPR, mix-adjusted)", label: "Average monthly rent (ONS PIPR, mix-adjusted)", unit: "£", unitDescription: "pounds per month" }],
          ])}
        </Row>
        <Row label="Sources" labelId="rent-sources-label">
          <Sources metric={rent} extra={secondarySource(rentLevel, "Average monthly rent")} />
        </Row>
      </section>

      <section className="fs-block" id="house-prices" aria-labelledby="house-prices-title">
        <h2 id="house-prices-title">House prices</h2>
        <Row label="Key figure" labelId="house-key-label">{figure("house-prices", price, "HM Land Registry and ONS")}</Row>
        <Row label="What it means" labelId="house-means-label">
          <div className="fs-means">
            <p>
              UK House Price Index average (mix-adjusted, not the median), with the change on a year earlier beside it.
              It shows whether UK house prices are rising or falling.
            </p>
            {real && (
              <p id="house-real-means">
                The second chart is a FinStats calculation, not an official statistic: it shows prices after inflation.
              </p>
            )}
            <MoreDetail label="How it’s measured">
              <p>
                The UK House Price Index average price: a mix-adjusted average (geometric mean) of sale prices, not the
                median. Mix-adjusted means it reflects a typical mix of homes, so a month with more expensive sales
                doesn't push it up on its own. The change on a year earlier is shown beside it.
              </p>
              <p>
                The house price to earnings ratio below uses the median price paid in England and Wales, which is a
                different measure, so the two £ figures should not be compared directly.
              </p>
              <p>The national average covers the United Kingdom. The latest estimates are provisional and may be revised.</p>
              {real && (
                <p>
                  The second chart is a FinStats calculation, not an official statistic. It restates each month's average price in {baseMonthLabel(real.base)} prices
                  using the ONS Consumer Prices Index (CPI), so earlier prices are scaled up by inflation since then. A month missing from either series stays a gap.
                </p>
              )}
            </MoreDetail>
            <OfficialLink href="https://www.gov.uk/government/collections/uk-house-price-index-reports">
              Read the UK House Price Index reports
            </OfficialLink>
          </div>
        </Row>
        <Row label="Chart" labelId="house-chart-label">
          {charts([
            [price, { title: "Average house price (UK HPI, mix-adjusted)", label: "Average house price (UK HPI, mix-adjusted)", unit: "£", unitDescription: "pounds" }],
            [priceGrowth, { title: priceGrowth?.definition?.title, label: "Annual change", unit: "%", unitDescription: "percent" }],
          ])}
          {real ? (
            <Suspense fallback={<p role="status">Loading chart…</p>}>
              <div className="fs-housing-charts fs-housing-real">
                <HistoricalTrendCard
                  title={realPriceTitle(real.base)}
                  label="Average house price after inflation (UK HPI, mix-adjusted)"
                  unit="£"
                  unitDescription={`pounds in ${baseMonthLabel(real.base)} prices`}
                  data={real.points}
                />
              </div>
            </Suspense>
          ) : data && price?.history?.length ? (
            <p className="fs-housing-real-note">
              House prices after inflation are not shown because the official ONS CPI index is not available yet.
            </p>
          ) : null}
        </Row>
        <Row label="Sources" labelId="house-sources-label">
          <Sources metric={price} extra={<>
            {secondarySource(priceGrowth, "Annual change")}
            {real && secondarySource(data.metrics.cpi_index, "CPI index, used for the after-inflation chart")}
          </>} />
        </Row>
      </section>
      {showRatio && (
        <section className="fs-block" id="price-to-earnings" aria-labelledby="price-to-earnings-title">
          <h2 id="price-to-earnings-title">House price to earnings</h2>
          <Row label="Key figure" labelId="ratio-key-label">
            <KeyFigure row={priceToEarningsRow(ratio)} metric={ratio} publisher="Office for National Statistics" observedLabel="Year" />
          </Row>
          <Row label="What it means" labelId="ratio-means-label">
            <div className="fs-means">
              <p>
                How many times a typical year’s pay a typical home costs in England and Wales. A higher ratio means homes
                are less affordable on typical pay.
              </p>
              <MoreDetail label="How it’s measured">
                <p>
                  How many times the typical yearly pay of someone working in England and Wales a typical home costs: the
                  median house price divided by median gross annual workplace-based earnings. A higher ratio means homes
                  are less affordable on typical pay.
                </p>
                <p>
                  ONS publishes it once a year, for England and Wales only, so it is not comparable with the UK House Price Index
                  average price above. The {ratio.latest.period} figure uses house prices for the year ending September{" "}
                  {ratio.latest.period} and earnings in April {ratio.latest.period}. The latest year is provisional and
                  ONS revises it in the next annual release.
                </p>
                <p>It is a simple ratio. ONS notes that many other factors, such as deposits and mortgage rates, also affect affordability.</p>
              </MoreDetail>
              <OfficialLink href="https://www.ons.gov.uk/peoplepopulationandcommunity/housing/bulletins/housingaffordabilityinenglandandwales/latest">
                Read the ONS housing affordability bulletin
              </OfficialLink>
            </div>
          </Row>
          <Row label="Chart" labelId="ratio-chart-label">
            {charts([[ratio, {
              title: "House price to earnings ratio, England and Wales", label: "Median house price ÷ median earnings",
              unit: "×", unitDescription: "times annual earnings (ratio)", defaultRange: "All",
            }]])}
          </Row>
          <Row label="Sources" labelId="ratio-sources-label">
            <Sources metric={ratio} />
          </Row>
        </section>
      )}
      <MortgageRatesSection data={data} />
      <p className="fs-ledger-note" id="change-note">
        * Change is the latest value minus the previous one, calculated by FinStats from the official series. pp means percentage points. Green and red show direction only, not good or bad.
      </p>
    </div>
  );
}
