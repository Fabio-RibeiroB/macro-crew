# Mortgage-rate qualification

Status: source qualification for spec M11 slice 3 ([issue #136](https://github.com/Fabio-RibeiroB/macro-crew/issues/136)). Checked live on 18 November 2026. This records evidence and the contract the code enforces. It is not a deployment record.

## Outcome

Qualified. The two series exist in the Bank of England Database with the expected codes and descriptions, are monthly, in percent, and are published under the Bank's Database terms. Both ship as optional metrics.

| Metric key | Series code | Catalogue description (verbatim) | Frequency | Unit |
| --- | --- | --- | --- | --- |
| `mortgage_2y_fixed_75` | IUMBV34 | Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 2 year (75% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted | Monthly | Percent per year |
| `mortgage_5y_fixed_75` | IUMBV42 | Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 5 year (75% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted | Monthly | Percent per year |

The catalogue title does not use the words "quoted rate" or "new". Those come from the Bank's own explanatory note below, which places these series in its "quoted household interest rates" family (Bankstats Table G1.3, "Average quoted household interest rates"). Footnotes printed on the series: [a] methodology changed from January 2008 and applied back to January 2005; [b] methodology changed from January 2016.

## Source and download

* Series viewer (codes and descriptions confirmed here): `https://www.bankofengland.co.uk/boeapps/database/FromShowColumns.asp?Travel=NIxAZxSUx&FromSeries=1&ToSeries=50&DAT=RNG&FD=1&FM=Jan&FY=2025&TD=18&TM=Nov&TY=2026&FNY=Y&CSVF=TT&html.x=66&html.y=26&SeriesCodes=IUMBV34&UsingCodes=Y&Filter=N&title=IUMBV34&VPD=Y` (and the same with `IUMBV42`).
* Download used by the collector, one request for both series, the same endpoint and shape as the gilt family:
  `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/1995&Dateto=now&SeriesCodes=IUMBV34,IUMBV42&CSVF=CN&UsingCodes=Y`
* Response: HTTP 200, `application/csv`, 19,769 bytes, header `DATE,SERIES,VALUE`, CRLF line endings.
* Explanatory note: [Further details about quoted household interest rates data](https://www.bankofengland.co.uk/statistics/details/further-details-about-quoted-household-interest-rates-data) (page last updated 31 January 2023) and the [visual summary](https://www.bankofengland.co.uk/statistics/visual-summaries/quoted-household-interest-rates), whose "fixed-rate 75% LTV mortgages" chart is these series.

## What the download contains

| Item | IUMBV34 (2-year) | IUMBV42 (5-year) |
| --- | --- | --- |
| Observations | 382 | 382 |
| First | 31 Jan 1995, 8.13 | 31 Jan 1995, 9.44 |
| Latest | 31 Oct 2026, 5.39 | 31 Oct 2026, 5.19 |
| Missing months | none (every month from January 1995 to October 2026) | none |
| Blank values | none | none |

Dates are month-end dates (for example `28 Feb 1995`, `29 Feb 1996`) and stand for that calendar month. FinStats stores the reference period as `YYYY-MM`.

Sample (last six months):

| Month | 2-year | 5-year |
| --- | --- | --- |
| May 2026 | 4.91 | 4.77 |
| Jun 2026 | 4.80 | 4.62 |
| Jul 2026 | 4.79 | 4.58 |
| Aug 2026 | 4.92 | 4.78 |
| Sep 2026 | 5.13 | 4.98 |
| Oct 2026 | 5.39 | 5.19 |

The recorded fixture `tests/fixtures/official/boe_quoted_mortgage_rates_2y_5y_75ltv_monthly.csv` is this exact response body (SHA-256 in `receipts.json`). It is labelled recorded fixture evidence and is accepted only by offline fixture replay.

## What the figures are, and are not

From the Bank's note:

* Quoted rates are headline interest rates advertised by banks and building societies, taken from Moneyfacts. They are the advertised rate, not the APR, and not the rate borrowers actually pay (that is the separate "effective rates" family).
* For each lender, the rate selected is the lowest available at the stated loan-to-value (60, 75, 85, 90 and 95% are published), for the most competitive qualifying product. Products restricted to first-time buyers are excluded; loans of roughly £25,000 to £500,000 are in scope. Fees and cashback help choose the product but do not feed into the rate.
* Lenders are combined with weights from new-lending volumes. An average is not published when fewer than three institutions qualify.
* Reasonable time margins are allowed around the fixed term; the note's example is that a maturity between 21 and 27 months counts as a two-year loan. It gives no example for the five-year term.
* Break in method: before February 2019 the series were month-end values for the sample of institutions that report effective rates (Form ER); from February 2019 they are monthly averages across the whole market of UK MFIs.
* Not seasonally adjusted. Published on the fifth working day of the following month.

FinStats copy therefore says "Bank of England quoted rates, 75% loan-to-value, new mortgages", "averages, not offers", and that the Bank Rate line is a month-end value.

## Revisions

The note says mortgage rate series are provisionally weighted on the previous quarter's balances and updated when the concurrent quarter's new-business data arrive, and that data can also be revised for corrections, rarely beyond two years. FinStats keeps full history and its revision vintages: a changed value for an earlier month is stored as a new vintage, and the page says the latest month can be revised. The collector does not reconstruct historic vintages.

## Licence

Reproduction of Bank of England Database series is under the Open Government Licence, as recorded in [gilt-yield-qualification.md](gilt-yield-qualification.md#reuse-and-licence). Moneyfacts is named by the Bank as the source of advertised rates; this qualification covers the Bank's published series, not the vendor's underlying data.

## Contract enforced in code

* `src/finstats/sources.py`: two definitions, `mortgage_2y_fixed_75` (`uk.mortgage_rate.quoted_2y_fixed_75ltv`) and `mortgage_5y_fixed_75` (`uk.mortgage_rate.quoted_5y_fixed_75ltv`); dataset `IADB`, monthly, not seasonally adjusted, comparison `previous_month`, unit `percent`. Optional-metric members: `geography: United Kingdom`, `ltv: 75`, `fixed_years: 2` or `5`.
* The parser accepts only the header `DATE,SERIES,VALUE`, only the two qualified series codes, month-end dates, a decimal or blank value (blank is stored as missing, never zero), a first observation in January 1995, a unique ordered history, no reference month after the current month and a latest value that is present. Any other series code, header change, truncated start or non-month-end date rejects the whole download.
* Optional: a failed fetch or validation records a failure for those metrics only. Publication continues, earlier verified values are retained, and a never-collected metric is absent from the page, not zero.
* `src/app/data/verified.mjs` holds the matching code-owned reader contract, including exact definition fields, series code, frequency, unit, geography, `ltv`, `fixed_years`, source and download URLs. A mismatch rejects the whole generation, so producer and reader must be deployed together.
* Fetching is a single bounded request to the exact URL above; `delivery.py` re-checks that the published download URL is that URL.

## Rollout note

The reader rejects an unknown metric, so a generation containing these members must not be published to a site still running a reader without them. Deploy the built site first or together, then let the publisher emit the new generation, per the cutover guide. Nothing in this slice deploys.
