# House price to earnings qualification

Status: source qualified against the live ONS site on 18 November 2026, for
issue [#135](https://github.com/Fabio-RibeiroB/macro-crew/issues/135) (spec M11,
slice 2). Modelled on [the gilt-yield qualification](gilt-yield-qualification.md).
This records evidence for the collector and the Housing page; it is not an owner
decision on any other affordability measure.

## Decision

Collect the ONS ratio of **median house price to median gross annual
workplace-based earnings, England and Wales**, as a full annual series from the
ONS dataset "House price to workplace-based earnings ratio". It is shown on
Housing as `price_to_earnings`, an optional metric: a failed fetch never blocks
publishing, and a missing year stays absent, never zero.

No modelled figure is used. The ratio is divided by ONS, not by FinStats.

## Source

| Item | Value |
| --- | --- |
| Publisher | Office for National Statistics, Housing Analysis team |
| Dataset page | <https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian> |
| Page title | House price to workplace-based earnings ratio |
| Release date on the page | 26 March 2026 (`datePublished` 2026-03-26 in the page's schema.org Dataset block) |
| Next release | March 2027 (a month, not a date, so FinStats records no next-release date) |
| Download | `https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian/current/aff1ratioofhousepricetoworkplacebasedearnings.xlsx` |
| Format | xlsx only, 513,860 bytes on 18 November 2026, 21 sheets |
| Licence | Open Government Licence v3.0 (named in the page's schema.org block and footer) |
| Companion bulletin | [Housing affordability in England and Wales](https://www.ons.gov.uk/peoplepopulationandcommunity/housing/bulletins/housingaffordabilityinenglandandwales/latest) |

### Preferring a CSV or API

None exists for this ratio, so the xlsx is the only official machine route:

- The dataset's `/data` JSON lists one download, the xlsx above, and its earlier
  versions.
- The ONS beta dataset API (`api.beta.ons.gov.uk/v1/datasets`, 338 datasets) has
  no affordability ratio. Its only related entry is `house-prices-local-authority`
  (house price statistics for small areas), which holds prices, not the ratio.
- No ONS time-series (CDID) code was found for the ratio, so the generator CSV
  route used for the CPI and public-debt series is not available.

The collector reads the dataset page first, takes the release date and the single
xlsx link from its schema.org block, then downloads that link. It refuses a page
whose dataset name, URL or licence changed, with zero or more than one xlsx link,
or a link outside the `.../current/<name>.xlsx` path of this dataset. The page and
workbook are archived privately and tied together by a receipt.

## Table, geography, unit and reference period

| Item | Value |
| --- | --- |
| Sheet | `1c`, "Table 1c - Ratio of median house price to median gross annual workplace-based earnings by country and region, England and Wales, 1997 to 2025" |
| Row | `K04000001`, "England and Wales" (row 3; the same table carries England, Wales and the nine English regions, which FinStats does not read) |
| Unit | A ratio: median house price divided by median gross annual workplace-based earnings, shown as "times earnings". No percent, no pounds. |
| Precision | Table 1c uses Excel format `#,##0.00` (two decimals). Cell values carry binary noise, for example `5.0599999999999996`; FinStats stores `5.06`. |
| Frequency | Annual |
| Reference year | The column year, 1997 to 2025 (29 observations in the 26 March 2026 release). House prices are the 12 months ending September of that year; earnings are the April snapshot of the Annual Survey of Hours and Earnings. |
| Earnings basis | Gross, full-time, individual, place of work (workplace-based), not residence-based |
| Latest observation | 2025: 7.55 |
| Latest-year status | The Metadata sheet says the latest year of earnings is released provisionally and revised with the next annual release. The Housing page says so. |
| Extra column | `5-Year Average` (8.19 for England and Wales) follows the year columns. It is not read. |

Sample of the England and Wales row, as stored:

| Year | 1997 | 2002 | 2007 | 2009 | 2021 | 2023 | 2024 | 2025 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ratio | 3.55 | 5.06 | 7.17 | 6.35 | 8.95 | 8.28 | 7.74 | 7.55 |

The ratio peaked at 8.95 in 2021 and has fallen since, in line with the ONS
bulletin's statement that affordability "has continued to improve in 2025, after
ratios peaked in 2021". Cross-check: the bulletin's headline for England alone
(7.6 times) matches the England row of Table 1c (7.63); the England and Wales row
reads 7.55. No value is missing in the 26 March 2026 workbook; `[x]` is the ONS
symbol for "no data available" and is stored as a missing observation.

## Revisions

The Metadata sheet says these ratios are revised annually, for revisions to the
house price statistics and the earnings data. The dataset page lists eleven earlier
versions, including a correction of 10 October 2025 that affected only the lower
quartile tables (2a, 4a, 6a, 2c, 4c, 6c). FinStats keeps every accepted workbook
privately, orders vintages by the dataset release date, and refuses a workbook that
drops a year it previously held. A revised year therefore replaces the earlier
value while the earlier value remains in the source archive.

## Parser guards (fail closed with `ValidationError`)

- Download bounded to 5 MB; archive expansion bounded to 60 MB; sheet `1c` to 5 MB.
- The 21 sheet names must match exactly, in order.
- Sheet `1c` title must match exactly, and its end year must equal the last
  column year.
- Header must read `Code`, `Name`, then consecutive years from 1997, then at most
  `5-Year Average`.
- Row 3 must be `K04000001`, `England and Wales`.
- Values must be a plain decimal below 100 and above zero, or `[x]`. Any other
  token fails the whole workbook. The latest year must be present and not in the
  future, and not later than the release year.

## Fixture

Because the live source was reachable, the checked-in test workbook is a reduced
projection of the real file (sheets emptied except `1c` rows 1 to 3, original cell
values kept), recorded 18 November 2026 and labelled `recorded_fixture` throughout.
It is never published as official data. Its receipt and byte counts are in
`tests/fixtures/official/receipts.json` and
`tests/fixtures/official/README.md`.

## Open points

- The next-release date is a month ("March 2027"), so the Housing page cannot show
  a date and says "See the official calendar".
- ONS publishes annually in March; between releases this series cannot change
  except by an ONS correction, so a "Last check over a day ago" style freshness
  note reflects the check, not a new release.
