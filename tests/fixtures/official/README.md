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
