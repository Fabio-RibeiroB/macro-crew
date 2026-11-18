# CPI index (D7BT) qualification

Status: source qualified against the live ONS endpoint on 18 November 2026, for
issue [#134](https://github.com/Fabio-RibeiroB/macro-crew/issues/134) (spec M11
slice 1). Qualification is not deployment: the series is collected by the
deterministic collector only after a reviewed release is deployed.

## Purpose

The CPI index level is the deflator for one FinStats calculation: the UK average
house price in the prices of a stated base month. It is optional. If it is absent or
fails validation, every other metric still publishes and the Housing page hides the
after-inflation chart with a short note.

## Source

| Item | Value |
| --- | --- |
| Series | D7BT, `CPI INDEX 00: ALL ITEMS 2015=100` |
| Dataset | MM23, Consumer price inflation (the same release and endpoint family as CPI D7G7) |
| Series page | <https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7bt/mm23> |
| Collected from | <https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7bt/mm23/data> (structured JSON, the same reviewed route as `cpi`) |
| Unit | Index, 2015 = 100 (`description.unit` is `Index, base year = 100`, `keyNote` is `Index, 2015 = 100`; public unit `index_2015_100`) |
| Geography | United Kingdom (CPI is a UK-wide measure, as for D7G7) |
| Frequency and adjustment | Monthly, not seasonally adjusted, level |
| Licence | ONS Open Government Licence terms, as for the other ONS series; not separately re-checked for this series |

## Live check, 18 November 2026

A read-only `GET` of the endpoint above returned HTTP 200, 126,632 bytes. The
collector's own `fetch` and `parse` accepted it (with the check date set to 18
November 2026).

* `releaseDate` `2026-11-18T00:00:00.000Z`; `nextRelease` `16 December 2026`.
* 466 monthly observations, contiguous, from `1988 JAN` (48.4) to `2026 OCT` (144.9).
* Latest period `2026 OCT`; the three earlier months are `2026 JUL` 142.9, `2026 AUG`
  143.6 and `2026 SEP` 144.1.
* Annual and quarterly arrays are present and, as for CPI, stay out of monthly
  history.
* Cross-check against the recorded CPI annual rate: `2026 SEP` 144.1 against
  `2025 SEP` 139.3 is 3.4% from the rounded published indices, against 3.5% published
  for D7G7. The difference is rounding of the published index values.

The ONS series is revised rarely; revisions and the full history are retained by the
existing revision store like every other metric. Per-point `updateDate` is not used
to order vintages.

## Recorded fixture

`tests/fixtures/official/cpi_index_d7bt_mm23.json` is the archived ONS version `v133`
of this series. It was the live series from the 21 October 2026 release until the 18
November release, so it matches the other recordings (CPI to `2026 SEP`) and the
fixture clock. The 18 November response cannot be replayed under that clock because
its release date lies in the future. The excerpt keeps 2016 JAN to 2026 SEP
contiguous (the UK HPI fixture window), the last 12 quarters, the last 8 versions and
the description and years in full. Values are unmodified; only the top-level `uri` was
rewritten from `/previous/v133` to the live series path so the fixture binds to the
qualified endpoint. `receipts.json` records the full-response hash, byte length and
this note. The recording is fixture evidence and is never published as official
production data.

## Parser contract

`parse_ons_json` binds the title, `cdid` `D7BT`, `datasetId` `MM23`, the series `uri`
and the unit `Index, base year = 100` with an empty `preUnit`, and requires
`keyNote` `Index, 2015 = 100`. An empty, `..` or unknown value token quarantines the
feed; a missing month stays absent, never zero. Collection of D7BT is independent:
a failure leaves the last verified series as degraded, or unavailable if never
collected, and does not block other metrics.

## The calculation

Shown on Housing under House prices, labelled as a FinStats calculation:

```text
real price(month) = nominal price(month) x CPI index(base month) / CPI index(month)
```

The nominal price is `house_price_level` (UK HPI average price). The base month is
the latest month present in both series; with the recorded data that is August 2026,
because UK HPI ends in August while the index runs to September. A month missing or
unusable in either series is a gap. Values are rounded to whole pounds. No modelled
affordability, deposit or repayment assumption is involved.
