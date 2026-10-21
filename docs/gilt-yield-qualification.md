# Gilt-yield qualification

Status: source comparison for an owner decision. Checked 21 October 2026.
This note does not select a series and does not authorise building the yield feed.

Issue [#37](https://github.com/Fabio-RibeiroB/macro-crew/issues/37) stays blocked until the owner records which family may be implemented. The comparison below is the evidence for that decision. It follows the gate in the [FinStats UK specification](https://github.com/Fabio-RibeiroB/macro-crew/pull/22) and issue [#38](https://github.com/Fabio-RibeiroB/macro-crew/issues/38).

**The owner must decide before #37 is built.** The recommendation is the Bank of England daily nominal par yields at 5, 10 and 20 years. A nominal par family at 2, 10 and 30 years was not verified. The 10-year par yield is available, and it belongs to the 5/10/20 family below.

## Definition used for the comparison

A nominal par yield here means the Bank's par yield on conventional gilts: the coupon a hypothetical stock would have to bear to be priced at par. The Bank stated that concept in the [February 1990 Quarterly Bulletin](https://www.bankofengland.co.uk/quarterly-bulletin/1990/q1/a-new-yield-curve-model). The current series note and the Bank's [yields explanatory note](https://www.bankofengland.co.uk/statistics/details/further-details-about-yields-data) both say these par yields are calculated with the variable roughness penalty (VRP) model, described in the [November 1999 Quarterly Bulletin article](https://www.bankofengland.co.uk/-/media/boe/files/quarterly-bulletin/1999/new-estimates-of-the-uk-real-and-nominal-yield-curves.pdf) and the [2001 working paper](https://www.bankofengland.co.uk/working-paper/2001/new-estimates-of-the-uk-real-and-nominal-yield-curves). The February 1990 article describes an earlier estimator. It is cited for the meaning of "par yield", while the series footnote identifies the estimator now named on the data.

Spot rates, zero-coupon yields, instantaneous forward rates and redemption yields on a named benchmark gilt are different concepts. They are documented in later sections so a later feed cannot treat them as this par family. A maturity is recorded as available only where a Bank or DMO page, or a file downloaded for this check, showed it.

## Recommended family, pending the owner

Bank of England interactive database, daily nominal par yields:

| Maturity | Series code | Official title | Frequency | History in the 21 October 2026 download |
| --- | --- | --- | --- | --- |
| 5 year | IUDSNPY | Yield from British Government Securities, 5 year Nominal Par Yield | Daily, published weekdays | 1 December 1993 to 19 October 2026; 8,308 observations |
| 10 year | IUDMNPY | Yield from British Government Securities, 10 year Nominal Par Yield | Daily, published weekdays | 1 November 1993 to 19 October 2026; 8,330 observations |
| 20 year | IUDLNPY | Yield from British Government Securities, 20 year Nominal Par Yield | Daily, published weekdays | 4 January 2000 to 19 October 2026; 6,771 observations |

The three histories do not start together. A chart or comparison that uses all three maturities can start on 4 January 2000. Earlier 5-year and 10-year observations have no 20-year partner in this family. The 5-year series itself starts a month after the 10-year series.

Catalogue entry and titles: [search for "Nominal Par Yield"](https://www.bankofengland.co.uk/boeapps/database/FromShowColumns.asp?SearchText=Nominal+Par+Yield). That search returns par yields at 5, 10 and 20 years only, plus unrelated repo series whose codes contain the letters RPAR. Searches for a 2-year, 15-year, 25-year, 30-year and 40-year nominal par yield returned those repo series and no gilt par-yield code.

Series viewer used for the footnote and the latest observations: [IUDSNPY, IUDMNPY and IUDLNPY](https://www.bankofengland.co.uk/boeapps/database/fromshowcolumns.asp?Travel=NIxAZxSUx&FromSeries=1&ToSeries=50&DAT=RNG&FD=1&FM=Jan&FY=2026&TD=21&TM=Oct&TY=2026&FNY=Y&CSVF=TT&html.x=66&html.y=26&SeriesCodes=IUDSNPY,IUDMNPY,IUDLNPY&UsingCodes=Y&Filter=N&title=par&VPD=Y).

Download checked:

`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/1970&Dateto=21/Oct/2026&SeriesCodes=IUDSNPY,IUDMNPY,IUDLNPY&CSVF=CN&UsingCodes=Y&VPD=Y`

The CSV header is `DATE`, `SERIES`, `VALUE`. Dates are weekdays. The file contains no Saturday or Sunday observations and no blank values. The longest gap in each series is five calendar days, which matches holiday weekends; this check did not reconcile every gap to the bank-holiday calendar. The CSV does not pad to a fixed number of decimal places. Most values have four decimal places, and some have fewer. On 19 October 2026 the observations are IUDSNPY 4.9678, IUDMNPY 5.374 and IUDLNPY 5.7108. The viewer does not print a unit caption. The figures are on the same annual percentage scale as the Bank's yield-curve sheets: a reading of 5.374 is 5.374 per cent.

Each series carries footnote [a]: "Calculated using the Variable Roughness Penalty (VRP) model."

The [yields explanatory note](https://www.bankofengland.co.uk/statistics/details/further-details-about-yields-data), last updated 3 July 2025, says the par yields in that table are derived from VRP estimates of the term structure, that this replaced earlier models and that all data in the table were re-estimated. It excludes index-linked stocks, irredeemable stocks, double-dated stocks, stocks with embedded options, and variable and floating stocks. It says conventional dated stocks with a significant amount in issue and more than one year to maturity are used, together with general collateral repo at the short end, and that a 20-year yield is not quoted for dates when no gilt longer than 20 years existed. The same note then says the quoted values in that table are end-month averages for 1970–1978 and quarterly averages of working days from 1979. That frequency sentence describes the table in the note. It does not describe IUDSNPY, IUDMNPY or IUDLNPY: the download of those three codes is a weekday series beginning in 1993 or 2000.

The current [yield-curve terminology](https://www.bankofengland.co.uk/statistics/yield-curves/terminology-and-concepts) describes the inputs to the nominal spot curve as conventional dated stocks with more than three months to maturity, plus general collateral repo at the short end, and says repo has been used for that short end since March 1997. The one-year and three-month cut-offs are both printed on Bank pages. This check did not test the par series for a break at March 1997. The overlapping 5/10/20 history from 4 January 2000 sits after that date. Green gilts are not in the current gilt-curve fitting, as stated on the [yield curves page](https://www.bankofengland.co.uk/statistics/yield-curves).

These par series are fitted curve yields. They are not the redemption yield of one benchmark bond.

### Same par definition at other frequencies

The same catalogue search lists month-average, end-month, quarterly-average, end-quarter, annual-average and end-year par yields, again only at 5, 10 and 20 years. Their histories were not downloaded. They are a different publication frequency from the daily family. Official titles are quoted as the catalogue prints them, including "Stock" and "Securities".

| Code | Catalogue title |
| --- | --- |
| IUMASNPY | Monthly average yield from British Government Securities, 5 year Nominal Par Yield |
| IUMAMNPY | Monthly average yield from British Government Securities, 10 year Nominal Par Yield |
| IUMALNPY | Monthly average yield from British Government Securities, 20 year Nominal Par Yield |
| IUMSNPY | End month level of yield from British Government Securities, 5 year Nominal Par Yield |
| IUMMNPY | End month level of yield from British Government Stock, 10 year Nominal Par Yield |
| IUMLNPY | End month level of yield from British Government Stock, 20 year Nominal Par Yield |
| IUQASNPY | Quarterly average yield from British Government Securities, 5 year Nominal Par Yield |
| IUQAMNPY | Quarterly average yield from British Government Securities, 10 year Nominal Par Yield |
| IUQALNPY | Quarterly average yield from British Government Securities, 20 year Nominal Par Yield |
| IUQSNPY | End quarter level of yield from British Government Securities, 5 year Nominal Par Yield |
| IUQMNPY | End quarter level of yield from British Government Stock, 10 year Nominal Par Yield |
| IUQLNPY | End quarter level of yield from British Government Stock, 20 year Nominal Par Yield |
| IUAASNPY | Annual average yield from British Government Securities, 5 year Nominal Par Yield |
| IUAAMNPY | Annual average yield from British Government Securities, 10 year Nominal Par Yield |
| IUAALNPY | End year average yield from British Government Securities, 20 year Nominal Par Yield |
| IUASNPY | End year level of yield from British Government Securities, 5 year Nominal Par Yield |
| IUAMNPY | End year level of yield from British Government Stock, 10 year Nominal Par Yield |
| IUALNPY | End year level of yield from British Government Stock, 20 year Nominal Par Yield |

### Revision policy

The [yields note](https://www.bankofengland.co.uk/statistics/details/further-details-about-yields-data) says the move to the VRP model replaced earlier models and that all data in that par-yield table were re-estimated.

The Bank's [revisions note](https://www.bankofengland.co.uk/statistics/details/further-details-about-revisions) and [Statistical Code of Practice](https://www.bankofengland.co.uk/-/media/boe/files/statistics/statistical-code-of-practice.pdf) (section 3.4) say revisions are applied at the earliest opportunity, usually the next scheduled release. Revisions from extra or corrected information rarely go back more than two years. Methodological changes can be applied as far back as is practical, with advance or simultaneous notice. Minor revisions are not normally flagged. The [database help](https://www.bankofengland.co.uk/boeapps/database/Help.asp) says new and revised observations can be marked; that filter has been available since 3 June 2007.

The [yield curves page](https://www.bankofengland.co.uk/statistics/yield-curves) says curve estimates are revised when the instruments included in the calculation change, and that archive updates are published by the close of the second working day of each month. The 2017 example on that page is a real-yield price convention. It is not evidence about these nominal par series. The [Database terms](https://www.bankofengland.co.uk/legal) allow the Bank to change methods and publication timing without notice, and they give no assurance that a series will continue.

The curve workbook described below carries a separate 21 December 2004 revision note. That sentence refers to the data on that spreadsheet. The spreadsheet has no par-yield sheet, so this check does not treat 21 December 2004 as a proven revision date for IUDSNPY, IUDMNPY or IUDLNPY.

### Publication timing

The yield curves page says the Bank aims to publish the latest daily curves by noon on the following business day. There is no API for the curve files. The database help says the more detailed curve files are updated on the following working day and cover a wider range of maturities than the database extracts.

On 21 October 2026 the daily par CSV ended on 19 October 2026. A repeat download of IUDMNPY later the same day still ended on 19 October. The current-month nominal curve workbook, file time 10:05 on 21 October 2026, already contained 20 October for its spot and forward sheets. The database par series and the curve workbook were not on the same latest date during this check.

### Reuse and licence

Reproduction of Bank of England Database series is under the UK Open Government Licence, as stated in the [Bank's legal terms](https://www.bankofengland.co.uk/legal). The licence text is the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Copyright in the Database remains with the Governor and Company of the Bank of England unless otherwise stated. The stated exclusions are selected exchange-rate series and monetary-financial-institution data for the Isle of Man, Guernsey and Jersey. Those exclusions do not name these gilt par yields.

The yield-curve workbook names Bloomberg Finance L.P., Tradeweb and Bank calculations as sources. The legal terms leave third-party copyright with the originating organisation. This qualification covers the Bank's published database series. It does not cover republication of underlying vendor prices.

## 2-, 10- and 30-year nominal par yields

No maintained official nominal par series was verified at 2 years or at 30 years, so there is no 2/10/30 par family to download. The 10-year nominal par yield is IUDMNPY, in the 5/10/20 family above.

The Bank database searches above returned no 2-year or 30-year nominal par code at any frequency. The current-month nominal government liability workbook has no par-yield sheet. The [DMO report D4H](https://www.dmo.gov.uk/data/ExportReport?reportCode=D4H) says the DMO does not publish historical rates from its own yield-curve model and points readers to the Bank's yield-curve page. That Bank page publishes spot and instantaneous forward curves, which are a different definition, documented next.

Annual reviews and debt-management reports can discuss 2-year and 30-year par yields in prose or charts. A chart in a review is not a series code, a download contract or a revision policy, so it is not an alternative feed.

## Other official material, different yield concepts

These publications are official and some of them contain 2-year or 30-year maturities. None is a nominal par yield at 2, 10 and 30 years. They are recorded so the maturity labels cannot be reused for the par family.

### Bank nominal spot curve and nominal zero-coupon database series

The [yield curves page](https://www.bankofengland.co.uk/statistics/yield-curves) publishes estimated curves by noon on the following business day where possible. The current-month file checked is inside [latest-yield-curve-data.zip](https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip), named `GLC Nominal daily data current month.xlsx`, timestamped 21 October 2026 10:05. Its sheets are `info`, `1. fwds, short end`, `2. fwd curve`, `3. spot, short end` and `4. spot curve`. There is no par sheet.

On `4. spot curve`, columns exist at half-year maturities from 0.5 through 40 years, including 2, 5, 10, 20, 30 and 40. For every business day from 1 October through 20 October 2026, the 2-, 10-, 30- and 40-year spot cells are populated. Weekends in that span are absent. This check did not open the full daily archive, [glcnominalddata.zip](https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/glcnominalddata.zip), so it does not establish the first date on which a 2-year or 30-year spot is present. The terminology page says nominal government curves are available daily from 2 January 1979, with gaps where no gilt covers the maturity or the curve is not stable. The workbook info sheet says that from 4 January 2016 the nominal curve is published out to 40 years. The terminology page still describes a 25-year half-yearly grid; the file and the yield-curve FAQ describe the later 40-year cut-off.

[Terminology](https://www.bankofengland.co.uk/statistics/yield-curves/terminology-and-concepts) defines the nominal government spot rate at n years as the rate on an n-year risk-free nominal loan, the yield to maturity of a nominal zero-coupon bond. The FAQ on the yield curves page says spot and forward yields are continuously compounded and quoted annually. Day count for UK government bonds is Actual/Actual since November 1998 and Actual/365 before that.

The database also publishes nominal zero-coupon yields, and the catalogue search for ["Nominal Zero Coupon"](https://www.bankofengland.co.uk/boeapps/database/FromShowColumns.asp?SearchText=Nominal+Zero+Coupon) returns 5, 10 and 20 years only. No 2-year or 30-year nominal zero-coupon code was returned. Daily codes:

| Maturity | Series code | Official title |
| --- | --- | --- |
| 5 year | IUDSNZC | Yield from British Government Securities, 5 year Nominal Zero Coupon |
| 10 year | IUDMNZC | Yield from British Government Securities, 10 year Nominal Zero Coupon |
| 20 year | IUDLNZC | Yield from British Government Securities, 20 year Nominal Zero Coupon |

The same search lists monthly, quarterly and annual averages and end-period levels at those three maturities only. Their histories were not downloaded.

On 1 and 2 October 2026, IUDSNZC, IUDMNZC and IUDLNZC match the workbook spot rates at 5, 10 and 20 years after rounding to four decimal places. The largest difference before that rounding, on those six points, was under 0.00005. The par yields on the same dates are different numbers. On 1 October 2026:

| Concept | 5 year | 10 year | 20 year | 2 year | 30 year |
| --- | --- | --- | --- | --- | --- |
| Nominal par, database | 4.9132 | 5.3665 | 5.752 | No series verified | No series verified |
| Nominal zero coupon, database | 4.9224 | 5.424 | 6.0143 | No series verified | No series verified |
| Nominal spot, workbook | 4.9224 when rounded | 5.4240 when rounded | 6.0143 when rounded | 4.6008 when rounded | 6.0393 when rounded |

The 10-year par and 10-year zero-coupon readings differ by 0.0575 percentage points on that day. A 2-year or 30-year column on the spot sheet is a continuously compounded zero-coupon rate, not a par yield, and it has no verified nominal-par series code.

Revision and storage for the curve files are on the [yield curves page](https://www.bankofengland.co.uk/statistics/yield-curves): revisions follow changes in the instruments used; the workbook info sheet says the spreadsheet data were revised on 21 December 2004 back to the beginning of November 1998. The FAQ allows electronic storage when the [copyright terms](https://www.bankofengland.co.uk/legal) are met, and it says there is no curve API. Those workbook terms are the general website terms, which allow download, display and print for personal or internal non-commercial use unless a more specific licence applies. They are not the Database Open Government Licence that covers IUDSNPY, IUDMNPY and IUDLNPY. Bloomberg and Tradeweb are named sources on the workbook.

### Bank instantaneous nominal forward curve

The same workbook sheet `2. fwd curve` has columns at 2, 5, 10, 20, 30 and 40 years, populated on the same October 2026 business days as the spot sheet. The [yield curves FAQ](https://www.bankofengland.co.uk/statistics/yield-curves) says these are instantaneous forwards: the 2-year column is the instantaneous rate two years ahead, not the yield on a 2-year loan. On 1 October 2026 that column is about 4.9352, against a 2-year spot of about 4.6008 and no verified 2-year par yield. Forwards use the same file, revision note, sources and website terms as the spot sheet.

### DMO benchmark redemption yields, report D4H

[Report D4H](https://www.dmo.gov.uk/data/ExportReport?reportCode=D4H), linked from [aggregated gilt yields](https://www.dmo.gov.uk/data/gilt-market/aggregated-yields/), is the official monthly benchmark series. It is not a nominal par curve and it does not contain a 2-year maturity.

| Item | What the DMO page states |
| --- | --- |
| Identifier | Report code D4H. The overview does not give separate series codes for each maturity. Excel and Word export are offered from the report form. This check used the report text and did not download a workbook. |
| Frequency | Monthly. Each figure is the simple average of daily close-of-business yields in that month. |
| History | The report says it has been calculated since April 1998. The form's year list starts in 1998. |
| Maturities | Prevailing 5-year, 10-year and 30-year benchmark gilts. From June 2005, a 50-year benchmark as well. Before April 1999 the long yield is the prevailing 20-year benchmark, not the 30-year. No 2-year benchmark is listed. |
| Definition | Gross redemption yield of the prevailing benchmark gilt, using the DMO's published gilt price-from-yield formulae. The benchmark bond changes through time, so the residual maturity is not a fixed point on a fitted par curve. |
| Inputs | From 24 July 2017, daily yields derived from Tradeweb FTSE Gilt Closing Prices. Before that, GEMMA reference prices. |
| Curve model | The DMO states that it does not publish historical rates from its yield-curve model. |
| Revisions | The report page does not state a revision timetable. The [historical prices page](https://www.dmo.gov.uk/data/gilt-market/historical-prices-and-yields/) says errors in the older DMO reference prices were corrected on a best-endeavours basis. |
| Licence | [DMO terms of use](https://www.dmo.gov.uk/terms-of-use/): Crown copyright, reuse under the Open Government Licence unless otherwise stated, excluding logos. D4H says use assumes those terms. Daily reference prices since 24 July 2017 are produced by FTSE-Tradeweb; the historical-prices page says non-commercial access is free from the following noon and commercial use is arranged with Tradeweb. |

### ONS and OECD

ONS does not currently publish this par family. The monthly Financial Statistics publication was discontinued in August 2011. The [data-sources note](https://www.ons.gov.uk/economy/nationalaccounts/uksectoraccounts/methodologies/financialstatisticsdatasources) sends the old interest-rate and securities-price tables to the Bank of England database and to DMO gilt prices. No ONS series code for a 2-, 10- or 30-year nominal par yield was found.

The OECD indicator [long-term interest rates](https://www.oecd.org/en/data/indicators/long-term-interest-rates.html) is defined as government bonds maturing in ten years, generally as averages of daily rates. The indicator page does not publish a UK series code and does not provide a 2-year or 30-year par yield. It is not a candidate.

## Recommendation

Use the daily nominal par family IUDSNPY, IUDMNPY and IUDLNPY if the owner accepts a change of maturities from 2/10/30 to 5/10/20.

That family is one definition at three fixed maturities, with a public series code, a weekday history, a stated estimator, a revision policy and Database Open Government Licence terms. The 10-year yield remains in the family. The 5-year replaces the requested 2-year, and the 20-year replaces the requested 30-year. Joint history starts on 4 January 2000 because that is the first IUDLNPY observation. The specification's proposal to show the 10-year yield as the primary maturity still fits this family, and it is part of the same owner decision.

Keeping 2/10/30 would require a source this check did not find. The 2-year and 30-year columns on the Bank spot and forward sheets, the 5/10/20 zero-coupon codes, and DMO report D4H each fail the same-definition test. Building a local par curve, or relabelling a spot or forward rate as a par yield, is outside this qualification.

The owner decision, before any work on #37, needs to record:

1. The selected codes, or an explicit rejection of this family.
2. Acceptance that the maturities are 5, 10 and 20 years, and that the three series share a history only from 4 January 2000.
3. Acceptance that the figures are fitted nominal par yields, so the Government page describes market financing conditions at those maturities rather than the average cost of debt already issued.

Until that decision is recorded, #37 remains blocked. Debt statistics are independent of this gate.
