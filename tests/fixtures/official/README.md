# Recorded official series

These are unmodified response bodies obtained on 20 October 2026. `receipts.json`
records the exact download URLs, UTC receipt times, content types and SHA-256 hashes.
The Bank Rate recording covers January–October 2026; the production adapter requests
history from 1975. ONS recordings include the full source histories.

GDP reconciliation: the [August 2026 monthly GDP bulletin](https://www.ons.gov.uk/economy/grossdomesticproductgdp/bulletins/gdpmonthlyestimateuk/august2026),
released 15 October 2026, reports monthly growth of 0.4% in June, 0.4% in July and
0.1% in August. These match `gdp.csv` (MGDP/ECYX) for that release. June was revised
from 0.3%; July was unrevised. The bulletin distinguishes these monthly readings
from its 0.7% three-month growth figure.

The ONS series title refers to GVA, consistent with its output-based monthly GDP
methodology. ECYX's blank `Unit` is a reviewed exception; other units fail. Fixture
tests pin this reconciliation, not a promise that these historical values never
change. These are official-source recordings; synthetic changes are made only
inside tests and are never presented as source observations.

Source attribution: Bank of England, official Bank Rate database (IUDBEDR);
Office for National Statistics, Consumer price inflation time series (MM23/L55O)
and Monthly gross domestic product time series (MGDP/ECYX). See source URLs in the
receipts for reuse/licensing information. No third-party statistics are included.

## Recorded CPI and labour series (issue #50 qualification)

Four additional ONS JSON endpoints were recorded on 21 October 2026 as part of
the additive optional-metric reader work. These are exact recorded response
excerpts: values are unmodified, but bulk history is trimmed to representative
windows to keep the repository small. Each receipt records the full-response
SHA-256 and byte length alongside the excerpt hash, so the original recording can
be re-verified. These fixtures are labelled evidence; no adapter parses them yet
and they are not promoted to official production figures.

| File | Series | Recorded latest point | Unit | Geography (bulletins) |
| --- | --- | --- | --- | --- |
| `cpi_d7g7_mm23.json` | D7G7/MM23, `CPI ANNUAL RATE 00: ALL ITEMS 2015=100` | `2026 SEP` = `3.5` | `%` | United Kingdom |
| `regular_pay_nominal_kai9_lms.json` | KAI9/LMS, three-month average growth, SA, excluding arrears | `2026 AUG` = `3.7` | `%` | Great Britain |
| `regular_pay_real_a2fa_lms.json` | A2FA/LMS, three-month average growth, SA, real terms | `2026 AUG` = `0.6` | blank (recorded; see below) | Great Britain |
| `unemployment_mgsx_lms.json` | MGSX/LMS, unemployment rate aged 16+, SA | `2026 JUL`, label `2026 JUN-AUG` = `4.7` | `%` | United Kingdom |

Recorded contract facts (exact observations from the responses):

- `description.releaseDate` is a UTC instant at 23:00 the day before the UK
  calendar release (`2026-10-20T23:00:00.000Z` for CPI, `2026-10-19T23:00:00.000Z`
  for the labour series). Public precision must stay a Europe/London calendar
  date; the midnight encoding is not an announcement time. `nextRelease` is a
  human-readable string (`18 November 2026`, `17 November 2026`).
- MGSX `months[]` carries rolling-window labels: `2026 JUL` has label
  `2026 JUN-AUG`, and cross-year labels are recorded (`2025 OCT-DEC`,
  `2025 NOV-JAN`, `2025 DEC-FEB`). The label is the authoritative window and its
  end month is the canonical key (`2026 JUN-AUG` → `2026-08`). `date` is the
  middle month and is not the window end.
- KAI9/A2FA `months[]` labels are single months (`2026 AUG`). The October 2026
  Average weekly earnings bulletin states regular-pay growth was `3.7%` and real
  (CPIH-adjusted) regular-pay growth `0.6%`, both "in June to August 2026",
  matching the `2026 AUG` points. The label month is therefore the **ending
  month** of the three-month window (`2026 AUG` → June–August → `2026-06` to
  `2026-08`). This closes the pay ending-month rule for these series.
- A2FA's `unit` is a blank string in the recorded metadata. Its title declares
  percentage growth ("...Growth (%): Seasonally Adjusted Regular Pay"), and the
  bulletin's CPIH-adjusted 0.6% figure matches the recorded value, so blank is a
  reviewed series-specific exception; the wire contract still normalises to
  `percent`. A2FA is the CPIH-deflated regular-pay series, not the CPI-based X09
  supplementary dataset.
- Annual and quarterly arrays coexist with `months[]`; only `months[]` may enter
  monthly history. The labour responses populate no `years`/`quarters` at all.
- The structured seasonal-adjustment field is absent; validated titles and
  methodology establish adjustment. Values are decimal strings. No non-numeric
  missing token appears in the recorded excerpts; the missing-value grammar
  remains unobserved, so unknown tokens must quarantine a candidate feed.
- Per-point `updateDate` and the `versions[]` list are recorded. Their revision
  semantics are **not** verified: `updateDate` must not be used to order
  vintages. Per-dataset OGL reuse exceptions and full population notes remain
  open questions for the future adapters (issues #27–#29).

## Recorded CPI facts the D7G7 adapter binds to (issue #27)

The CPI adapter parses only the qualified JSON `/data` endpoint; the CPIH CSV
generator route is never substituted. Parsed contract facts from this recording:

- `description` binds the series: title `CPI ANNUAL RATE 00: ALL ITEMS 2015=100`,
  `cdid` `D7G7`, `datasetId` `MM23`, unit `%` with a blank `preUnit`. `keyNote`
  is "Change over 12 months", matching `year_on_year`.
- Geography is the United Kingdom: the [September 2026 CPI bulletin](https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/september2026)
  is "Consumer price inflation, UK", and CPI is a UK-wide measure. This is the
  reviewed `geography` for the public definition.
- The recorded excerpt's `months[]` is a 17-month representative subset that
  omits 2025 FEB, APR, AUG and DEC; the live endpoint's `months[]` is
  contiguous. Those omitted periods are excerpt-selection artefacts, retained
  deliberately so the adapter keeps only present months and the reader keeps
  gaps visible and never invents or zero-fills them. Absent expected months
  also make previous-month comparisons unavailable rather than guessed.
- Value tokens are decimal strings. No non-numeric missing token was recorded,
  so an empty, `..` or other unknown token quarantines the candidate feed; it
  never becomes zero or a synthetic "missing" observation.
- `releaseDate` (`2026-10-20T23:00:00.000Z`) converts to the Europe/London
  calendar date 2026-10-21; `nextRelease` (`18 November 2026`) parses to
  `2026-11-18`. Unrecognised formats fail collection rather than guessing.
- `years` and `quarters` arrays stay out of monthly history; `versions[]` and
  per-point `updateDate` are retained privately and never order vintages.

Official cross-checks retrieved 21 October 2026:

- [Average weekly earnings in Great Britain: October 2026](https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/averageweeklyearningsingreatbritain/october2026):
  "The annual growth rate in employees' average regular earnings (excluding
  bonuses) was 3.7% in June to August 2026" and "In real terms (adjusted for
  inflation using the Consumer Prices Index including owner occupiers' housing
  costs (CPIH)), annual regular pay growth ... at 0.6% in June to August 2026".
- [Labour market overview, UK: October 2026](https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/uklabourmarket/october2026):
  "The UK unemployment rate for people aged 16 years and over was estimated at
  4.7% in June to August 2026."
- [Consumer price inflation, UK: September 2026](https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/september2026):
  "The Consumer Prices Index (CPI) rose by 3.5% in the 12 months to
  September 2026."

`pipr_uk_monthly_price_statistics.xlsx` is a reduced, explicitly test-only
workbook projection from ONS's 21 October 2026 PIPR edition. It retains the
original UK `K02000001` row and the reviewed date/area/annual-change/rent-level
columns, plus the publication date. The original live workbook is versioned and
not checked in. This projection exercises the bounded workbook reader and must
never be treated as a full source archive or production data.

The receipt records the exact versioned ONS workbook URL, original response
length and SHA-256, its preserved local file timestamp, and the projection
length/hash and transformation. The HTTP response headers were not retained;
the timestamp is explicitly identified as local filesystem evidence. The
projection retains the workbook's underlying numeric cells. In the original
versioned workbook, the August and September 2026 UK growth cells serialize as
`3.836147` and `3.8052769999999998`. Both use cell style 39, custom format ID
164, format code `0.0`, so the reviewed workbook displays each as `3.8`. The
parser uses `Decimal` with `ROUND_HALF_UP` at one decimal place to match that
published precision. The canonical values used in storage, the homepage,
history and chart are therefore both `3.8`; raw source bytes and numeric cells
remain preserved in private source evidence. Rent levels are pounds per month
and are displayed as whole pounds, as in the bulletin.

The extracted UK Table 1 growth and rent-level cells contain `[x]` as a missing
token. The parser treats `[x]` and a structurally absent observation cell as
missing; it does not interpret an empty cell value or `[z]` as missing. Empty
cell values and `[z]` were not observed and fail validation. Geography, units, latest-month provisional
status and Northern Ireland imputation/revision caveats are supported by the
[pinned October 2026 bulletin](https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/privaterentandhousepricesuk/october2026),
the [PIPR QMI](https://www.ons.gov.uk/peoplepopulationandcommunity/housing/methodologies/priceindexofprivaterentsqmi)
and [detailed methodology](https://www.ons.gov.uk/economy/inflationandpriceindices/methodologies/priceindexofprivaterentsdetailedmethodology).
