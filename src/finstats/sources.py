"""Reviewed contracts and pure parsers for official UK statistical series."""
from __future__ import annotations

import csv
import io
import json
import calendar
from html.parser import HTMLParser
import re
import zipfile
import zlib
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

MAX_BYTES = 2_000_000
MAX_PIPR_BYTES = 25_000_000
MAX_SOURCE_PAGE_BYTES = 2_000_000
MAX_HPI_BYTES = 10_000_000
MAX_FUEL_BYTES = 2_000_000
MAX_OFGEM_BYTES = 2_000_000
PARSER_VERSION = 1
MONTHS = {name: index for index, name in enumerate(
    ('JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'), 1)}


class ValidationError(ValueError):
    """Source evidence does not meet the reviewed metric contract."""


@dataclass(frozen=True)
class Definition:
    metric_id: str
    series: str
    dataset: str
    title: str
    frequency: str
    adjustment: str
    comparison: str
    source_url: str
    download_url: str
    unit: str = 'percent'
    version: int = 1


ONS = 'https://www.ons.gov.uk'
BOE = 'https://www.bankofengland.co.uk'
GILT_SERIES = ('IUDSNPY', 'IUDMNPY', 'IUDLNPY')
GILT_DOWNLOAD_URL = BOE + '/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=04/Jan/2000&Dateto=now&SeriesCodes=' + ','.join(GILT_SERIES) + '&CSVF=CN&UsingCodes=Y'
OFGEM_TDCV_URL = 'https://www.ofgem.gov.uk/sites/default/files/2026-05/Review%20of%20typical%20domestic%20consumption%20values%20decision.pdf'
OFGEM_TDCV_SOURCE_SHA256 = '009eb2ebe4979e1691d1900ad9d05e79f655eeada1801b8c6eed2f7a49a19ec9'
OFGEM_TDCV_EFFECTIVE = '2026-07-01'
OFGEM_MEDIUM_SINGLE_RATE_ELECTRICITY_KWH = 2500
OFGEM_MEDIUM_GAS_KWH = 9500
UNEMPLOYMENT_QUALITY = {
    'quality_note': "The Labour Force Survey unemployment rate's 95% confidence intervals remain wider than before the pandemic.",
    'quality_source_url': ONS + '/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/articles/labourforcesurveyqualityupdate/october2026',
}


def ons_definition(metric_id, series, dataset, title, path, adjustment, comparison):
    uri = f'{path}/timeseries/{series.lower()}/{dataset.lower()}'
    return Definition(metric_id, series, dataset, title, 'monthly', adjustment,
                      comparison, ONS + uri, ONS + '/generator?format=csv&uri=' + uri)


DEFINITIONS = {
    'bank_rate': Definition(
        'uk.bank_rate.daily', 'IUDBEDR', 'IADB', 'Official Bank Rate', 'daily',
        'not_applicable', 'level_per_annum', BOE + '/boeapps/database/',
        BOE + '/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes'
        '&Datefrom=01/Jan/1975&Dateto=now&SeriesCodes=IUDBEDR&CSVF=CN&UsingCodes=Y'),
    'cpih': ons_definition('uk.cpih.annual_rate', 'L55O', 'MM23',
        'CPIH ANNUAL RATE 00: ALL ITEMS 2015=100',
        '/economy/inflationandpriceindices', 'not_seasonally_adjusted', 'year_on_year'),
    'gdp': ons_definition('uk.gdp.monthly_growth', 'ECYX', 'MGDP',
        'Gross Value Added - Monthly (period on period growth) :CVM SA',
        '/economy/grossdomesticproductgdp', 'seasonally_adjusted', 'month_on_month'),
    # CPI is the reviewed qualified JSON /data endpoint; do not substitute the
    # CPIH CSV generator route. The JSON interface is the settled contract.
    'cpi': Definition(
        'uk.cpi.annual_rate', 'D7G7', 'MM23',
        'CPI ANNUAL RATE 00: ALL ITEMS 2015=100',
        'monthly', 'not_seasonally_adjusted', 'year_on_year',
        ONS + '/economy/inflationandpriceindices/timeseries/d7g7/mm23',
        ONS + '/economy/inflationandpriceindices/timeseries/d7g7/mm23/data'),
    'regular_pay_nominal_growth': Definition(
        'uk.regular_pay.nominal_annual_growth', 'KAI9', 'LMS',
        'AWE: Whole Economy Year on Year Three Month Average Growth (%): Seasonally Adjusted Regular Pay Excluding Arrears',
        'monthly', 'seasonally_adjusted', 'year_on_year',
        ONS + '/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kai9/lms',
        ONS + '/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kai9/lms/data'),
    'regular_pay_real_growth': Definition(
        'uk.regular_pay.real_annual_growth', 'A2FA', 'LMS',
        'AWE: Whole Economy Real Terms Year on Year three Month Growth (%): Seasonally Adjusted Regular Pay',
        'monthly', 'seasonally_adjusted', 'year_on_year',
        ONS + '/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/a2fa/lms',
        ONS + '/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/a2fa/lms/data'),
    'unemployment': Definition(
        'uk.unemployment.rate', 'MGSX', 'LMS',
        'Unemployment rate (aged 16 and over, seasonally adjusted): %',
        'monthly', 'seasonally_adjusted', 'level',
        ONS + '/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms',
        ONS + '/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms/data'),
    'private_rent_growth': Definition(
        'uk.private_rent.annual_growth', 'Annual change',
        'Price Index of Private Rents, UK: monthly price statistics, Table 1',
        'Annual percentage change in private rent', 'monthly', 'not_seasonally_adjusted',
        'year_on_year', ONS + '/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics',
        ONS + '/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics',
        unit='percent'),
    'private_rent_level': Definition(
        'uk.private_rent.monthly_level', 'Rental price',
        'Price Index of Private Rents, UK: monthly price statistics, Table 1',
        'Average monthly private rent', 'monthly', 'not_seasonally_adjusted',
        'level', ONS + '/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics',
        ONS + '/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics',
        unit='GBP_per_month'),
    'house_price_level': Definition(
        'uk.house_price.average_level', 'Average_Price', 'UK House Price Index: Average price',
        'Average house price', 'monthly', 'not_seasonally_adjusted', 'level',
        'https://www.gov.uk/government/collections/uk-house-price-index-reports',
        'https://www.gov.uk/government/statistical-data-sets/uk-house-price-index-data-downloads',
        unit='GBP'),
    'house_price_growth': Definition(
        'uk.house_price.annual_change', 'Annual_Change', 'UK House Price Index: Average price',
        'Annual change in average house price', 'monthly', 'not_seasonally_adjusted',
        'year_on_year', 'https://www.gov.uk/government/collections/uk-house-price-index-reports',
        'https://www.gov.uk/government/statistical-data-sets/uk-house-price-index-data-downloads',
        unit='percent'),
    'petrol_price': Definition(
        'uk.road_fuel.unleaded_petrol_price', 'ULSP pump price',
        'Weekly road fuel prices', 'UK average unleaded petrol pump price',
        'weekly', 'not_applicable', 'previous_comparable_observation',
        'https://www.gov.uk/government/statistics/weekly-road-fuel-prices',
        'https://www.gov.uk/government/statistics/weekly-road-fuel-prices',
        unit='pence_per_litre'),
    'diesel_price': Definition(
        'uk.road_fuel.diesel_price', 'ULSD pump price',
        'Weekly road fuel prices', 'UK average diesel pump price',
        'weekly', 'not_applicable', 'previous_comparable_observation',
        'https://www.gov.uk/government/statistics/weekly-road-fuel-prices',
        'https://www.gov.uk/government/statistics/weekly-road-fuel-prices',
        unit='pence_per_litre'),
    'public_debt': Definition(
        'uk.public_debt.net_debt_gdp', 'HF6X', 'PUSF',
        'PS: Net Debt (excluding public sector banks) as a % of GDP: NSA',
        'monthly', 'not_seasonally_adjusted', 'previous_month',
        ONS + '/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6x/pusf',
        ONS + '/generator?format=csv&uri=%2Feconomy%2Fgovernmentpublicsectorandtaxes%2Fpublicsectorfinance%2Ftimeseries%2Fhf6x%2Fpusf',
        unit='percent'),
    'gilt_5y': Definition('uk.gilt_yield.nominal_par_5y', 'IUDSNPY', 'IADB', 'Yield from British Government Securities, 5 year Nominal Par Yield', 'daily', 'not_applicable', 'previous_trading_day', BOE + '/boeapps/database/', GILT_DOWNLOAD_URL),
    'gilt_10y': Definition('uk.gilt_yield.nominal_par_10y', 'IUDMNPY', 'IADB', 'Yield from British Government Securities, 10 year Nominal Par Yield', 'daily', 'not_applicable', 'previous_trading_day', BOE + '/boeapps/database/', GILT_DOWNLOAD_URL),
    'gilt_20y': Definition('uk.gilt_yield.nominal_par_20y', 'IUDLNPY', 'IADB', 'Yield from British Government Securities, 20 year Nominal Par Yield', 'daily', 'not_applicable', 'previous_trading_day', BOE + '/boeapps/database/', GILT_DOWNLOAD_URL),
    'household_energy': Definition(
        'uk.energy_price_cap.typical_dual_fuel_bill', 'Ofgem dual-fuel Direct Debit cap',
        'Energy price cap unit rates and standing charges',
        'Illustrative annual dual-fuel bill at typical consumption', 'quarterly',
        'not_applicable', 'previous_comparable_period',
        'https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-unit-rates-and-standing-charges',
        'https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-unit-rates-and-standing-charges',
        unit='GBP_per_year'),
}

# Optional metric members: registered public-definition fields the writer is
# allowed to emit. The reader owns a matching code-owned contract; a mismatch
# rejects the generation. Absent members stay absent, never zero.
OPTIONAL_METRICS = {
    'public_debt': {'geography': 'United Kingdom'},
    'gilt_5y': {'geography': 'United Kingdom', 'maturity_years': 5, 'yield_type': 'fitted_nominal_par', 'primary': False},
    'gilt_10y': {'geography': 'United Kingdom', 'maturity_years': 10, 'yield_type': 'fitted_nominal_par', 'primary': True},
    'gilt_20y': {'geography': 'United Kingdom', 'maturity_years': 20, 'yield_type': 'fitted_nominal_par', 'primary': False},
    'household_energy': {'geography': 'Great Britain', 'payment_method': 'Direct Debit',
        'tariff': 'default variable tariff', 'consumption_basis': 'Ofgem typical domestic consumption values (medium; single-rate electricity)',
        'electricity_kwh_per_year': OFGEM_MEDIUM_SINGLE_RATE_ELECTRICITY_KWH,
        'gas_kwh_per_year': OFGEM_MEDIUM_GAS_KWH,
        'consumption_source_url': OFGEM_TDCV_URL,
        'consumption_source_sha256': OFGEM_TDCV_SOURCE_SHA256,
        'unit': 'GBP_per_year'},
    'cpi': {'geography': 'United Kingdom'},
    'regular_pay_nominal_growth': {'geography': 'Great Britain', 'window_months': 3},
    'regular_pay_real_growth': {'geography': 'Great Britain', 'window_months': 3, 'deflator': 'CPIH'},
    'unemployment': {'geography': 'United Kingdom', 'age_group': '16 and over', 'window_months': 3},
    'private_rent_growth': {'geography': 'United Kingdom', 'area_code': 'K02000001', 'release_caveat': 'UK latest two months provisional; Northern Ireland latest two months imputed'},
    'private_rent_level': {'geography': 'United Kingdom', 'area_code': 'K02000001', 'release_caveat': 'UK latest two months provisional; Northern Ireland latest two months imputed'},
    'house_price_level': {'geography': 'United Kingdom', 'area_code': 'K02000001', 'release_caveat': 'Recent observations provisional and subject to revision', 'house_price_download': True},
    'house_price_growth': {'geography': 'United Kingdom', 'area_code': 'K02000001', 'release_caveat': 'Recent observations provisional and subject to revision', 'house_price_download': True},
    'petrol_price': {'geography': 'United Kingdom', 'reference_kind': 'weekly_observation', 'sampling_basis': 'Monday morning or next working morning on bank holidays', 'price_basis': 'retail pump price including source tax treatment'},
    'diesel_price': {'geography': 'United Kingdom', 'reference_kind': 'weekly_observation', 'sampling_basis': 'Monday morning or next working morning on bank holidays', 'price_basis': 'retail pump price including source tax treatment'},
}

# Keys whose official endpoint is the structured ONS JSON timeseries response
# rather than the CSV generator. Recorded-fixture naming follows the same split.
JSON_TIMESERIES = {'cpi', 'regular_pay_nominal_growth', 'regular_pay_real_growth', 'unemployment'}


def public_definition(key):
    """Project the definition exactly as public JSON serialises it."""
    content = asdict(DEFINITIONS[key])
    content.update(OPTIONAL_METRICS.get(key, {}))
    return content


def fixture_file(key):
    """Offline recorded-fixture file name; live collection never uses these."""
    definition = DEFINITIONS[key]
    if key == 'regular_pay_nominal_growth':
        return 'regular_pay_nominal_kai9_lms.json'
    if key == 'regular_pay_real_growth':
        return 'regular_pay_real_a2fa_lms.json'
    if key == 'unemployment':
        return 'unemployment_mgsx_lms.json'
    if key == 'public_debt':
        return 'public_debt_hf6x_pusf.csv'
    if key.startswith('gilt_'):
        return 'boe_nominal_par_yields_5_10_20_daily.csv'
    if key.startswith('private_rent_'):
        return 'pipr_uk_monthly_price_statistics.xlsx'
    if key.startswith('house_price_'):
        return 'uk_hpi_average_prices.csv'
    if key in {'petrol_price', 'diesel_price'}:
        return 'desnz_weekly_road_fuel_prices_2026-10-20.csv'
    if key == 'household_energy': return 'ofgem_energy_price_cap_2026-10.html.gz'
    if key in JSON_TIMESERIES:
        return f'{key}_{definition.series.lower()}_{definition.dataset.lower()}.json'
    return f'{key}.csv'


@dataclass(frozen=True)
class Observation:
    period: str
    value: str | None
    status: str
    row: int
    reference: dict | None = None


class OfgemPage(HTMLParser):
    """Bounded parser for Ofgem's published average Direct Debit table."""
    def __init__(self):
        super().__init__(); self.tables=[]; self.table=None; self.row=None; self.cell=False; self.text=[]; self.body=[]
    def handle_starttag(self, tag, attrs):
        if tag == 'table': self.table=[]
        elif tag == 'tr' and self.table is not None: self.row=[]
        elif tag in ('td','th') and self.row is not None: self.cell=True; self.text=[]
    def handle_data(self, data):
        self.body.append(data)
        if self.cell: self.text.append(data)
    def handle_endtag(self, tag):
        if tag in ('td','th') and self.cell:
            self.row.append(' '.join(' '.join(self.text).split())); self.cell=False
        elif tag == 'tr' and self.row is not None:
            self.table.append(self.row); self.row=None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table); self.table=None


def parse_ofgem(key, body, today):
    if key != 'household_energy': raise ValidationError('Unexpected Ofgem metric')
    if len(body) > MAX_OFGEM_BYTES: raise ValidationError('Ofgem page exceeds size limit')
    try:
        page=OfgemPage(); page.feed(body.decode('utf-8'))
    except (UnicodeError, ValueError) as exc: raise ValidationError('Invalid Ofgem HTML') from exc
    text=' '.join(' '.join(page.body).split()).replace('\u00a0', ' ').replace('\u202f', ' ')
    if ('Energy price cap unit rates and standing charges | Ofgem' not in text or
            'Average electricity and gas unit prices and standing charges by Direct Debit' not in text):
        raise ValidationError('Unexpected Ofgem page identity or payment basis')
    matches=list(re.finditer(r'From (\d{1,2} [A-Z][a-z]+) to (\d{1,2} [A-Z][a-z]+) (\d{4}), the price cap will be £([\d,]+) per year', text))
    if not matches: raise ValidationError('Ofgem cap headline/effective period missing')
    tables=[rows for rows in page.tables if rows and any('Energy price cap per unit' in c for c in rows[0])]
    if len(tables)!=1: raise ValidationError('Ofgem average rates table missing or ambiguous')
    rows=tables[0]; headers=rows[0]
    no_electricity_vat=re.search(r'There is no VAT on electricity from (\d{1,2} [A-Z][a-z]+ \d{4}) to (\d{1,2} [A-Z][a-z]+ \d{4})', text)
    gas_vat=re.search(r'include 5% VAT on gas', text, re.I)
    if not no_electricity_vat or not gas_vat:
        raise ValidationError('Ofgem period-specific VAT basis is missing or changed')
    vat_start=datetime.strptime(no_electricity_vat[1], '%d %B %Y').date()
    vat_end=datetime.strptime(no_electricity_vat[2], '%d %B %Y').date()
    no_compare='Costs cannot be compared directly to previous periods because of this change' in text
    periods=[]
    for index,match in enumerate(matches):
        start=datetime.strptime(f'{match[1]} {match[3]}','%d %B %Y').date()
        end=datetime.strptime(f'{match[2]} {match[3]}','%d %B %Y').date()
        quarter_end_month=start.month + 2
        if (start.day != 1 or start.month not in {1, 4, 7, 10} or
                end != date(end.year, quarter_end_month,
                            calendar.monthrange(end.year, quarter_end_month)[1])):
            raise ValidationError('Ofgem cap period is not a calendar quarter')
        status='effective' if start <= today <= end else 'announced' if today < start else None
        if status is None: continue
        context=text[match.end():matches[index+1].start() if index+1 < len(matches) else len(text)]
        if not re.search(r'This figure is based on the average energy unit rate and standing charge for people who pay by Direct Debit in England, Scotland and Wales', context, re.I):
            raise ValidationError('Ofgem headline Direct Debit and GB basis mismatch')
        explicit_usage=re.search(r'([\d,]+) kWh (?:of )?(?:single-rate )?electricity.{0,180}?([\d,]+) kWh (?:of )?gas', context, re.I)
        if explicit_usage and (int(explicit_usage[1].replace(',','')) != OFGEM_MEDIUM_SINGLE_RATE_ELECTRICITY_KWH or
                               int(explicit_usage[2].replace(',','')) != OFGEM_MEDIUM_GAS_KWH):
            raise ValidationError('Ofgem headline consumption basis conflicts with reviewed 2026 TDCVs')
        if start < vat_start or end > vat_end:
            raise ValidationError('Ofgem source does not state VAT treatment for this cap period')
        current=[i for i,h in enumerate(headers) if f'{start.day} {start.strftime("%B")} to {end.day} {end.strftime("%B")} {start.year}' in h]
        if len(current)!=1: raise ValidationError('Ofgem cap rates column mismatch')
        rates={}
        for row in rows[1:]:
            if len(row)!=len(headers) or row[0].strip().lower() not in {'electricity','gas'}: continue
            parts=re.fullmatch(r'([\d.]+) pence per kWh ([\d.]+) pence daily standing charge',row[current[0]])
            if not parts: raise ValidationError('Ofgem rate cell format changed')
            rates[row[0].strip().lower()]={'unit_rate_p_per_kwh':parts[1], 'standing_charge_p_per_day':parts[2]}
        if set(rates)!={'electricity','gas'}: raise ValidationError('Ofgem dual-fuel rates incomplete')
        tax_treatment=f'5% VAT on gas; 0% VAT on electricity from {no_electricity_vat[1]} to {no_electricity_vat[2]}'
        comparison_status=('not_comparable_tax_change' if start == vat_start and no_compare
                           else 'compare_only_same_basis')
        periods.append((start,end,status,str(int(match[4].replace(',',''))),rates,
                        tax_treatment,comparison_status))
    if not periods or sum(status == 'effective' for _,_,status,_,_,_,_ in periods) != 1:
        raise ValidationError('Ofgem page does not identify exactly one currently effective cap')
    observations=[]
    for start,end,status,bill,rates,tax_treatment,comparison_status in periods:
        reference={'effective_start':start.isoformat(),'effective_end':end.isoformat(),'announcement_date':None,
            'period_status':status,'geography':'Great Britain','regional_basis':'Ofgem average Direct Debit rates for England, Scotland and Wales',
            'payment_method':'Direct Debit','tariff':'default variable tariff',
            'electricity_kwh_per_year':OFGEM_MEDIUM_SINGLE_RATE_ELECTRICITY_KWH,
            'gas_kwh_per_year':OFGEM_MEDIUM_GAS_KWH,
            'consumption_basis':'Ofgem final 2026 medium TDCVs; single-rate electricity; effective 1 July 2026',
            'tax_treatment':tax_treatment,'comparison_status':comparison_status,
            **rates}
        observations.append(Observation(start.isoformat(),bill,'observed',1,reference))
    return Snapshot(DEFINITIONS[key],None,None,tuple(observations))


@dataclass(frozen=True)
class Snapshot:
    definition: Definition
    published_date: str | None
    next_release: str | None
    observations: tuple[Observation, ...]
    parser_version: int = PARSER_VERSION
    quality_note: str | None = None
    quality_source_url: str | None = None

    def semantic_content(self):
        result = asdict(self)
        # Row positions are provenance, not economic changes.
        result['observations'] = [
            {'period': o.period, 'value': o.value, 'status': o.status,
             **({'reference': o.reference} if o.reference else {})}
            for o in self.observations]
        for field in ('quality_note', 'quality_source_url'):
            if result[field] is None:
                del result[field]
        return result


def number(raw: str) -> tuple[str | None, str]:
    raw = raw.strip()
    if raw in {'', '..', '...'}:
        return None, 'missing'
    if not re.fullmatch(r'[+-]?\d+(?:\.\d+)?', raw):
        raise ValidationError('Unrecognised numerical value')
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise ValidationError('Invalid decimal') from exc
    if not value.is_finite():
        raise ValidationError('Non-finite decimal')
    return format(value, 'f').lstrip('+'), 'observed'


def human_date(raw: str) -> str:
    raw = raw.strip()
    if re.fullmatch(r'\d{2}-\d{2}-\d{4}', raw):
        return datetime.strptime(raw, '%d-%m-%Y').date().isoformat()
    parts = raw.split()
    if len(parts) != 3 or parts[1][:3].upper() not in MONTHS:
        raise ValidationError('Unrecognised source date')
    return date(int(parts[2]), MONTHS[parts[1][:3].upper()], int(parts[0])).isoformat()


LONDON = ZoneInfo('Europe/London')


def release_date_london(raw):
    """ONS JSON releaseDate is a UTC instant; the release is a UK calendar date."""
    if not isinstance(raw, str) or not raw.endswith('Z'):
        raise ValidationError('Unrecognised release date')
    try:
        instant = datetime.fromisoformat(raw[:-1] + '+00:00')
    except ValueError as exc:
        raise ValidationError('Unrecognised release date') from exc
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValidationError('Unrecognised release date')
    return instant.astimezone(LONDON).date().isoformat()


def next_release_date(raw):
    if raw is None or not str(raw).strip():
        return None
    raw = str(raw).strip()
    if raw.lower() in {'not available', 'to be announced', 'not yet announced', 'tbc'}:
        return None
    try:
        return datetime.strptime(raw, '%d %B %Y').date().isoformat()
    except ValueError as exc:
        raise ValidationError('Unrecognised next release date') from exc


def month_period(raw):
    if not isinstance(raw, str):
        raise ValidationError('Unrecognised reference month')
    match = re.fullmatch(r'(\d{4}) ([A-Z]{3})', raw)
    if not match or match[2] not in MONTHS:
        raise ValidationError('Unrecognised reference month')
    return date(int(match[1]), MONTHS[match[2]], 1).strftime('%Y-%m')


def unemployment_window(entry):
    """ONS MGSX date is the middle month; its label defines the full window."""
    label = entry.get('label')
    match = re.fullmatch(r'(\d{4}) ([A-Z]{3})-([A-Z]{3})', label) if isinstance(label, str) else None
    if not match or match[2] not in MONTHS or match[3] not in MONTHS:
        raise ValidationError('Unrecognised unemployment reference window')
    start_year, start_month = int(match[1]), MONTHS[match[2]]
    end_month = MONTHS[match[3]]
    end_year = start_year + (1 if end_month < start_month else 0)
    start_index = start_year * 12 + start_month - 1
    end_index = end_year * 12 + end_month - 1
    if end_index - start_index != 2:
        raise ValidationError('Unemployment label is not a three-month window')
    period = month_period(entry.get('date'))
    year, month = map(int, period.split('-'))
    if year * 12 + month - 1 != start_index + 1:
        raise ValidationError('Unemployment date conflicts with labelled window')
    if (entry.get('year') != str(year) or
            entry.get('month') != date(year, month, 1).strftime('%B') or
            entry.get('quarter') not in ('', None)):
        raise ValidationError('Unemployment period metadata conflicts with label')
    start = date(start_year, start_month, 1).strftime('%Y-%m')
    end = date(end_year, end_month, 1).strftime('%Y-%m')
    return end, {'kind': 'rolling_months', 'start_month': start, 'end_month': end}


def json_number(raw):
    """Missing/unknown value tokens quarantine the feed; they never become zero."""
    if not isinstance(raw, str) or not raw.strip():
        raise ValidationError('Unrecognised value token')
    value, status = number(raw)
    if value is None:
        raise ValidationError('Unrecognised value token')
    return value


def parse_ons_json(definition, body, today):
    try:
        payload = json.loads(body.decode('utf-8-sig'))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValidationError('Invalid ONS JSON') from exc
    if not isinstance(payload, dict) or payload.get('type') != 'timeseries':
        raise ValidationError('Unexpected ONS JSON document')
    if payload.get('uri') != definition.source_url.removeprefix(ONS):
        raise ValidationError('Unexpected ONS JSON series')
    description = payload.get('description')
    if not isinstance(description, dict):
        raise ValidationError('Missing ONS JSON description')
    for field, expected in [('title', definition.title), ('cdid', definition.series),
                            ('datasetId', definition.dataset)]:
        if description.get(field) != expected:
            raise ValidationError(f'Unexpected {field}')
    expected_unit = '' if definition.series == 'A2FA' else '%'
    if description.get('unit') != expected_unit or description.get('preUnit') not in ('', None):
        raise ValidationError('Unexpected unit')
    if definition.series == 'MGSX':
        if (description.get('monthLabelStyle') != 'three month average' or
                description.get('keyNote', '').strip() != 'UK: Aged 16 and over'):
            raise ValidationError('Unexpected unemployment population or period metadata')
    published = release_date_london(description.get('releaseDate'))
    next_release = next_release_date(description.get('nextRelease'))
    months = payload.get('months')
    if not isinstance(months, list):
        raise ValidationError('Missing monthly history')
    observations = []
    for index, entry in enumerate(months, 1):
        if not isinstance(entry, dict):
            raise ValidationError('Unrecognised monthly row')
        if definition.series == 'MGSX' and entry.get('sourceDataset') != definition.dataset:
            raise ValidationError('Unexpected unemployment source dataset')
        if definition.series == 'MGSX':
            period, reference = unemployment_window(entry)
        elif definition.series in {'KAI9', 'A2FA'}:
            period = month_period(entry.get('date'))
            end_year, end_month = map(int, period.split('-'))
            start_index = end_year * 12 + end_month - 1 - 2
            start_month = f'{start_index // 12:04d}-{start_index % 12 + 1:02d}'
            reference = {'kind': 'rolling_months', 'start_month': start_month, 'end_month': period}
        else:
            period = month_period(entry.get('date'))
            reference = None
        observations.append(Observation(period, json_number(entry.get('value')), 'observed', index, reference))
    if published > today.isoformat():
        raise ValidationError('Future publication date')
    if next_release and next_release < published:
        raise ValidationError('Next release precedes publication')
    return observations, published, next_release


def parse_pipr(metric_key, body, today):
    """Normalize malformed workbook/XML structures as a source validation failure."""
    try:
        return _parse_pipr(metric_key, body, today)
    except ValidationError:
        raise
    except (ET.ParseError, KeyError, IndexError, AttributeError, TypeError,
            ValueError, OverflowError, OSError, zipfile.BadZipFile,
            zlib.error) as exc:
        raise ValidationError('Malformed PIPR workbook structure') from exc


def _parse_pipr(metric_key, body, today):
    """Read only the UK national row and two reviewed columns from ONS Table 1."""
    try:
        book = zipfile.ZipFile(io.BytesIO(body))
        if sum(info.file_size for info in book.infolist()) > 120_000_000:
            raise ValidationError('PIPR workbook expands beyond the reviewed bound')
        ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
              'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
        workbook = ET.fromstring(book.read('xl/workbook.xml'))
        sheets = workbook.find('m:sheets', ns)
        if sheets is None or [node.get('name') for node in sheets] != ['Cover sheet', 'Contents', 'Notes', 'Table 1']:
            raise ValidationError('Unexpected PIPR workbook sheets')
        rels = ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))
        rel_ns = {'p': 'http://schemas.openxmlformats.org/package/2006/relationships'}
        targets = {rel.get('Id'): rel.get('Target') for rel in rels.findall('p:Relationship', rel_ns)}
        sheet_id = targets[sheets[-1].get('{%s}id' % ns['r'])].lstrip('/')
        if not sheet_id.startswith('xl/'):
            sheet_id = 'xl/' + sheet_id
        shared_root = ET.fromstring(book.read('xl/sharedStrings.xml'))
        strings = [''.join(t.text or '' for t in item.findall('.//m:t', ns))
                   for item in shared_root.findall('m:si', ns)]
    except ValidationError:
        raise
    except (KeyError, OSError, zipfile.BadZipFile, ET.ParseError, IndexError) as exc:
        raise ValidationError('Invalid PIPR workbook') from exc
    def values(row):
        result = {}
        for cell in row.findall('m:c', ns):
            ref = cell.get('r')
            col = re.match(r'[A-Z]+', ref).group()
            node = cell.find('m:v', ns)
            raw = node.text if node is not None else ''
            if cell.get('t') == 'inlineStr':
                raw = ''.join(node.text or '' for node in cell.findall('m:is//m:t', ns))
            if cell.get('t') == 's':
                raw = strings[int(raw)]
            result[col] = raw
        return result
    selected = {}
    header_seen = False
    for _, row in ET.iterparse(book.open(sheet_id), events=('end',)):
        if row.tag != '{%s}row' % ns['m']:
            continue
        row_number = int(row.get('r', '0'))
        if row_number != 3:
            area = {}
            for cell in row.findall('m:c', ns):
                if cell.get('r', '').rstrip('0123456789') not in ('B', 'C'):
                    continue
                node = cell.find('m:v', ns)
                raw = node.text if node is not None else ''
                if cell.get('t') == 'inlineStr':
                    raw = ''.join(node.text or '' for node in cell.findall('m:is//m:t', ns))
                if cell.get('t') == 's':
                    raw = strings[int(raw)]
                area[cell.get('r', '').rstrip('0123456789')] = raw
            if area.get('B') != 'K02000001' or area.get('C') != 'United Kingdom':
                row.clear()
                continue
        cells = values(row)
        if row_number == 3:
            if (cells.get('A'), cells.get('B'), cells.get('C')) != (
                    'Time period', 'Area code', 'Area name'):
                raise ValidationError('PIPR national row identity changed')
            column = 'G' if metric_key == 'private_rent_growth' else 'H'
            expected_column = 'Annual change' if column == 'G' else 'Rental price'
            if cells.get(column) != expected_column:
                raise ValidationError('PIPR national columns changed')
            header_seen = True
            row.clear()
            continue
        if cells.get('B') != 'K02000001' or cells.get('C') != 'United Kingdom':
            row.clear()
            continue
        try:
            date_value = int(cells['A'])
            period = (date(1899, 12, 30).fromordinal(date(1899, 12, 30).toordinal() + date_value)).strftime('%Y-%m')
        except (KeyError, ValueError, OverflowError) as exc:
            raise ValidationError('Invalid PIPR reference month') from exc
        if period in selected:
            raise ValidationError('Duplicate PIPR reference month')
        selected[period] = cells.get(column)
        row.clear()
    if not header_seen:
        raise ValidationError('Missing PIPR table')
    if not selected:
        raise ValidationError('PIPR United Kingdom row unavailable')
    latest = max(selected)
    if latest > today.strftime('%Y-%m'):
        raise ValidationError('Future PIPR reference period')
    points = []
    for period, raw in sorted(selected.items()):
        # The recorded UK rows contain [x] as an unavailable marker. Other
        # missing-looking forms remain unknown and fail closed.
        value, status = (None, 'missing') if raw is None or raw == '[x]' else number(raw)
        if value is not None and metric_key == 'private_rent_growth':
            # Table 1 styles Annual change with the reviewed Excel format 0.0.
            # Match its published one-decimal rounding, not binary cell noise.
            value = format(Decimal(value).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP).normalize(), 'f')
        points.append(Observation(period, value, status, len(points) + 1))
    if points[-1].value is None:
        raise ValidationError('Latest UK PIPR observation unavailable')
    cover = ET.fromstring(book.read('xl/worksheets/sheet1.xml'))
    cover_text = []
    for cell in cover.findall('.//m:sheetData/m:row/m:c', ns):
        node = cell.find('m:v', ns)
        raw = node.text if node is not None else ''
        if cell.get('t') == 'inlineStr':
            raw = ''.join(node.text or '' for node in cell.findall('m:is//m:t', ns))
        if cell.get('t') == 's':
            raw = strings[int(raw)]
        cover_text.append(raw)
    release = next((re.search(r'originally published at .*? on (\d{1,2} [A-Z][a-z]+ \d{4})', text)
                    for text in cover_text if 'originally published at' in text), None)
    if not release:
        raise ValidationError('Missing PIPR publication date')
    published = datetime.strptime(release.group(1), '%d %B %Y').date().isoformat()
    if published > today.isoformat():
        raise ValidationError('Future PIPR publication date')
    if points[-1].period > published[:7]:
        raise ValidationError('PIPR reference month follows release')
    return Snapshot(DEFINITIONS[metric_key], published, None, tuple(points))


def parse_hpi(key, body, today):
    try:
        return _parse_hpi(key, body, today)
    except ValidationError:
        raise
    except (KeyError, IndexError, AttributeError, TypeError, ValueError, OverflowError) as exc:
        raise ValidationError("Malformed UK HPI CSV structure") from exc


def _parse_hpi(key, body, today):
    try:
        rows = list(csv.DictReader(io.StringIO(body.decode('utf-8-sig'), newline=''), strict=True))
    except (UnicodeError, csv.Error) as exc:
        raise ValidationError('Invalid UK HPI CSV') from exc
    expected = ['Date', 'Region_Name', 'Area_Code', 'Average_Price', 'Monthly_Change', 'Annual_Change', 'Average_Price_SA']
    if not rows or list(rows[0]) != expected:
        raise ValidationError('UK HPI Average price CSV columns changed')
    selected = {}
    def hpi_value(raw):
        if raw == '':
            return None
        if not re.fullmatch(r'[+-]?\d+(?:\.\d+)?', raw):
            raise ValidationError('Unrecognised UK HPI value token')
        value, status = number(raw)
        if status != 'observed' or value is None:
            raise ValidationError('Unrecognised UK HPI value token')
        return value
    for index, row in enumerate(rows, 2):
        if row.get('Area_Code') != 'K02000001' or row.get('Region_Name') != 'United Kingdom':
            continue
        try:
            period = date.fromisoformat(row['Date']).strftime('%Y-%m')
        except (ValueError, TypeError) as exc:
            raise ValidationError('Invalid UK HPI reference month') from exc
        if period in selected:
            raise ValidationError('Duplicate UK HPI UK reference month')
        # Each requested metric has an independent validation boundary. A bad
        # token in the other published series must not discard this one.
        column = 'Average_Price' if key == 'house_price_level' else 'Annual_Change'
        value = hpi_value(row[column])
        # This official table publishes average price in whole pounds and annual
        # change to one decimal place. Retain its displayed precision.
        if value is not None:
            precision = Decimal('1') if key == 'house_price_level' else Decimal('0.1')
            value = format(Decimal(value).quantize(precision, rounding=ROUND_HALF_UP), 'f')
            if key == 'house_price_growth':
                value = format(Decimal(value).normalize(), 'f')
        selected[period] = (value, index)
    if not selected:
        raise ValidationError('UK HPI national row unavailable')
    latest = max(selected)
    if latest > today.strftime('%Y-%m'):
        raise ValidationError('Future UK HPI reference period')
    if selected[latest][0] is None:
        raise ValidationError('Latest UK HPI national observation unavailable')
    return Snapshot(DEFINITIONS[key], None, None, tuple(
        Observation(period, values[0], 'observed' if values[0] is not None else 'missing', values[1])
        for period, values in sorted(selected.items())))


FUEL_SOURCE_URL = 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices'
FUEL_ASSET_HOST = 'assets.publishing.service.gov.uk'
FUEL_COLUMNS = {
    'petrol_price': 'ULSP (Ultra low sulphur unleaded petrol) Pump price in pence/litre',
    'diesel_price': 'ULSD (Ultra low sulphur diesel) Pump price in pence/litre',
}


def parse_fuel_release_page(body):
    """Select the current, explicitly named CSV from the bounded GOV.UK page."""
    if not isinstance(body, bytes) or len(body) > MAX_SOURCE_PAGE_BYTES:
        raise ValidationError('DESNZ release page exceeds size limit')
    try:
        text = body.decode('utf-8', 'strict')
    except UnicodeError as exc:
        raise ValidationError('Invalid UTF-8 DESNZ release page') from exc
    match = re.search(r'"dateModified"\s*:\s*"([^\"]+)"', text)
    if not match:
        raise ValidationError('DESNZ release publication date unavailable')
    try:
        published = datetime.fromisoformat(match.group(1).replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValidationError('Invalid DESNZ release publication date') from exc
    if published.tzinfo is None or published.utcoffset() is None:
        raise ValidationError('Invalid DESNZ release publication date')
    published_date = published.astimezone(LONDON).date().isoformat()
    # Only the current CSV attachment family on the official asset host is allowed.
    current = re.search(
        r'"name"\s*:\s*"Weekly road fuel prices \(CSV\) 2018 to ([0-9]{4})"\s*,\s*'
        r'"contentUrl"\s*:\s*"(https://assets\.publishing\.service\.gov\.uk/media/[a-f0-9]+/CSV__2018_-__\.csv)"',
        text)
    if not current:
        raise ValidationError('Current DESNZ weekly fuel CSV attachment unavailable')
    return published_date, current[2]


def parse_fuel(key, body, today):
    if len(body) > MAX_FUEL_BYTES:
        raise ValidationError('DESNZ fuel CSV exceeds size limit')
    try:
        rows = list(csv.DictReader(io.StringIO(body.decode('utf-8-sig'), newline=''), strict=True))
    except (UnicodeError, csv.Error) as exc:
        raise ValidationError('Invalid DESNZ fuel CSV') from exc
    column = FUEL_COLUMNS[key]
    expected = ['Date', *FUEL_COLUMNS.values(),
        'ULSP (Ultra low sulphur unleaded petrol) Duty rate in pence/litre',
        'ULSD (Ultra low sulphur diesel) Duty rate in pence/litre',
        'ULSP (Ultra low sulphur unleaded petrol) VAT percentage rate',
        'ULSD (Ultra low sulphur diesel) VAT percentage rate']
    # Header contract includes both prices and the duty/VAT evidence columns.
    if not rows or list(rows[0]) != expected:
        raise ValidationError('Unexpected DESNZ fuel CSV headers')
    observations = []
    for index, row in enumerate(rows, 2):
        if None in row or any(value is None for value in row.values()):
            raise ValidationError('Unexpected DESNZ fuel CSV row width')
        try:
            observed = datetime.strptime(row['Date'], '%d/%m/%Y').date()
        except (TypeError, ValueError) as exc:
            raise ValidationError('Invalid DESNZ weekly reference date') from exc
        if observed.weekday() != 0:
            raise ValidationError('DESNZ weekly reference date is not Monday')
        value, status = number(row[column])
        observations.append(Observation(observed.isoformat(), value, status, index,
            {'kind': 'weekly_observation', 'date': observed.isoformat()}))
    observations.sort(key=lambda point: point.period)
    if not observations or len({point.period for point in observations}) != len(observations):
        raise ValidationError('Empty or duplicate DESNZ weekly history')
    if observations[-1].period > today.isoformat() or observations[-1].value is None:
        raise ValidationError('Latest DESNZ weekly fuel observation unavailable')
    return Snapshot(DEFINITIONS[key], None, None, tuple(observations))


def parse(key: str, body: bytes, today: date) -> Snapshot:
    definition = DEFINITIONS[key]
    max_bytes = MAX_OFGEM_BYTES if key == 'household_energy' else MAX_PIPR_BYTES if key.startswith('private_rent_') else MAX_HPI_BYTES if key.startswith('house_price_') else MAX_BYTES
    if len(body) > max_bytes:
        raise ValidationError('Response exceeds size limit')
    if key == 'household_energy': return parse_ofgem(key, body, today)
    if key.startswith('private_rent_'):
        return parse_pipr(key, body, today)
    if key.startswith('house_price_'):
        return parse_hpi(key, body, today)
    if key in FUEL_COLUMNS:
        return parse_fuel(key, body, today)
    if key in JSON_TIMESERIES:
        observations, published, next_release = parse_ons_json(definition, body, today)
    else:
        try:
            rows = list(csv.reader(io.StringIO(body.decode('utf-8-sig')), strict=True))
        except (UnicodeError, csv.Error) as exc:
            raise ValidationError('Invalid UTF-8 CSV') from exc
        observations = []
        metadata = {}
        if key == 'bank_rate' or key.startswith('gilt_'):
            if not rows or rows[0] != ['DATE', 'SERIES', 'VALUE']:
                raise ValidationError('Bank Rate CSV header changed' if key == 'bank_rate' else 'BoE daily series CSV header changed')
            target_series = set(GILT_SERIES) if key.startswith('gilt_') else {definition.series}
            found_series = set()
            for index, row in enumerate(rows[1:], 2):
                if not row:
                    continue
                if len(row) != 3 or row[1] not in target_series:
                    raise ValidationError('Unexpected Bank Rate series or row' if key == 'bank_rate' else 'Unexpected BoE series or row')
                found_series.add(row[1])
                if key.startswith('gilt_') and row[1] != definition.series:
                    continue
                period = human_date(row[0])
                if key.startswith('gilt_') and date.fromisoformat(period).weekday() >= 5:
                    raise ValidationError('BoE gilt observation falls on a weekend')
                value, status = number(row[2])
                observations.append(Observation(period, value, status, index))
            if key.startswith('gilt_') and definition.series not in found_series:
                raise ValidationError('BoE response is missing the requested series')
            if key.startswith('gilt_') and (not observations or observations[0].period != '2000-01-04'):
                raise ValidationError('BoE gilt history does not begin on the approved joint-history date')
            published = next_release = None  # Observation dates are not announcement dates.
        else:
            for index, row in enumerate(rows, 1):
                if not row:
                    continue
                if len(row) != 2:
                    raise ValidationError('Unexpected ONS row width')
                label, raw = row
                match = re.fullmatch(r'(\d{4}) ([A-Z]{3})', label)
                if match:
                    if match[2] not in MONTHS:
                        raise ValidationError('Invalid reference month')
                    period = date(int(match[1]), MONTHS[match[2]], 1).strftime('%Y-%m')
                    value, status = number(raw)
                    observations.append(Observation(period, value, status, index))
                elif re.fullmatch(r'\d{4}(?: Q[1-4])?', label):
                    continue  # Annual and quarterly rows are not monthly observations.
                else:
                    if re.match(r'^\d{4}', label):
                        raise ValidationError('Unrecognised reference period')
                    if label in metadata:
                        raise ValidationError('Duplicate metadata')
                    metadata[label] = raw
            for field, expected in [('Title', definition.title), ('CDID', definition.series),
                                    ('Source dataset ID', definition.dataset)]:
                if metadata.get(field) != expected:
                    raise ValidationError(f'Unexpected {field}')
            # ECYX is officially published with blank Unit; this exception is series-specific.
            units = {'%', ''} if key == 'gdp' else {'%'}
            if 'Unit' not in metadata or metadata['Unit'] not in units:
                raise ValidationError('Unexpected unit')
            if metadata.get('PreUnit', ''):
                raise ValidationError('Unexpected unit prefix')
            published = human_date(metadata.get('Release date', ''))
            next_raw = metadata.get('Next release', '').strip()
            next_release = None if next_raw.lower() in {
                '', 'not available', 'to be announced', 'not yet announced', 'tbc'} else human_date(next_raw)
            if published > today.isoformat():
                raise ValidationError('Future publication date')
            if next_release and next_release < published:
                raise ValidationError('Next release precedes publication')
    observations.sort(key=lambda o: o.period)
    if not observations or not any(o.value is not None for o in observations):
        raise ValidationError('No usable observations')
    if len({o.period for o in observations}) != len(observations):
        raise ValidationError('Duplicate reference period')
    cutoff = today.isoformat() if definition.frequency == 'daily' else today.strftime('%Y-%m')
    if observations[-1].period > cutoff:
        raise ValidationError('Future reference period')
    if published and definition.frequency == 'monthly' and observations[-1].period > published[:7]:
        raise ValidationError('Reference month follows release')
    if observations[-1].value is None:
        raise ValidationError('Latest observation unavailable')
    quality = UNEMPLOYMENT_QUALITY if key == 'unemployment' else {}
    return Snapshot(definition, published, next_release, tuple(observations), **quality)


def parse_hpi_release_page(body: bytes):
    """Re-derive the release date and first approved CSV link from archived bytes."""
    if not isinstance(body, bytes) or len(body) > MAX_SOURCE_PAGE_BYTES:
        raise ValidationError('UK HPI release page exceeds size limit')
    try:
        text = body.decode('utf-8', 'strict')
    except UnicodeError as exc:
        raise ValidationError('Invalid UTF-8 UK HPI release page') from exc
    published_match = re.search(r'"datePublished"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})T', text)
    if not published_match:
        raise ValidationError('UK HPI publication date unavailable')
    published = published_match.group(1)
    try:
        datetime.strptime(published, '%Y-%m-%d')
    except ValueError as exc:
        raise ValidationError('Invalid UK HPI publication date') from exc
    links = re.findall(
        r'href=["\'](https://publicdata\.landregistry\.gov\.uk/market-trend-data/house-price-index-data/Average-prices-[0-9]{4}-[0-9]{2}\.csv(?:\?[^"\']*)?)["\']',
        text,
    )
    if not links:
        raise ValidationError('Current official UK HPI Average price CSV unavailable')
    return published, links[0].replace('&amp;', '&')


def recorded_hpi_release_evidence(source_url, source_published_date, retrieved_at):
    """Create explicitly synthetic, labelled release-page evidence for fixture replay."""
    published = datetime.strptime(source_published_date, '%Y-%m-%d').date()
    release_page_url = (
        'https://www.gov.uk/government/statistical-data-sets/'
        f'uk-house-price-index-data-downloads-{published.strftime("%B").lower()}-{published.year}'
    )
    html = (
        '<html><script type="application/ld+json">'
        f'{{"datePublished":"{source_published_date}T00:00:00Z"}}'
        '</script><a href="' + source_url.replace('&', '&amp;') + '">Average price</a></html>'
    ).encode('utf-8')
    return {
        'body': html,
        'url': release_page_url,
        'retrieved_at': retrieved_at,
        'evidence_kind': 'recorded_fixture',
    }


def fetch(key: str) -> bytes:
    """One bounded request. Retry scheduling belongs to the caller, not the parser."""
    if key.startswith('gilt_'):
        url = GILT_DOWNLOAD_URL
        request = Request(url, headers={'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
        with urlopen(request, timeout=30) as response:
            if response.status != 200 or response.geturl() != url:
                raise ValidationError('Unexpected BoE gilt yield response')
            payload = response.read(MAX_BYTES + 1)
        if len(payload) > MAX_BYTES:
            raise ValidationError('BoE gilt yield response exceeds size limit')
        return payload
    if key == 'public_debt':
        url = DEFINITIONS[key].download_url
        request = Request(url, headers={
            'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
        with urlopen(request, timeout=30) as response:
            if response.status != 200 or response.geturl() != url:
                raise ValidationError('Unexpected ONS HF6X download response')
            payload = response.read(MAX_BYTES + 1)
        if len(payload) > MAX_BYTES:
            raise ValidationError('ONS HF6X response exceeds size limit')
        return payload
    if key in FUEL_COLUMNS:
        request = Request(FUEL_SOURCE_URL, headers={
            'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
        with urlopen(request, timeout=30) as response:
            if response.status != 200 or response.geturl() != FUEL_SOURCE_URL:
                raise ValidationError('Unexpected DESNZ weekly fuel release page response')
            page = response.read(MAX_SOURCE_PAGE_BYTES + 1)
        if len(page) > MAX_SOURCE_PAGE_BYTES:
            raise ValidationError('DESNZ release page exceeds size limit')
        published_date, url = parse_fuel_release_page(page)
        retrieved_at = datetime.now(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')
        request = Request(url, headers={
            'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
        with urlopen(request, timeout=60) as response:
            if response.status != 200 or response.geturl() != url:
                raise ValidationError('Unexpected DESNZ fuel CSV response')
            payload = response.read(MAX_FUEL_BYTES + 1)
        if len(payload) > MAX_FUEL_BYTES:
            raise ValidationError('DESNZ fuel CSV exceeds size limit')
        page_evidence = {'body': page, 'url': FUEL_SOURCE_URL,
                         'retrieved_at': retrieved_at, 'evidence_kind': 'official_download'}
        return payload, url, published_date, page_evidence
    if key == 'household_energy':
        url = DEFINITIONS[key].download_url
        request = Request(url, headers={'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
        with urlopen(request, timeout=30) as response:
            if response.status != 200 or response.geturl() != url:
                raise ValidationError('Unexpected Ofgem cap page response')
            payload = response.read(MAX_OFGEM_BYTES + 1)
        if len(payload) > MAX_OFGEM_BYTES: raise ValidationError('Ofgem cap page exceeds size limit')
        return payload, url
    if key.startswith('private_rent_'):
        # The dataset page exposes a versioned workbook link. Select only the
        # exact current ONS edition path; never follow arbitrary page links.
        request = Request(DEFINITIONS[key].download_url, headers={
            'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
        with urlopen(request, timeout=30) as response:
            if response.status != 200 or urlsplit(response.geturl()).hostname != 'www.ons.gov.uk':
                raise ValidationError('Unexpected PIPR dataset-page redirect')
            page = response.read(MAX_SOURCE_PAGE_BYTES + 1)
        if len(page) > MAX_SOURCE_PAGE_BYTES:
            raise ValidationError('PIPR dataset page exceeds size limit')
        class Links(HTMLParser):
            def __init__(self):
                HTMLParser.__init__(self)
                self.hrefs = []
            def handle_starttag(self, tag, attrs):
                if tag == 'a':
                    self.hrefs.extend(value for name, value in attrs if name == 'href')
        links = Links()
        links.feed(page.decode('utf-8', 'strict'))
        sep = r'(?:%2F|/)'
        pattern = re.compile(r'^/file\?uri=' + sep + r'economy' + sep +
            r'inflationandpriceindices' + sep + r'datasets' + sep +
            r'priceindexofprivaterentsukmonthlypricestatistics' + sep +
            r'[0-9]{1,2}[a-z]+[0-9]{4}' + sep +
            r'priceindexofprivaterentsukmonthlypricestatistics\.xlsx$')
        matches = [ONS + href for href in links.hrefs if pattern.fullmatch(href)]
        if not matches:
            raise ValidationError('Current ONS PIPR workbook link unavailable')
        url = matches[0]
        request = Request(url, headers={
            'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
        with urlopen(request, timeout=60) as response:
            if response.status != 200 or urlsplit(response.geturl()).hostname != 'www.ons.gov.uk':
                raise ValidationError('Unexpected PIPR HTTP status')
            payload = response.read(MAX_PIPR_BYTES + 1)
        if len(payload) > MAX_PIPR_BYTES:
            raise ValidationError('PIPR workbook exceeds size limit')
        return payload, url
    if key.startswith('house_price_'):
        page_url = 'https://www.gov.uk/government/collections/uk-house-price-index-reports'
        request = Request(page_url, headers={'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
        with urlopen(request, timeout=30) as response:
            if response.status != 200 or urlsplit(response.geturl()).hostname != 'www.gov.uk':
                raise ValidationError('Unexpected UK HPI reports page response')
            page = response.read(MAX_SOURCE_PAGE_BYTES + 1)
        if len(page) > MAX_SOURCE_PAGE_BYTES:
            raise ValidationError('UK HPI reports page exceeds size limit')
        text = page.decode('utf-8', 'strict')
        editions = re.findall(r'href=["\'](/government/statistical-data-sets/uk-house-price-index-data-downloads-[a-z]+-[0-9]{4}(?:--[0-9]+)?)["\']', text)
        if not editions:
            raise ValidationError('Current UK HPI downloads release unavailable')
        release_page_url = 'https://www.gov.uk' + editions[0]
        with urlopen(Request(release_page_url, headers={'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'}), timeout=30) as response:
            if response.status != 200 or urlsplit(response.geturl()).hostname != 'www.gov.uk':
                raise ValidationError('Unexpected UK HPI release page response')
            release_page_url = response.geturl()
            release_page = response.read(MAX_SOURCE_PAGE_BYTES + 1)
        if len(release_page) > MAX_SOURCE_PAGE_BYTES:
            raise ValidationError('UK HPI release page exceeds size limit')
        page_retrieved_at = datetime.now(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')
        published_date, url = parse_hpi_release_page(release_page)
        page_evidence = {
            'body': release_page,
            'url': release_page_url,
            'retrieved_at': page_retrieved_at,
            'evidence_kind': 'official_download',
        }
        request = Request(url, headers={'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
        with urlopen(request, timeout=60) as response:
            if response.status != 200 or urlsplit(response.geturl()).hostname != 'publicdata.landregistry.gov.uk':
                raise ValidationError('Unexpected UK HPI CSV response')
            payload = response.read(MAX_HPI_BYTES + 1)
        if len(payload) > MAX_HPI_BYTES:
            raise ValidationError('UK HPI CSV exceeds size limit')
        return payload, url, published_date, page_evidence
    request = Request(DEFINITIONS[key].download_url, headers={
        'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
    with urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise ValidationError(f'Unexpected HTTP status {response.status}')
        max_bytes = MAX_PIPR_BYTES if key.startswith('private_rent_') else MAX_BYTES
        payload = response.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise ValidationError('Response exceeds size limit')
    return payload
