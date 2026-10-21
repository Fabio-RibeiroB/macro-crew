"""Reviewed contracts and pure parsers for official UK statistical series."""
from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

MAX_BYTES = 2_000_000
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
}

# Optional metric members: registered public-definition fields the writer is
# allowed to emit. The reader owns a matching code-owned contract; a mismatch
# rejects the generation. Absent members stay absent, never zero.
OPTIONAL_METRICS = {
    'cpi': {'geography': 'United Kingdom'},
    'regular_pay_nominal_growth': {'geography': 'Great Britain', 'window_months': 3},
    'regular_pay_real_growth': {'geography': 'Great Britain', 'window_months': 3, 'deflator': 'CPIH'},
}

# Keys whose official endpoint is the structured ONS JSON timeseries response
# rather than the CSV generator. Recorded-fixture naming follows the same split.
JSON_TIMESERIES = {'cpi', 'regular_pay_nominal_growth', 'regular_pay_real_growth'}


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


@dataclass(frozen=True)
class Snapshot:
    definition: Definition
    published_date: str | None
    next_release: str | None
    observations: tuple[Observation, ...]
    parser_version: int = PARSER_VERSION

    def semantic_content(self):
        result = asdict(self)
        # Row positions are provenance, not economic changes.
        result['observations'] = [
            {'period': o.period, 'value': o.value, 'status': o.status,
             **({'reference': o.reference} if o.reference else {})}
            for o in self.observations]
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
    published = release_date_london(description.get('releaseDate'))
    next_release = next_release_date(description.get('nextRelease'))
    months = payload.get('months')
    if not isinstance(months, list):
        raise ValidationError('Missing monthly history')
    observations = []
    for index, entry in enumerate(months, 1):
        if not isinstance(entry, dict):
            raise ValidationError('Unrecognised monthly row')
        if definition.series in {'KAI9', 'A2FA'}:
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


def parse(key: str, body: bytes, today: date) -> Snapshot:
    definition = DEFINITIONS[key]
    if len(body) > MAX_BYTES:
        raise ValidationError('Response exceeds size limit')
    if key in JSON_TIMESERIES:
        observations, published, next_release = parse_ons_json(definition, body, today)
    else:
        try:
            rows = list(csv.reader(io.StringIO(body.decode('utf-8-sig')), strict=True))
        except (UnicodeError, csv.Error) as exc:
            raise ValidationError('Invalid UTF-8 CSV') from exc
        observations = []
        metadata = {}
        if key == 'bank_rate':
            if not rows or rows[0] != ['DATE', 'SERIES', 'VALUE']:
                raise ValidationError('Bank Rate CSV header changed')
            for index, row in enumerate(rows[1:], 2):
                if not row:
                    continue
                if len(row) != 3 or row[1] != definition.series:
                    raise ValidationError('Unexpected Bank Rate series or row')
                period = human_date(row[0])
                value, status = number(row[2])
                observations.append(Observation(period, value, status, index))
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
    if published and observations[-1].period > published[:7]:
        raise ValidationError('Reference month follows release')
    if observations[-1].value is None:
        raise ValidationError('Latest observation unavailable')
    return Snapshot(definition, published, next_release, tuple(observations))


def fetch(key: str) -> bytes:
    """One bounded request. Retry scheduling belongs to the caller, not the parser."""
    request = Request(DEFINITIONS[key].download_url, headers={
        'User-Agent': 'FinStats/2.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'})
    with urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise ValidationError(f'Unexpected HTTP status {response.status}')
        payload = response.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        raise ValidationError('Response exceeds size limit')
    return payload
