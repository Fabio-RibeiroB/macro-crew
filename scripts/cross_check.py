#!/usr/bin/env python3
"""Daily cross-check: compare the live FinStats site with the official sources.

The live generation is read with the site's own reader (``src/app/data/verified.mjs``
on Node). Each figure's latest period, latest value and recent history are then
fetched from the publisher by a *different route* from the production collector
where one exists (ONS CSV versus JSON, the Bank of England tabular download, ...)
and compared exactly. A mismatch, a figure the reader rejects, an overdue figure
or a source that could not be checked opens one GitHub issue, or comments on the
open one. When everything matches again the open issue is closed; a clean run
with no open issue sends nothing.

Standard library only. No secrets beyond the workflow's default ``GITHUB_TOKEN``,
no AI, no paid services; nothing here changes site data.
"""
from __future__ import annotations

import argparse
import calendar
import csv
import hashlib
import http.client
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen
from zoneinfo import ZoneInfo

_DEFAULT_URLOPEN = urlopen

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / 'src'))
from finstats.sources import DEFINITIONS, JSON_TIMESERIES  # noqa: E402  (contract only; no parsers)

DEFAULT_SITE = 'https://finstats.fabio.org.uk/'
VERIFIED_MJS = REPO_ROOT / 'src' / 'app' / 'data' / 'verified.mjs'
USER_AGENT = 'FinStats-cross-check/1.0 (+https://github.com/Fabio-RibeiroB/macro-crew)'
ISSUE_TITLE = 'Daily cross-check: live figures need attention'
ISSUE_MARKER = '<!-- finstats-daily-cross-check -->'
HISTORY_PERIODS = 6
LONDON = ZoneInfo('Europe/London')

MAX_MANIFEST_BYTES = 100_000
MAX_GENERATION_BYTES = 40_000_000
MAX_SMALL_BYTES = 5_000_000
MAX_PAGE_BYTES = 2_000_000
MAX_PIPR_BYTES = 25_000_000
MAX_HPI_BYTES = 10_000_000
MAX_AFFORDABILITY_BYTES = 5_000_000
MAX_XLSX_UNCOMPRESSED = 120_000_000

OFFICIAL_HOSTS = {
    'www.ons.gov.uk', 'www.bankofengland.co.uk', 'www.gov.uk',
    'assets.publishing.service.gov.uk', 'publicdata.landregistry.gov.uk',
    'www.ofgem.gov.uk',
}
ONS = 'https://www.ons.gov.uk'
BOE = 'https://www.bankofengland.co.uk'
MONTH_ABBR = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')
MONTHS = {name.upper(): index for index, name in enumerate(MONTH_ABBR, 1)}
MONTH_NAMES = {name: index for index, name in enumerate(
    ('january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
     'september', 'october', 'november', 'december'), 1)}

OK, MISMATCH, REJECTED, OVERDUE, UNAVAILABLE, COULD_NOT_CHECK, BROKEN_LINK = (
    'ok', 'mismatch', 'rejected', 'overdue', 'unavailable', 'could_not_check', 'broken_link')
PROBLEM_LABEL = {
    MISMATCH: 'Mismatch', REJECTED: 'Rejected by the site reader', OVERDUE: 'Update overdue',
    UNAVAILABLE: 'Unavailable on the site', COULD_NOT_CHECK: 'Could not check',
    BROKEN_LINK: 'Broken link',
}
REPORT_SOURCE_PLACEHOLDERS = frozenset({'', 'not available', 'n/a', 'none', 'unavailable'})


class FetchError(Exception):
    """A source could not be reached (HTTP error, timeout, network failure, bad redirect)."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


class SourceError(Exception):
    """A source answered but its content could not be read as expected."""


# ---------------------------------------------------------------- HTTP

class _CheckedRedirectHandler(HTTPRedirectHandler):
    """Validate every redirect hop before urllib connects to the target."""

    def __init__(self, allowed_hosts):
        super().__init__()
        self._allowed_hosts = allowed_hosts

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        resolved = urljoin(req.full_url, newurl)
        parts = urlsplit(resolved)
        if parts.scheme != 'https' or parts.hostname not in self._allowed_hosts:
            raise FetchError(f'refusing redirect to {resolved}')
        return super().redirect_request(req, fp, code, msg, headers, resolved)


def make_fetcher(allowed_hosts, timeout=30, attempts=3, sleep=time.sleep):
    """Bounded, HTTPS-only GET returning bytes. Every hop and final URL must stay on an allowed HTTPS host.

    Only 429/5xx answers, HTTP protocol errors and timeouts are retried (at most ``attempts`` tries,
    waits capped at 30 seconds, honouring Retry-After); anything else fails at once.
    """
    opener = build_opener(_CheckedRedirectHandler(allowed_hosts))

    def fetch(url, limit=MAX_SMALL_BYTES):
        parts = urlsplit(url)
        if parts.scheme != 'https' or parts.hostname not in allowed_hosts:
            raise FetchError(f'refusing to fetch {url}')
        request = Request(url, headers={'User-Agent': USER_AGENT})
        open_fn = opener.open if urlopen is _DEFAULT_URLOPEN else urlopen
        for attempt in range(1, attempts + 1):
            wait = 5 * attempt
            try:
                with open_fn(request, timeout=timeout) as response:
                    if response.status != 200:
                        raise FetchError(f'HTTP {response.status} from {parts.hostname}', status=response.status)
                    final = urlsplit(response.geturl())
                    if final.scheme != 'https' or final.hostname not in allowed_hosts:
                        raise FetchError(f'redirected away from {parts.hostname}')
                    body = response.read(limit + 1)
            except FetchError:
                raise
            except HTTPError as exc:
                if (exc.code == 429 or exc.code >= 500) and attempt < attempts:
                    retry_after = (exc.headers or {}).get('Retry-After', '')
                    sleep(min(int(retry_after), 30) if retry_after.isdigit() else wait)
                    continue
                raise FetchError(f'HTTP {exc.code} from {parts.hostname}', status=exc.code) from exc
            except (URLError, OSError, ValueError, http.client.HTTPException) as exc:
                if attempt < attempts and isinstance(exc, (TimeoutError, URLError, http.client.HTTPException)):
                    sleep(wait)
                    continue
                raise FetchError(f'{type(exc).__name__}: {exc}') from exc
            if len(body) > limit:
                raise FetchError(f'response from {parts.hostname} exceeds {limit} bytes')
            return body

    def _probe(url, method):
        parts = urlsplit(url)
        request = Request(url, method=method, headers={'User-Agent': USER_AGENT})
        open_fn = opener.open if urlopen is _DEFAULT_URLOPEN else urlopen
        for attempt in range(1, attempts + 1):
            wait = 5 * attempt
            try:
                with open_fn(request, timeout=timeout) as response:
                    if response.status != 200:
                        raise FetchError(f'HTTP {response.status} from {parts.hostname}', status=response.status)
                    final = urlsplit(response.geturl())
                    if final.scheme != 'https' or final.hostname not in allowed_hosts:
                        raise FetchError(f'redirected away from {parts.hostname}')
                    if method != 'HEAD':
                        response.read(1)
                    return
            except FetchError:
                raise
            except HTTPError as exc:
                if (exc.code == 429 or exc.code >= 500) and attempt < attempts:
                    retry_after = (exc.headers or {}).get('Retry-After', '')
                    sleep(min(int(retry_after), 30) if retry_after.isdigit() else wait)
                    continue
                raise FetchError(f'HTTP {exc.code} from {parts.hostname}', status=exc.code) from exc
            except (URLError, OSError, ValueError, http.client.HTTPException) as exc:
                if attempt < attempts and isinstance(exc, (TimeoutError, URLError, http.client.HTTPException)):
                    sleep(wait)
                    continue
                raise FetchError(f'{type(exc).__name__}: {exc}') from exc

    def check_url(url):
        parts = urlsplit(url)
        if parts.scheme != 'https' or parts.username or parts.password or parts.hostname not in allowed_hosts:
            raise FetchError(f'refusing to check {url}')
        try:
            _probe(url, 'HEAD')
        except FetchError as exc:
            if exc.status in (403, 405, 501):
                _probe(url, 'GET')
            else:
                raise

    fetch.check_url = check_url
    return fetch


class CachedFetcher:
    """One request per URL per run, failures included, so shared downloads are checked once."""
    def __init__(self, fetch):
        self._fetch, self._cache, self._probe_cache = fetch, {}, {}

    def __call__(self, url, limit=MAX_SMALL_BYTES):
        if url not in self._cache:
            try:
                self._cache[url] = (self._fetch(url, limit), None)
            except FetchError as exc:
                self._cache[url] = (None, exc)
        body, error = self._cache[url]
        if error is not None:
            raise error
        return body

    def check_url(self, url):
        if url not in self._probe_cache:
            probe = getattr(self._fetch, 'check_url', None)
            try:
                if probe is not None:
                    probe(url)
                else:
                    self(url, MAX_SMALL_BYTES)
                self._probe_cache[url] = None
            except FetchError as exc:
                self._probe_cache[url] = exc
        error = self._probe_cache[url]
        if error is not None:
            raise error


# ---------------------------------------------------------------- live site (site's own reader)

NODE_RUNNER = r"""
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [readerPath, manifestPath, generationPath] = process.argv.slice(1);
const out = (value) => process.stdout.write(JSON.stringify(value));
try {
  const { parseManifest, parseDataset } = await import(pathToFileURL(readerPath).href);
  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  const bytes = readFileSync(generationPath);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== manifest.sha256) throw new Error('The data integrity check failed');
  const dataset = parseDataset(JSON.parse(new TextDecoder().decode(bytes)), manifest);
  out({ ok: true, dataset });
} catch (error) {
  out({ ok: false, error: String(error && error.message ? error.message : error) });
}
"""


@dataclass
class SiteReading:
    generation_id: str | None = None
    raw: dict | None = None          # the generation exactly as published
    parsed: dict | None = None       # the dataset after verified.mjs
    error: str | None = None         # whole-generation rejection
    unreachable: str | None = None   # the site itself could not be read
    reader_error: str | None = None  # Node / verified.mjs runner failed


def run_site_reader(manifest_bytes, generation_bytes, node='node', reader=VERIFIED_MJS):
    """Run parseManifest, the SHA-256 check and parseDataset of verified.mjs on Node."""
    child_env = {k: v for k, v in os.environ.items() if 'TOKEN' not in k.upper() and 'SECRET' not in k.upper()}
    with tempfile.TemporaryDirectory(prefix='finstats-cross-check-') as folder:
        manifest_path, generation_path = Path(folder, 'current.json'), Path(folder, 'data.json')
        manifest_path.write_bytes(manifest_bytes)
        generation_path.write_bytes(generation_bytes)
        try:
            done = subprocess.run(
                [node, '--input-type=module', '-e', NODE_RUNNER, str(reader),
                 str(manifest_path), str(generation_path)],
                capture_output=True, timeout=120, check=False, env=child_env)
        except (OSError, subprocess.SubprocessError) as exc:
            raise RuntimeError(f'could not run Node for verified.mjs: {exc}') from exc
    try:
        result = json.loads(done.stdout.decode('utf-8'))
    except (UnicodeError, ValueError) as exc:
        raise RuntimeError('verified.mjs runner produced no result: '
                           + done.stderr.decode('utf-8', 'replace')[:500]) from exc
    return result


def read_site(base, fetch, node='node', reader=VERIFIED_MJS):
    base = base if base.endswith('/') else base + '/'
    reading = SiteReading()
    try:
        manifest_bytes = fetch(base + 'data/current.json', MAX_MANIFEST_BYTES)
    except FetchError as exc:
        reading.unreachable = f'data/current.json: {exc}'
        return reading
    try:
        manifest = json.loads(manifest_bytes.decode('utf-8'))
        data_url = manifest['data_url']
        generation_id = manifest['generation_id']
    except (UnicodeError, ValueError, KeyError, TypeError):
        reading.error = 'Invalid data manifest'
        return reading
    reading.generation_id = generation_id if isinstance(generation_id, str) else None
    if not isinstance(data_url, str) or not re.fullmatch(r'generations/[a-f0-9]{32}/data\.json', data_url):
        reading.error = 'Invalid data manifest'
        return reading
    try:
        generation_bytes = fetch(base + 'data/' + data_url, MAX_GENERATION_BYTES)
    except FetchError as exc:
        reading.unreachable = f'{data_url}: {exc}'
        return reading
    try:
        reading.raw = json.loads(generation_bytes.decode('utf-8'))
    except (UnicodeError, ValueError):
        reading.raw = None
    try:
        result = run_site_reader(manifest_bytes, generation_bytes, node, reader)
    except RuntimeError as exc:
        reading.reader_error = str(exc)
        return reading
    if result.get('ok') is True and isinstance(result.get('dataset'), dict) and isinstance(reading.raw, dict):
        reading.parsed = result['dataset']
    else:
        reading.error = str(result.get('error') or 'The data integrity or format check failed')
    return reading


# ---------------------------------------------------------------- value helpers

def to_decimal(raw):
    if raw is None:
        return None
    text = str(raw).strip()
    if text in {'', '..', '...', '[x]', '[c]', '[z]'}:
        return None
    try:
        value = Decimal(text)
    except InvalidOperation as exc:
        raise SourceError(f'unrecognised number {text!r}') from exc
    if not value.is_finite():
        raise SourceError(f'unrecognised number {text!r}')
    return value


def quantize(value, step):
    return None if value is None else value.quantize(Decimal(step), rounding=ROUND_HALF_UP)


def month_key(year, month):
    return f'{year:04d}-{month:02d}'


def next_month(period):
    year, month = map(int, period.split('-'))
    return month_key(year + month // 12, month % 12 + 1)


def ons_month(label):
    match = re.fullmatch(r'(\d{4}) ([A-Z]{3})', label.strip())
    if not match or match[2] not in MONTHS:
        return None
    return month_key(int(match[1]), MONTHS[match[2]])


def boe_date(text):
    match = re.fullmatch(r'(\d{1,2}) ([A-Za-z]{3}) (\d{4})', text.strip())
    if not match or match[2].upper() not in MONTHS:
        raise SourceError(f'unrecognised Bank of England date {text!r}')
    return date(int(match[3]), MONTHS[match[2].upper()], int(match[1]))


def decode(body, what):
    try:
        return body.decode('utf-8-sig')
    except UnicodeError as exc:
        raise SourceError(f'{what} is not UTF-8') from exc


def page_text(body, what):
    class Text(HTMLParser):
        def __init__(self):
            super().__init__()
            self.parts, self.skip = [], 0
        def handle_starttag(self, tag, attrs):
            self.skip += tag in ('script', 'style')
        def handle_endtag(self, tag):
            self.skip -= tag in ('script', 'style') and self.skip > 0
        def handle_data(self, data):
            if not self.skip:
                self.parts.append(data)
    parser = Text()
    parser.feed(decode(body, what))
    return ' '.join(' '.join(parser.parts).replace(' ', ' ').replace(' ', ' ').split())


def quarter_start(day):
    return date(day.year, ((day.month - 1) // 3) * 3 + 1, 1)


def next_quarter_start(day):
    month = ((day.month - 1) // 3) * 3 + 4
    return date(day.year + (1 if month > 12 else 0), 1 if month > 12 else month, 1)


def is_calendar_quarter(start, end):
    return (start.year == end.year and start.day == 1 and start.month in {1, 4, 7, 10} and
            end == date(end.year, start.month + 2, calendar.monthrange(end.year, start.month + 2)[1]))


def ofgem_table_rates(body):
    """Extract {quarter_start_iso: {'electricity': (unit, standing), 'gas': (unit, standing)}} from Ofgem's DD table."""
    class Tables(HTMLParser):
        def __init__(self):
            super().__init__()
            self.tables, self.table, self.row, self.cell, self.text = [], None, None, False, []
        def handle_starttag(self, tag, attrs):
            if tag == 'table': self.table = []
            elif tag == 'tr' and self.table is not None: self.row = []
            elif tag in ('td', 'th') and self.row is not None: self.cell, self.text = True, []
        def handle_data(self, data):
            if self.cell: self.text.append(data)
        def handle_endtag(self, tag):
            if tag in ('td', 'th') and self.cell:
                self.row.append(' '.join(' '.join(self.text).replace('\u00a0', ' ').replace('\u202f', ' ').split()))
                self.cell = False
            elif tag == 'tr' and self.row is not None:
                self.table.append(self.row); self.row = None
            elif tag == 'table' and self.table is not None:
                self.tables.append(self.table); self.table = None
    parser = Tables()
    parser.feed(decode(body, 'Ofgem page'))
    matches = [rows for rows in parser.tables if rows and any('Energy price cap per unit' in c for c in rows[0])]
    if len(matches) != 1:
        return {}
    rows = matches[0]
    headers = rows[0]
    columns = {}
    for index, header in enumerate(headers):
        m = re.search(r'(\d{1,2}) ([A-Z][a-z]+)(?: (\d{4}))? to (\d{1,2}) ([A-Z][a-z]+) (\d{4})', header)
        if not m:
            continue
        try:
            start = date(int(m[3] or m[6]), MONTH_NAMES[m[2].lower()], int(m[1]))
            end = date(int(m[6]), MONTH_NAMES[m[5].lower()], int(m[4]))
        except (KeyError, ValueError):
            continue
        if is_calendar_quarter(start, end):
            period = start.isoformat()
            if period in columns:
                raise SourceError(f'Ofgem rates table has duplicate column for {period}')
            columns[period] = index
    rates = {}
    for period, col in columns.items():
        fuels = {}
        for row in rows[1:]:
            if not row:
                continue
            fuel = row[0].strip().lower()
            if fuel not in {'electricity', 'gas'}:
                continue
            if len(row) != len(headers):
                raise SourceError(f'Ofgem rates table row width mismatch for {period} ({fuel})')
            parts = re.fullmatch(r'([\d.]+) pence per kWh ([\d.]+) pence daily standing charge', row[col])
            if not parts:
                raise SourceError(f'Ofgem rates cell format changed for {period} ({fuel})')
            if fuel in fuels:
                raise SourceError(f'Ofgem rates table has duplicate {fuel} row for {period}')
            fuels[fuel] = (to_decimal(parts[1]), to_decimal(parts[2]))
        if set(fuels) != {'electricity', 'gas'}:
            raise SourceError(f'Ofgem dual-fuel rates incomplete for {period}')
        rates[period] = fuels
    return rates


@dataclass
class Official:
    """What the publisher says: observed values by period, and where it came from."""
    points: dict
    route: str
    upcoming: dict = field(default_factory=dict)
    rates: dict = field(default_factory=dict)


def official(points, route):
    points = {p: v for p, v in points.items() if v is not None}
    if not points:
        raise SourceError('no observations found')
    return Official(points, route)


# ---------------------------------------------------------------- official routes

class Sources:
    def __init__(self, fetch, today):
        self.fetch, self.today = fetch, today

    # ONS, collected as CSV by the site: read the JSON /data endpoint instead.
    def ons_json(self, key):
        definition = DEFINITIONS[key]
        url = definition.source_url + '/data'
        try:
            payload = json.loads(decode(self.fetch(url), 'ONS JSON'))
        except ValueError as exc:
            raise SourceError('ONS JSON is invalid') from exc
        if not isinstance(payload, dict) or (payload.get('description') or {}).get('cdid') != definition.series:
            raise SourceError('ONS JSON is not the expected series')
        points = {}
        for entry in payload.get('months') or []:
            period = ons_month(str((entry or {}).get('date', '')))
            if period is None:
                raise SourceError('unrecognised ONS JSON month')
            points[period] = to_decimal(entry.get('value'))
        return official(points, f'ONS JSON {definition.series}/{definition.dataset}')

    # ONS, collected as JSON by the site: read the CSV generator instead.
    def ons_csv(self, key):
        definition = DEFINITIONS[key]
        uri = definition.source_url.removeprefix(ONS)
        url = f'{ONS}/generator?format=csv&uri={uri}'
        try:
            rows = list(csv.reader(io.StringIO(decode(self.fetch(url), 'ONS CSV')), strict=True))
        except csv.Error as exc:
            raise SourceError('ONS CSV is invalid') from exc
        meta = {row[0]: row[1] for row in rows if len(row) == 2 and not re.match(r'\d{4}', row[0])}
        if meta.get('CDID') != definition.series:
            raise SourceError('ONS CSV is not the expected series')
        points = {}
        for row in rows:
            period = ons_month(row[0]) if len(row) == 2 else None
            if period is None:
                continue
            # MGSX is dated by the middle month of its three-month window; the site shows the window end.
            points[next_month(period) if key == 'unemployment' else period] = to_decimal(row[1])
        return official(points, f'ONS CSV {definition.series}/{definition.dataset}')

    # Bank of England: the tabular (CSVF=TN) download, a bounded recent window.
    def boe(self, codes, since):
        start = f'{since.day:02d}/{MONTH_ABBR[since.month - 1]}/{since.year}'
        url = (f'{BOE}/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom={start}'
               f'&Dateto=now&SeriesCodes={",".join(codes)}&CSVF=TN&UsingCodes=Y')
        rows = list(csv.reader(io.StringIO(decode(self.fetch(url), 'Bank of England CSV'))))
        if not rows or rows[0][:1] != ['DATE'] or rows[0][1:] != list(codes):
            raise SourceError('Bank of England response is not the expected table')
        table = {code: {} for code in codes}
        for row in rows[1:]:
            if not row:
                continue
            if len(row) != len(codes) + 1:
                raise SourceError('unexpected Bank of England row width')
            when = boe_date(row[0])
            for code, raw in zip(codes, row[1:]):
                table[code][when] = to_decimal(raw)
        return table

    def boe_series(self, key):
        series = DEFINITIONS[key].series
        if key == 'bank_rate' or key.startswith('gilt_'):
            codes = ('IUDBEDR',) if key == 'bank_rate' else ('IUDSNPY', 'IUDMNPY', 'IUDLNPY')
            table = self.boe(codes, self.today - timedelta(days=45))
            return official({d.isoformat(): v for d, v in table[series].items()},
                            f'Bank of England IADB {series} (tabular)')
        codes = ('IUMBV34', 'IUMBV42')
        table = self.boe(codes, self.today - timedelta(days=430))
        return official({month_key(d.year, d.month): v for d, v in table[series].items()},
                        f'Bank of England IADB {series} (tabular)')

    # ONS private rents: dataset page -> newest dated workbook -> Table 1, UK row.
    def private_rents(self, key):
        page = decode(self.fetch(DEFINITIONS[key].source_url, MAX_PAGE_BYTES), 'ONS rents page')
        editions = []
        for match in re.finditer(
                r'/file\?uri=(?:%2F|/)economy(?:%2F|/)inflationandpriceindices(?:%2F|/)datasets(?:%2F|/)'
                r'priceindexofprivaterentsukmonthlypricestatistics(?:%2F|/)(\d{1,2})([a-z]+)(\d{4})(?:%2F|/)'
                r'priceindexofprivaterentsukmonthlypricestatistics(\d*)\.xlsx', page):
            month = MONTH_NAMES.get(match[2])
            if month:
                try:
                    editions.append((date(int(match[3]), month, int(match[1])), int(match[4] or 0), match[0]))
                except ValueError:
                    continue
        if not editions:
            raise SourceError('no dated rents workbook link found')
        link = max(editions)[2]
        book = self.fetch(ONS + link, MAX_PIPR_BYTES)
        column = 'Annual change' if key == 'private_rent_growth' else 'Rental price'
        points = {}
        header = None
        for row in xlsx_rows(book, 'Table 1'):
            if header is None:
                if row.get('B') == 'Area code':
                    header = {}
                    for col, text in row.items():
                        header.setdefault(text, col)
                    if column not in header or 'Time period' not in header:
                        raise SourceError('rents Table 1 columns changed')
                continue
            if row.get('B') != 'K02000001':
                continue
            period = excel_month(row.get('A'))
            value = to_decimal(row.get(header[column]))
            points[period] = quantize(value, '0.1') if key == 'private_rent_growth' else value
        if header is None:
            raise SourceError('rents Table 1 header not found')
        return official(points, f'ONS rents workbook {link.rsplit("/", 2)[-2]} Table 1 (UK)')

    # Land Registry: gov.uk collection -> newest downloads page -> Average-prices CSV, UK row.
    def house_prices(self, key):
        collection = decode(self.fetch(DEFINITIONS[key].source_url, MAX_PAGE_BYTES), 'UK HPI collection page')
        editions = []
        for match in re.finditer(
                r'/government/statistical-data-sets/uk-house-price-index-data-downloads-([a-z]+)-(\d{4})(?:--(\d+))?',
                collection):
            if match[1] in MONTH_NAMES:
                editions.append((int(match[2]), MONTH_NAMES[match[1]], int(match[3] or 0), match[0]))
        if not editions:
            raise SourceError('no UK HPI downloads page found')
        release = decode(self.fetch('https://www.gov.uk' + max(editions)[3], MAX_PAGE_BYTES), 'UK HPI downloads page')
        files = sorted({(int(m[1]), int(m[2]), m[0]) for m in re.finditer(
            r'https://publicdata\.landregistry\.gov\.uk/market-trend-data/house-price-index-data/'
            r'Average-prices-(\d{4})-(\d{2})\.csv', release)})
        if not files:
            raise SourceError('no Average-prices CSV link found')
        body = decode(self.fetch(files[-1][2], MAX_HPI_BYTES), 'UK HPI CSV')
        points = {}
        for row in csv.DictReader(io.StringIO(body, newline='')):
            if row.get('Area_Code') != 'K02000001':
                continue
            if key == 'house_price_level':
                points[row['Date'][:7]] = quantize(to_decimal(row['Average_Price']), '1')
            else:
                points[row['Date'][:7]] = quantize(to_decimal(row['Annual_Change']), '0.1')
        return official(points, f'Land Registry {files[-1][2].rsplit("/", 1)[-1]} (UK)')

    # DESNZ weekly road fuel: gov.uk statistics page -> CSV.
    def fuel(self, key):
        page = decode(self.fetch(DEFINITIONS[key].source_url, MAX_PAGE_BYTES), 'DESNZ fuel page')
        links = sorted(set(re.findall(
            r'"contentUrl"\s*:\s*"(https://assets\.publishing\.service\.gov\.uk/media/[a-f0-9]+/CSV__2018_-__\.csv)"', page)))
        if len(links) != 1:
            raise SourceError('DESNZ fuel CSV link not found or ambiguous')
        rows = list(csv.DictReader(io.StringIO(decode(self.fetch(links[0], MAX_PAGE_BYTES), 'DESNZ fuel CSV'), newline='')))
        wanted = 'ULSP' if key == 'petrol_price' else 'ULSD'
        columns = [name for name in (rows[0] if rows else {}) if name.startswith(wanted) and 'Pump price' in name]
        if len(columns) != 1:
            raise SourceError('DESNZ fuel price column changed')
        points = {}
        for row in rows:
            try:
                when = datetime.strptime(row['Date'], '%d/%m/%Y').date()
            except (KeyError, ValueError) as exc:
                raise SourceError('unrecognised DESNZ date') from exc
            points[when.isoformat()] = to_decimal(row[columns[0]])
        return official(points, 'DESNZ weekly road fuel CSV')

    # Ofgem: the price cap page headline(s) plus Direct Debit average rates table.
    def energy(self, key):
        raw = self.fetch(DEFINITIONS[key].source_url, MAX_PAGE_BYTES)
        text = page_text(raw, 'Ofgem page')
        next_q = next_quarter_start(self.today)
        points, upcoming = {}, {}
        for match in re.finditer(
                r'From (\d{1,2}) ([A-Z][a-z]+)(?: (\d{4}))? to (\d{1,2}) ([A-Z][a-z]+) (\d{4}), the price cap will be £([\d,]+) per year', text):
            try:
                start = date(int(match[3] or match[6]), MONTH_NAMES[match[2].lower()], int(match[1]))
                end = date(int(match[6]), MONTH_NAMES[match[5].lower()], int(match[4]))
            except (KeyError, ValueError):
                continue
            if not is_calendar_quarter(start, end):
                continue
            value = to_decimal(match[7].replace(',', ''))
            period = start.isoformat()
            if start <= self.today <= end:
                if period in points:
                    raise SourceError('Ofgem cap headline is ambiguous')
                points[period] = value
            elif start == next_q:
                if period in upcoming:
                    raise SourceError('Ofgem cap headline is ambiguous')
                upcoming[period] = value
        if len(points) > 1 or len(upcoming) > 1:
            raise SourceError('Ofgem cap headline is ambiguous')
        if not points and not upcoming:
            raise SourceError('Ofgem cap in force today not found')
        rates = ofgem_table_rates(raw)
        if not points:
            current_q = quarter_start(self.today).isoformat()
            upcoming_q = next(iter(upcoming))
            if current_q not in rates or upcoming_q not in rates:
                raise SourceError('Ofgem rates table missing current or upcoming quarter')
        return Official(points, 'Ofgem price cap page', upcoming=upcoming, rates=rates)

    # ONS affordability: dataset page -> workbook -> Table 1c, England and Wales row.
    def affordability(self, key):
        page = decode(self.fetch(DEFINITIONS[key].source_url, MAX_PAGE_BYTES), 'ONS affordability page')
        links = sorted(set(re.findall(
            r'"contentUrl"\s*:\s*"(https://www\.ons\.gov\.uk/file\?uri=/peoplepopulationandcommunity/housing/datasets/'
            r'ratioofhousepricetoworkplacebasedearningslowerquartileandmedian/current/[a-z0-9]+\.xlsx)"', page)))
        if len(links) != 1:
            raise SourceError('ONS affordability workbook link not found or ambiguous')
        years = None
        points = {}
        for row in xlsx_rows(self.fetch(links[0], MAX_AFFORDABILITY_BYTES), '1c'):
            if years is None:
                if row.get('A') == 'Code' and row.get('B') == 'Name':
                    years = {col: text for col, text in row.items() if re.fullmatch(r'\d{4}', text or '')}
                continue
            if row.get('A') == 'K04000001':
                for col, year in years.items():
                    points[year] = quantize(to_decimal(row.get(col)), '0.01')
                break
        if years is None:
            raise SourceError('affordability Table 1c header not found')
        return official(points, 'ONS affordability workbook Table 1c (England and Wales)')

    def read(self, key):
        if key in ('cpih', 'gdp', 'public_debt'):
            return self.ons_json(key)
        if key in JSON_TIMESERIES:
            return self.ons_csv(key)
        if key == 'bank_rate' or key.startswith(('gilt_', 'mortgage_')):
            return self.boe_series(key)
        if key.startswith('private_rent_'):
            return self.private_rents(key)
        if key.startswith('house_price_'):
            return self.house_prices(key)
        if key in ('petrol_price', 'diesel_price'):
            return self.fuel(key)
        if key == 'household_energy':
            return self.energy(key)
        if key == 'price_to_earnings':
            return self.affordability(key)
        raise SourceError('no official cross-check route is defined for this metric')


# ---------------------------------------------------------------- minimal xlsx reader

SHEET_NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL_ID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def excel_month(serial):
    try:
        day = date(1899, 12, 30) + timedelta(days=int(float(serial)))
    except (TypeError, ValueError, OverflowError) as exc:
        raise SourceError('unrecognised workbook date') from exc
    return month_key(day.year, day.month)


def xlsx_rows(body, sheet_name):
    """Yield {column letter: text} for each row of one named sheet; bounded and standard library only."""
    try:
        book = zipfile.ZipFile(io.BytesIO(body))
        if sum(info.file_size for info in book.infolist()) > MAX_XLSX_UNCOMPRESSED:
            raise SourceError('workbook expands beyond the allowed size')
        sheets = ET.fromstring(book.read('xl/workbook.xml')).find(SHEET_NS + 'sheets')
        sheet = next(node for node in sheets if node.get('name') == sheet_name)
        targets = {rel.get('Id'): rel.get('Target')
                   for rel in ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))}
        path = targets[sheet.get(REL_ID)].lstrip('/')
        path = path if path.startswith('xl/') else 'xl/' + path
        strings = []
        if 'xl/sharedStrings.xml' in book.namelist():
            strings = [''.join(t.text or '' for t in item.iter(SHEET_NS + 't'))
                       for item in ET.fromstring(book.read('xl/sharedStrings.xml')).findall(SHEET_NS + 'si')]
        rows = []
        for _, node in ET.iterparse(book.open(path), events=('end',)):
            if node.tag != SHEET_NS + 'row':
                continue
            row = {}
            for cell in node.findall(SHEET_NS + 'c'):
                column = re.match(r'[A-Z]+', cell.get('r', '')).group()
                value = cell.find(SHEET_NS + 'v')
                text = value.text if value is not None else None
                if cell.get('t') == 's' and text is not None:
                    text = strings[int(text)]
                elif cell.get('t') == 'inlineStr':
                    text = ''.join(t.text or '' for t in cell.iter(SHEET_NS + 't'))
                row[column] = None if text is None else text.strip()
            node.clear()
            rows.append(row)
        return rows
    except SourceError:
        raise
    except (KeyError, StopIteration, AttributeError, IndexError, ValueError, TypeError,
            OSError, zipfile.BadZipFile, ET.ParseError, NotImplementedError) as exc:
        raise SourceError(f'workbook could not be read: {type(exc).__name__}') from exc


# ---------------------------------------------------------------- comparison

def site_points(metric):
    points = {}
    for point in metric.get('history') or []:
        if isinstance(point, dict) and isinstance(point.get('period'), str):
            value = to_decimal(point.get('value'))
            if value is not None:
                points[point['period']] = value
    return points


def compare(site, truth, periods=HISTORY_PERIODS):
    """Differences between site and publisher: latest period, latest value, recent history."""
    problems = []
    if not site:
        return ['the site has no observations']
    site_latest, official_latest = max(site), max(truth)
    if site_latest != official_latest:
        problems.append(f'latest period: site {site_latest} ({site[site_latest]}), '
                        f'official {official_latest} ({truth[official_latest]})')
    elif site[site_latest] != truth[official_latest]:
        problems.append(f'latest value for {site_latest}: site {site[site_latest]}, '
                        f'official {truth[official_latest]}')
    recent = sorted(truth)[-periods:]
    floor = recent[0]
    for period in sorted(set(recent) | {p for p in site if p >= floor}):
        if period == site_latest and period == official_latest:
            continue  # already compared above
        if period > site_latest and period not in site:
            continue  # the site is behind; reported once as the latest-period difference
        mine, theirs = site.get(period), truth.get(period)
        if mine is None and theirs is not None:
            problems.append(f'{period}: missing on the site (official {theirs})')
        elif theirs is None and mine is not None:
            if period <= official_latest:
                problems.append(f'{period}: site {mine}, not in the official data')
        elif mine != theirs:
            problems.append(f'{period}: site {mine}, official {theirs}')
    return problems


def _compare_energy_rates(label, point, expected_rates):
    problems = []
    ref = (point or {}).get('reference') or {}
    for fuel in ('electricity', 'gas'):
        site_fuel = ref.get(fuel) or {}
        want_unit, want_standing = expected_rates[fuel]
        got_unit = to_decimal(site_fuel.get('unit_rate_p_per_kwh')) if site_fuel.get('unit_rate_p_per_kwh') is not None else None
        got_standing = to_decimal(site_fuel.get('standing_charge_p_per_day')) if site_fuel.get('standing_charge_p_per_day') is not None else None
        if got_unit != want_unit:
            problems.append(f'{label} {fuel} unit rate: site {got_unit}, official {want_unit}')
        if got_standing != want_standing:
            problems.append(f'{label} {fuel} standing charge: site {got_standing}, official {want_standing}')
    return problems


def compare_energy(metric, truth, today, periods=HISTORY_PERIODS):
    problems = []
    if truth.points:
        problems.extend(compare(site_points(metric), truth.points, periods))
    else:
        current = quarter_start(today).isoformat()
        latest = (metric or {}).get('latest') or {}
        if latest.get('period') != current:
            problems.append(f'latest period: site {latest.get("period")}, official {current}')
        else:
            problems.extend(_compare_energy_rates(f'current cap ({current})', latest, truth.rates[current]))
    upcoming = (metric or {}).get('upcoming_period')
    if truth.upcoming:
        want_period, want_value = next(iter(truth.upcoming.items()))
        if not isinstance(upcoming, dict):
            problems.append(f'upcoming cap: site none, official {want_period} ({want_value})')
        else:
            got_period = upcoming.get('period')
            got_value = to_decimal(upcoming.get('value')) if upcoming.get('value') is not None else None
            if got_period != want_period:
                problems.append(f'upcoming period: site {got_period} ({got_value}), official {want_period} ({want_value})')
            elif got_value != want_value:
                problems.append(f'upcoming value for {want_period}: site {got_value}, official {want_value}')
            if want_period in truth.rates and got_period == want_period:
                problems.extend(_compare_energy_rates(f'upcoming cap ({want_period})', upcoming, truth.rates[want_period]))
    elif upcoming is not None:
        if isinstance(upcoming, dict):
            problems.append(f'upcoming cap: site {upcoming.get("period")} ({upcoming.get("value")}), official none')
        else:
            problems.append(f'upcoming cap: site {upcoming!r}, official none')
    return problems


# ---------------------------------------------------------------- the report

@dataclass
class MetricResult:
    key: str
    kinds: list = field(default_factory=list)
    site: str = ''
    official: str = ''
    route: str = ''
    details: list = field(default_factory=list)

    @property
    def problem(self):
        return any(kind != OK for kind in self.kinds)


@dataclass
class ReportLinkProblem:
    key: str
    kind: str
    url: str
    detail: str


@dataclass
class Report:
    site_url: str
    generation_id: str | None
    checked_at: str
    results: list
    site_problem: str | None = None  # whole-generation rejection or an unreadable site
    report_link_problems: list = field(default_factory=list)

    @property
    def problems(self):
        return [result for result in self.results if result.problem]

    @property
    def clean(self):
        return self.site_problem is None and not self.problems and not self.report_link_problems


def latest_text(metric):
    latest = (metric or {}).get('latest')
    if isinstance(latest, dict) and latest.get('value') is not None:
        return f"{latest['value']} ({latest.get('period')})"
    return 'none'


def check_site_metric(key, raw, parsed):
    """Site-side states that need no official fetch: rejected, unavailable, overdue."""
    result = MetricResult(key)
    raw_metric = (raw.get('metrics') or {}).get(key)
    parsed_metric = (parsed.get('metrics') or {}).get(key)
    raw_metric = raw_metric if isinstance(raw_metric, dict) else None
    parsed_metric = parsed_metric if isinstance(parsed_metric, dict) else None
    flagged = any(m and m.get('verification_rejected') is True for m in (raw_metric, parsed_metric))
    was_verified = bool(raw_metric and raw_metric.get('validation_status') == 'verified')
    gone = parsed_metric is None or parsed_metric.get('validation_status') == 'unavailable'
    if flagged or (was_verified and gone):
        result.kinds.append(REJECTED)
        result.details.append('published as verified, but the site reader dropped it'
                              if not flagged else 'the site reader rejected it (verification_rejected)')
        return result, None
    if gone:
        result.kinds.append(UNAVAILABLE)
        result.details.append('missing from the live generation' if raw_metric is None
                              else 'the live generation marks it unavailable')
        return result, None
    result.site = latest_text(parsed_metric)
    if parsed_metric.get('release_status') == 'delayed' or (raw_metric or {}).get('release_status') == 'delayed':
        result.kinds.append(OVERDUE)
        due = parsed_metric.get('next_release_date') or (raw_metric or {}).get('next_release_date')
        result.details.append('the next release is overdue' + (f' (was due {due})' if due else ''))
    return result, parsed_metric


def check_research_report_links(site_url, fetch):
    """Verify non-placeholder AI report summary source URLs in live research_report.json return HTTP 200."""
    base = site_url if site_url.endswith('/') else site_url + '/'
    report_url = base + 'research_report.json'
    try:
        raw_bytes = fetch(report_url, MAX_SMALL_BYTES)
    except FetchError as exc:
        if exc.status == 404:
            return []
        return [ReportLinkProblem('research_report.json', COULD_NOT_CHECK, report_url, str(exc))]
    except Exception as exc:
        return [ReportLinkProblem('research_report.json', COULD_NOT_CHECK, report_url,
                                  f'{type(exc).__name__}: {exc}')]
    try:
        payload = json.loads(decode(raw_bytes, 'research_report.json'))
    except (SourceError, ValueError, RecursionError) as exc:
        return [ReportLinkProblem('research_report.json', COULD_NOT_CHECK, report_url,
                                  f'invalid JSON: {exc}')]
    if not isinstance(payload, dict):
        return [ReportLinkProblem('research_report.json', COULD_NOT_CHECK, report_url,
                                  'research_report.json root must be an object')]
    summaries = payload.get('current_report_summaries')
    if summaries is None:
        return []
    if not isinstance(summaries, dict):
        return [ReportLinkProblem('research_report.json', COULD_NOT_CHECK, report_url,
                                  'current_report_summaries must be an object')]
    problems = []
    for key, entry in summaries.items():
        if not isinstance(entry, dict):
            problems.append(ReportLinkProblem(str(key), COULD_NOT_CHECK, '', 'report entry must be an object'))
            continue
        source = entry.get('source')
        if source is None:
            continue
        if not isinstance(source, str):
            problems.append(ReportLinkProblem(str(key), BROKEN_LINK, '', 'source URL must be a string'))
            continue
        url = source.strip()
        if url.lower() in REPORT_SOURCE_PLACEHOLDERS:
            continue
        parts = urlsplit(url)
        if (parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or
                parts.hostname not in OFFICIAL_HOSTS):
            problems.append(ReportLinkProblem(str(key), BROKEN_LINK, url,
                                              'source URL is not an allowed official HTTPS URL'))
            continue
        try:
            if hasattr(fetch, 'check_url'):
                fetch.check_url(url)
            else:
                fetch(url, MAX_SMALL_BYTES)
        except FetchError as exc:
            kind = (BROKEN_LINK if exc.status is not None and 400 <= exc.status < 500 and exc.status != 429
                    else COULD_NOT_CHECK)
            problems.append(ReportLinkProblem(str(key), kind, url, str(exc)))
        except Exception as exc:
            problems.append(ReportLinkProblem(str(key), COULD_NOT_CHECK, url,
                                              f'{type(exc).__name__}: {exc}'))
    return problems


def run_check(site_url, fetch, today=None, node='node', reader=VERIFIED_MJS,
              periods=HISTORY_PERIODS, now=None):
    now = now or datetime.now(timezone.utc)
    today = today or now.astimezone(LONDON).date()
    reading = read_site(site_url, fetch, node, reader)
    report = Report(site_url, reading.generation_id, now.strftime('%Y-%m-%d %H:%M UTC'), [])
    if reading.unreachable:
        report.site_problem = f'Could not read the live site: {reading.unreachable}'
        return report
    if reading.reader_error:
        report.site_problem = f'Could not run the site reader: {reading.reader_error}'
        return report
    if reading.error:
        report.site_problem = f'The live generation was rejected by the site reader: {reading.error}'
        return report
    sources = Sources(fetch, today)
    for key in DEFINITIONS:
        result, metric = check_site_metric(key, reading.raw, reading.parsed)
        report.results.append(result)
        if metric is None:
            continue
        try:
            truth = sources.read(key)
            result.route = truth.route
            if key == 'household_energy':
                if truth.points:
                    latest = max(truth.points)
                    official_parts = [f'{truth.points[latest]} ({latest})']
                else:
                    official_parts = [f'{quarter_start(today).isoformat()} table rates']
                site_up = metric.get('upcoming_period')
                if truth.upcoming:
                    up_period, up_value = next(iter(truth.upcoming.items()))
                    official_parts.append(f'upcoming {up_value} ({up_period})')
                    if isinstance(site_up, dict) and site_up.get('value') is not None:
                        result.site = f"{result.site}; upcoming {site_up['value']} ({site_up.get('period')})"
                    else:
                        result.site = f'{result.site}; upcoming none'
                elif site_up is not None:
                    official_parts.append('upcoming none')
                    if isinstance(site_up, dict) and site_up.get('value') is not None:
                        result.site = f"{result.site}; upcoming {site_up['value']} ({site_up.get('period')})"
                    else:
                        result.site = f'{result.site}; upcoming unexpected'
                result.official = '; '.join(official_parts)
                differences = compare_energy(metric, truth, today, periods)
            else:
                latest = max(truth.points)
                result.official = f'{truth.points[latest]} ({latest})'
                differences = compare(site_points(metric), truth.points, periods)
        except Exception as exc:
            # Any unexpected source format change must degrade to "could not check" for this
            # metric rather than aborting the whole run without opening an issue.
            result.kinds.append(COULD_NOT_CHECK)
            result.details.append(f'{type(exc).__name__}: {exc}')
            continue
        if differences:
            result.kinds.append(MISMATCH)
            result.details.extend(differences)
        if not result.kinds:
            result.kinds.append(OK)
    report.report_link_problems = check_research_report_links(site_url, fetch)
    return report


def _safe_markdown(text):
    """Prevent untrusted publisher text from injecting mentions or breaking Markdown lines."""
    clean = ' '.join(str(text).split())
    return re.sub(r'@(?=[A-Za-z0-9])', '@\u200b', clean)


def render_report(report, run_url=None):
    lines = [ISSUE_MARKER, '']
    counts = {}
    for result in report.results:
        for kind in (result.kinds or [OK]):
            counts[kind] = counts.get(kind, 0) + 1
    lines.append(f'Live site: {report.site_url} · generation `{report.generation_id or "unknown"}` · '
                 f'checked {report.checked_at}' + (f' · [run]({run_url})' if run_url else ''))
    lines.append('')
    if report.site_problem:
        lines += [f'**{_safe_markdown(report.site_problem)}**', '']
    elif report.clean:
        lines += [f'All {len(report.results)} figures match their official sources.', '']
    else:
        link_count = len(report.report_link_problems)
        link_noun = 'link needs' if link_count == 1 else 'links need'
        if report.problems:
            summary = ', '.join(f'{counts[kind]} {PROBLEM_LABEL[kind].lower()}'
                                for kind in (MISMATCH, REJECTED, OVERDUE, UNAVAILABLE, COULD_NOT_CHECK) if kind in counts)
            suffix = f' {link_count} AI report source {link_noun} attention.' if link_count else ''
            lines += [f'{len(report.problems)} of {len(report.results)} figures need attention: {summary}; '
                      f'{counts.get(OK, 0)} match.{suffix}', '']
        else:
            lines += [f'All {len(report.results)} figures match their official sources, '
                      f'but {link_count} AI report source {link_noun} attention.', '']
    if report.problems:
        lines += ['| Figure | Result | On the site | Official |', '| --- | --- | --- | --- |']
        for result in report.problems:
            kinds = ', '.join(PROBLEM_LABEL[kind] for kind in result.kinds if kind != OK)
            site_cell = _safe_markdown(result.site or '-').replace('|', '/')
            official_cell = _safe_markdown(result.official or '-').replace('|', '/')
            lines.append(f'| `{result.key}` | {kinds} | {site_cell} | {official_cell} |')
        lines.append('')
        for result in report.problems:
            lines.append(f'**`{result.key}`**' + (f' — {result.route}' if result.route else ''))
            lines += [f'- {_safe_markdown(detail)}' for detail in result.details[:8]]
            if len(result.details) > 8:
                lines.append(f'- … and {len(result.details) - 8} more')
            lines.append('')
    if report.report_link_problems:
        lines += ['### AI report source links', '']
        lines += ['| Report | Result | Source URL | Detail |', '| --- | --- | --- | --- |']
        for item in report.report_link_problems:
            key_cell = _safe_markdown(item.key).replace('|', '/')
            url_cell = _safe_markdown(item.url or '-').replace('|', '/')
            detail_cell = _safe_markdown(item.detail).replace('|', '/')
            lines.append(f'| `{key_cell}` | {PROBLEM_LABEL[item.kind]} | {url_cell} | {detail_cell} |')
        lines.append('')
    matching = [result.key for result in report.results if not result.problem]
    if matching and not report.site_problem:
        lines += ['<details><summary>Matching figures</summary>', '', ', '.join(f'`{key}`' for key in matching),
                  '', '</details>', '']
    lines.append('A "could not check" is never a pass: the source was unreachable or unreadable today.')
    return '\n'.join(lines)


# ---------------------------------------------------------------- GitHub issue lifecycle

BOT_LOGINS = frozenset({'github-actions[bot]'})


class GitHubClient:
    def __init__(self, token, repo, opener=urlopen):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo or ''):
            raise ValueError('GITHUB_REPOSITORY must be owner/name')
        self.token, self.repo, self.opener = token, repo, opener

    def _call(self, method, path, payload=None):
        data = None if payload is None else json.dumps(payload).encode('utf-8')
        request = Request(f'https://api.github.com/repos/{self.repo}{path}', data=data, method=method, headers={
            'Authorization': f'Bearer {self.token}', 'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': USER_AGENT,
            'Content-Type': 'application/json'})
        with self.opener(request, timeout=30) as response:
            return json.loads(response.read(MAX_SMALL_BYTES + 1).decode('utf-8') or 'null')

    def open_issues(self):
        found = []
        for page in range(1, 6):
            batch = self._call('GET', f'/issues?state=open&per_page=100&page={page}')
            found += [issue for issue in batch if 'pull_request' not in issue]
            if len(batch) < 100:
                break
        return found

    def create_issue(self, title, body):
        return self._call('POST', '/issues', {'title': title, 'body': body})

    def comment(self, number, body):
        return self._call('POST', f'/issues/{number}/comments', {'body': body})

    def close(self, number):
        return self._call('PATCH', f'/issues/{number}', {'state': 'closed', 'state_reason': 'completed'})


def find_open_issue(client):
    for issue in client.open_issues():
        author = (issue.get('user') or {}).get('login')
        if author not in BOT_LOGINS:
            continue
        if issue.get('title') == ISSUE_TITLE or ISSUE_MARKER in (issue.get('body') or ''):
            return issue
    return None


def sync_issue(report, body, client, dry_run=False, out=print):
    """One open issue at most: open on a problem, comment on repeats, close when clean."""
    existing = find_open_issue(client) if client else None
    if report.clean:
        if existing is None:
            out('Everything matches and no cross-check issue is open: nothing to send.')
            return 'nothing'
        if dry_run:
            out(f'Dry run: would comment on and close issue #{existing["number"]}.')
            return 'would_close'
        client.comment(existing['number'], f'{ISSUE_MARKER}\n\nAll figures match their official sources again '
                       f'(generation `{report.generation_id}`, checked {report.checked_at}). Closing.')
        client.close(existing['number'])
        out(f'Closed issue #{existing["number"]}.')
        return 'closed'
    if existing is None:
        if dry_run:
            out('Dry run: would open a new cross-check issue.')
            return 'would_open'
        created = client.create_issue(ISSUE_TITLE, body)
        out(f'Opened issue #{created.get("number")}.')
        return 'opened'
    if dry_run:
        out(f'Dry run: would comment on open issue #{existing["number"]}.')
        return 'would_comment'
    client.comment(existing['number'], body)
    out(f'Commented on issue #{existing["number"]}.')
    return 'commented'


# ---------------------------------------------------------------- command line

def main(argv=None, fetch=None, client=None, env=None, out=print):
    env = os.environ if env is None else env
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--site', default=DEFAULT_SITE, help='live site base URL')
    parser.add_argument('--repo', default=env.get('GITHUB_REPOSITORY'), help='owner/name for the issue')
    parser.add_argument('--history', type=int, default=HISTORY_PERIODS, help='recent periods to compare')
    parser.add_argument('--node', default='node')
    parser.add_argument('--dry-run', action='store_true', help='print the report; never write to GitHub')
    args = parser.parse_args(argv)
    if fetch is None:
        fetch = make_fetcher(OFFICIAL_HOSTS | {urlsplit(args.site).hostname})
    report = run_check(args.site, CachedFetcher(fetch), node=args.node, periods=args.history)
    run_url = None
    if env.get('GITHUB_SERVER_URL') and env.get('GITHUB_REPOSITORY') and env.get('GITHUB_RUN_ID'):
        run_url = f"{env['GITHUB_SERVER_URL']}/{env['GITHUB_REPOSITORY']}/actions/runs/{env['GITHUB_RUN_ID']}"
    body = render_report(report, run_url)
    out(body)
    if client is None and env.get('GITHUB_TOKEN') and args.repo:
        client = GitHubClient(env['GITHUB_TOKEN'], args.repo)
    if client is None and not args.dry_run and not report.clean:
        out('No GITHUB_TOKEN/GITHUB_REPOSITORY: cannot open an issue.', )
        return 1
    if client is None and not args.dry_run:
        out('Everything matches; no GitHub credentials, nothing to send.')
        return 0
    try:
        sync_issue(report, body, client, args.dry_run, out)
    except (URLError, OSError, ValueError) as exc:
        out(f'GitHub request failed: {exc}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
