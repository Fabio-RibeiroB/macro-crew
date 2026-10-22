# M4 DESNZ weekly fuel qualification — 22 October 2026

**Status:** source-qualified and implemented in this candidate; not deployed.
Fuel observations remain two independent optional metric members. The current
release process must activate the candidate reader before a publisher can emit
either new member.

## Source and interpretation

- Bounded discovery uses only the [DESNZ Weekly road fuel prices page](https://www.gov.uk/government/statistics/weekly-road-fuel-prices)
  and its `assets.publishing.service.gov.uk` CSV attachment. The collector selects
  the current `Weekly road fuel prices (CSV) 2018 to YYYY` attachment from that
  page and accepts only the reviewed filename family. It does not pin a media ID,
  follow arbitrary links, or use the workbook as numerical input.
- The captured page's `dateModified` is 20 October 2026. `datePublished` is the
  original 2013 page publication and is not used as this edition's release date.
  Private receipts preserve both the page and exact CSV bytes, hashes, URLs,
  retrieval times, selected link and parsed edition date. Each fuel attempt has
  its own receipt even though one current CSV response serves both parsers.
- CSV URL:
  `https://assets.publishing.service.gov.uk/media/6ad63e7d49ba86d6c953cc40/CSV__2018_-__.csv`
  (20,502 bytes; SHA-256
  `077d97956f07d931153e6e9695232f99cee58c12a7426ade55452b3b1f8abc92`). The
  UTF-8 BOM and seven exact headers are checked. Only the named unleaded petrol
  and diesel **pump price in pence/litre** columns supply values. The two duty
  and two VAT columns remain in the retained original bytes and are never added
  to or substituted for the pump price.
- Current workbook:
  `https://assets.publishing.service.gov.uk/media/6ad63e71e5db84746b479882/Weekly_Fuel_Prices_19-10-26.xlsx`
  (261,039 bytes; SHA-256
  `dbe582dacc719f54b147ad6d11b5cd276098b8996457accf2526e1a3ba4bdf91`). Its
  notes describe the weighted UK sample: six companies and around 60% of market
  volume using 2022 sales. Sampling is Monday morning or the next working morning
  on bank holidays. The Monday stays the canonical week reference; the data does
  not assert which morning the sample was taken. These national values are not
  local forecourt quotes.
- The full CSV has 460 unique Mondays from 1 January 2018 through 19 October
  2026. Dates are parsed as `DD/MM/YYYY`; prices are decimals and blank, `..` or
  `...` are missing, never zero. An unknown token, changed header, non-Monday,
  duplicate date or missing latest price quarantines that series. A missing
  intervening week remains a chart gap and cannot support an adjacent-week
  comparison. A failed series retains its own prior accepted history.
- The capture's latest values are 174.57p/litre petrol and 199.33p/litre diesel;
  the previous reference week's values are 175.28p and 200.04p. These are
  fixture qualification examples, not maintained current figures. Both series
  use the source's pump-price tax treatment. Exact CSV, workbook, release page
  and fixture receipt are retained under `tests/fixtures/official/`.

The [DESNZ landing page](https://www.gov.uk/government/statistics/weekly-road-fuel-prices)
states the Open Government Licence v3.0 applies unless otherwise stated. The
captured page showed no exception. The older [road fuel source-methodology
publication](https://www.gov.uk/government/publications/road-fuel-price-statistics-data-sources-and-methodologies)
is not used to override the current workbook's sample notes.

## Reader and rollout

The optional reader contract registers each fuel identity, exact definition,
weekly reference shape, unit, source page, dynamic bounded attachment host and
sampling/tax basis. The reader requires Monday reference dates and validates
latest against the same history point. It derives changes from the prior
comparable week using decimal arithmetic and preserves gaps. It rejects unknown
units, source shapes, or period metadata for the whole generation.

The candidate was replayed through the real `collect → publish → deliver` path
using labelled recorded fixtures, then passed through the strict application
reader. Fixture evidence remains `recorded_fixture` and delivery rejects it;
the checked-in producer fixture represents only the reviewed wire contract.
No production feed, manifest or deployment was changed.

Deploy the candidate reader while the old publisher remains active. Only after
the candidate reader is serving may the publisher emit `petrol_price` and
`diesel_price`. The currently deployed reader does not register those keys and
rejects unknown metrics, so it must never receive a generation containing them.
For rollback, stop and wait for the new publisher; restore the prior public
manifest while preserving immutable generations; restore the previous frontend
and compatible publisher source; then resume the previous timer. Retain the
private database, fuel receipts, raw source archive and generated production
reports. Do not downgrade or delete source history.

## Weekly age warning

A successful source check does not establish that the attachment advanced. The
reader warns independently for each fuel when its Monday reference is at least
14 London-calendar days old, even after successful polling. This conservative
FinStats age threshold allows for routine publication and bank-holiday timing;
it is not an asserted official next-release date. Prior verified figures remain
visible. Each fuel also displays its own release date and successful check time.
