import { Suspense } from "react";
import { RefreshCw } from "lucide-react";
import { chartUpdated } from "../data/chartMeta.mjs";
import { chartPoints } from "../data/verified.mjs";
import { overviewRows } from "../data/overview.mjs";
import { checkedAt } from "../data/format.mjs";
import { PageContents } from "./PageContents";
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

      <PageContents items={[{ id: "rent", label: "Rent" }, { id: "house-prices", label: "House prices" }, { id: "mortgage-rates", label: "Mortgage rates", show: hasMortgageRates(data) }]} />

      <section className="fs-block" id="rent" aria-labelledby="rent-title">
        <h2 id="rent-title">Rent</h2>
        <Row label="Key figure" labelId="rent-key-label">{figure("rent", rent, "Office for National Statistics")}</Row>
        <Row label="What it means" labelId="rent-means-label">
          <div className="fs-means">
            <p>Annual change in average private rents across the United Kingdom, from the ONS Price Index of Private Rents. The average monthly rent in pounds is shown beside it.</p>
            <p>
              ONS publishes UK estimates with a two-month revision window: the latest two months are provisional.
              Northern Ireland data for those two months are imputed from its latest available two-month inflation
              rate, then revised when observed data arrive.
            </p>
            <OfficialLink href="https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/privaterentandhousepricesuk/latest">
              Read the latest ONS release
            </OfficialLink>
          </div>
        </Row>
        <Row label="Chart" labelId="rent-chart-label">
          {charts([
            [rent, { title: rent?.definition?.title, label: "Annual rent growth", unit: "%", unitDescription: "percent" }],
            [rentLevel, { title: rentLevel?.definition?.title, label: "Average monthly rent", unit: "£", unitDescription: "pounds per month" }],
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
            <p>The average price of a home sold in the United Kingdom, from the UK House Price Index. The change on a year earlier is shown beside it.</p>
            <p>The national average covers the United Kingdom. The latest estimates are provisional and may be revised.</p>
            <OfficialLink href="https://www.gov.uk/government/collections/uk-house-price-index-reports">
              Read the UK House Price Index reports
            </OfficialLink>
          </div>
        </Row>
        <Row label="Chart" labelId="house-chart-label">
          {charts([
            [price, { title: price?.definition?.title, label: "Average house price", unit: "£", unitDescription: "pounds" }],
            [priceGrowth, { title: priceGrowth?.definition?.title, label: "Annual change", unit: "%", unitDescription: "percent" }],
          ])}
        </Row>
        <Row label="Sources" labelId="house-sources-label">
          <Sources metric={price} extra={secondarySource(priceGrowth, "Annual change")} />
        </Row>
      </section>
      <MortgageRatesSection data={data} />
      <p className="fs-ledger-note" id="change-note">
        * Change is the latest value minus the previous one, calculated by FinStats from the official series. pp means percentage points. Green and red show direction only, not good or bad.
      </p>
    </div>
  );
}
