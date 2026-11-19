"""ONS house price to workplace-based earnings ratio (spec M11 slice 2, issue #135)."""
from datetime import date, timedelta
import hashlib
import io
import json
import zipfile

import pytest

from finstats.__main__ import collect
from finstats.delivery import deliver
from finstats.sources import (
    DEFINITIONS, OPTIONAL_METRICS, ONS_AFFORDABILITY_URL, ValidationError, parse,
    parse_ons_dataset_page, public_definition,
)
from finstats.publication import publish
from finstats.storage import Store
from tests import affordability_workbook as workbook
from tests.test_finstats_publication import read_generation
from tests.test_finstats_sources import FIXTURES, fixture, fixture_transport
from tests.test_finstats_storage import CPI_WHEN

KEY = 'price_to_earnings'
TODAY = date(2026, 10, 22)
VALUES = ['3.55', '3.66', '3.89']


def build(values=VALUES, **kwargs):
    return workbook.build(workbook.table_rows(values, **kwargs))


def page_body():
    return (FIXTURES / 'ons_house_price_earnings_dataset_page_2026-03-26.html').read_bytes()


def test_definition_is_annual_england_and_wales_ratio_with_official_source():
    definition = public_definition(KEY)
    assert definition['frequency'] == 'annual'
    assert definition['unit'] == 'ratio'
    assert definition['geography'] == 'England and Wales'
    assert definition['area_code'] == 'K04000001'
    assert definition['series'] == 'Table 1c'
    assert definition['dataset'] == 'House price to workplace-based earnings ratio'
    assert definition['source_url'] == definition['download_url'] == ONS_AFFORDABILITY_URL
    assert definition['release_caveat'].startswith('Latest year provisional')
    assert set(OPTIONAL_METRICS[KEY]) <= set(definition)


def test_recorded_workbook_gives_the_full_annual_history_at_published_precision():
    snapshot = parse(KEY, fixture(KEY), TODAY)
    periods = [point.period for point in snapshot.observations]
    assert periods == [str(year) for year in range(1997, 2026)]
    assert all(point.status == 'observed' for point in snapshot.observations)
    values = {point.period: point.value for point in snapshot.observations}
    # Cell 5.0599999999999996 is published as 5.06 (Table 1c format #,##0.00).
    assert (values['1997'], values['2002'], values['2008'], values['2021'], values['2023']) == (
        '3.55', '5.06', '6.90', '8.95', '8.28')
    assert values['2025'] == '7.55'
    assert snapshot.published_date is None  # The dataset page, not the workbook, carries the date.
    assert snapshot.definition.metric_id == 'ew.house_price.median_earnings_ratio'


def test_recorded_page_gives_the_release_date_and_the_one_workbook_link():
    published, url = parse_ons_dataset_page(page_body())
    assert published == '2026-03-26'
    assert url == fixture_transport(KEY)[1]
    assert url.startswith('https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/housing/datasets/')


def mutate_page(old, new):
    text = page_body().decode()
    assert old in text
    return text.replace(old, new, 1).encode()


@pytest.mark.parametrize(('old', 'new', 'message'), [
    ('/current/aff1ratioofhousepricetoworkplacebasedearnings.xlsx', '/current/aff1.csv', 'workbook link'),
    ('https://www.ons.gov.uk/file?uri=', 'https://example.com/file?uri=', 'workbook link'),
    ('"datePublished": "2026-03-26T00:00:00.000Z"', '"datePublished": "yesterday"', 'publication date'),
    ('"@type": "Dataset"', '"@type": "WebPage"', 'description unavailable'),
    ('House price to workplace-based earnings ratio",', 'Something else",', 'identity'),
    ('open-government-licence/version/3/', 'open-government-licence/version/2/', 'identity'),
])
def test_dataset_page_changes_are_rejected(old, new, message):
    with pytest.raises(ValidationError, match=message):
        parse_ons_dataset_page(mutate_page(old, new))


def test_dataset_page_with_two_workbook_links_is_ambiguous():
    block = ('"distribution": [{"@type": "DataDownload", "encodingFormat": "xlsx", "contentUrl": "%s"},'
             ' {"@type": "DataDownload", "encodingFormat": "xlsx", "contentUrl": "%s"}],')
    url = fixture_transport(KEY)[1]
    text = page_body().decode()
    start = text.index('"distribution"')
    end = text.index('],', start) + 2
    changed = (text[:start] + block % (url, url.replace('aff1', 'aff2')) + text[end:]).encode()
    with pytest.raises(ValidationError, match='workbook link'):
        parse_ons_dataset_page(changed)


def test_missing_values_stay_absent_not_zero_and_latest_must_be_present():
    snapshot = parse(KEY, build(['3.55', '[x]', None, '3.89']), TODAY)
    assert [(p.period, p.value, p.status) for p in snapshot.observations] == [
        ('1997', '3.55', 'observed'), ('1998', None, 'missing'),
        ('1999', None, 'missing'), ('2000', '3.89', 'observed')]
    with pytest.raises(ValidationError, match='unavailable'):
        parse(KEY, build(['3.55', '3.66', '[x]']), TODAY)
    with pytest.raises(ValidationError, match='unavailable'):
        parse(KEY, build(['3.55', '3.66', None]), TODAY)


def test_binary_cell_noise_is_rounded_to_the_published_two_decimals():
    snapshot = parse(KEY, build(['5.0599999999999996', '8.9499999999999993', '4.0199999999999996']), TODAY)
    assert [p.value for p in snapshot.observations] == ['5.06', '8.95', '4.02']


def test_five_year_average_column_is_optional_but_nothing_else_may_follow_the_years():
    assert parse(KEY, build(average=None), TODAY).observations[-1].value == '3.89'
    rows = workbook.table_rows(VALUES, average=None)
    rows[1] += ['Lower quartile']
    with pytest.raises(ValidationError, match='columns changed'):
        parse(KEY, workbook.build(rows), TODAY)


def test_table_shape_changes_are_rejected():
    good = workbook.table_rows(VALUES)

    def rows(**kwargs):
        return workbook.table_rows(VALUES, **kwargs)

    cases = {
        'title changed': (workbook.build(rows(title=workbook.TITLE.format(last=1999).replace('median', 'lower quartile'))), 'title changed'),
        'title years disagree with header': (workbook.build(rows(title=workbook.TITLE.format(last=2005))), 'years changed'),
        'different geography row': (workbook.build(rows(code='E92000001', name='England')), 'row changed'),
        'name only changed': (workbook.build(rows(name='England and Wales (provisional)')), 'row changed'),
        'history does not start in 1997': (workbook.build(workbook.table_rows(VALUES, first=1998)), 'years changed'),
        'unexpected token': (build(['3.55', 'n/a', '3.89']), 'value token'),
        'negative-looking token': (build(['3.55', '-3.66', '3.89']), 'value token'),
        'zero ratio': (build(['3.55', '0', '3.89']), 'Implausible'),
        'future year': (workbook.build(workbook.table_rows(['3.5'] * 31)), 'Future'),
    }
    for label, (body, message) in cases.items():
        with pytest.raises(ValidationError, match=message):
            parse(KEY, body, TODAY)
    # Skipped year in the header.
    skipped = [list(row) for row in good]
    skipped[1][3] = '1999'
    with pytest.raises(ValidationError, match='years changed'):
        parse(KEY, workbook.build(skipped), TODAY)
    # Header row missing its leading identifiers.
    headless = [list(row) for row in good]
    headless[1][0] = 'Area code'
    with pytest.raises(ValidationError, match='header changed'):
        parse(KEY, workbook.build(headless), TODAY)


def test_sheet_set_changes_are_rejected():
    rows = workbook.table_rows(VALUES)
    extra = workbook.SHEETS + ['7a']
    with pytest.raises(ValidationError, match='sheets'):
        parse(KEY, workbook.build(rows, sheets=extra), TODAY)
    renamed = [name if name != '1c' else '1c (old)' for name in workbook.SHEETS]
    with pytest.raises(ValidationError, match='sheets'):
        parse(KEY, workbook.build(rows, sheets=renamed), TODAY)
    reordered = list(reversed(workbook.SHEETS))
    with pytest.raises(ValidationError, match='sheets'):
        parse(KEY, workbook.build(rows, sheets=reordered), TODAY)


def test_malformed_oversized_or_non_workbook_bytes_are_validation_errors():
    for body in (b'', b'<html>unavailable</html>', b'PK\x03\x04 truncated'):
        with pytest.raises(ValidationError, match='Malformed'):
            parse(KEY, body, TODAY)
    broken = io.BytesIO()
    with zipfile.ZipFile(broken, 'w') as book:
        book.writestr('xl/workbook.xml', '<workbook')
    with pytest.raises(ValidationError, match='Malformed'):
        parse(KEY, broken.getvalue(), TODAY)
    with pytest.raises(ValidationError, match='size limit'):
        parse(KEY, b'0' * 5_000_001, TODAY)
    bomb = io.BytesIO()
    with zipfile.ZipFile(bomb, 'w', zipfile.ZIP_DEFLATED) as book:
        book.writestr('xl/workbook.xml', b'0' * 70_000_000)
    with pytest.raises(ValidationError, match='bound'):
        parse(KEY, bomb.getvalue(), TODAY)


def test_workbook_with_shared_strings_is_read_like_the_official_file():
    rows = workbook.table_rows(VALUES)
    texts = [cell for row in rows for cell in row if isinstance(cell, str)]
    shared = ''.join(f'<si><t>{text}</t></si>' for text in texts)
    sheet = ['<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
    for number, row in enumerate(rows, 1):
        cells = []
        for index, cell in enumerate(row, 1):
            ref = f'{workbook.column(index)}{number}'
            if isinstance(cell, tuple):
                cells.append(f'<c r="{ref}"><v>{cell[1]}</v></c>')
            elif cell is not None:
                cells.append(f'<c r="{ref}" t="s"><v>{texts.index(cell)}</v></c>')
        sheet.append(f'<row r="{number}">{"".join(cells)}</row>')
    sheet.append('</sheetData></worksheet>')
    body = workbook.build([], extra={
        'xl/sharedStrings.xml': '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + shared + '</sst>'})
    # Replace sheet '1c' (sheet6.xml) in the generated archive with the shared-string version.
    source = zipfile.ZipFile(io.BytesIO(body))
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as book:
        for info in source.infolist():
            data = ''.join(sheet).encode() if info.filename == 'xl/worksheets/sheet6.xml' else source.read(info.filename)
            book.writestr(info.filename, data)
    snapshot = parse(KEY, out.getvalue(), TODAY)
    assert [p.value for p in snapshot.observations] == VALUES


def test_ingest_binds_the_workbook_to_its_archived_dataset_page(tmp_path):
    private = tmp_path / 'private'
    body, url, published, page = fixture_transport(KEY)
    when = CPI_WHEN
    store = Store(private)
    try:
        store.ingest(KEY, body, when, source_url=url, source_published_date=published,
                     release_page_evidence=page)
        row = store.latest(KEY)
        assert json.loads(row['payload'])['published_date'] == '2026-03-26'
        assert row['vintage'] == '2026-03-26'
        receipts = list((private / 'dataset-receipts').glob('*.json'))
        assert len(receipts) == 1
        receipt = json.loads(receipts[0].read_text())
        assert receipt['source_file_sha256'] == hashlib.sha256(body).hexdigest()
        assert receipt['dataset_page_sha256'] == hashlib.sha256(page['body']).hexdigest()
        assert (private / 'raw' / f"{receipt['dataset_page_sha256']}.bin").read_bytes() == page['body']
        assert receipt['source_published_date'] == '2026-03-26'
    finally:
        store.close()


@pytest.mark.parametrize('failure', [
    'date_mismatch', 'link_mismatch', 'missing_page', 'kind_mismatch', 'wrong_page_url',
    'future_release', 'page_after_ingest', 'year_after_release',
])
def test_ingest_rejects_unbound_or_inconsistent_release_evidence(tmp_path, failure):
    body, url, published, page = fixture_transport(KEY)
    page = dict(page)
    if failure == 'date_mismatch':
        published = '2026-03-25'
    elif failure == 'link_mismatch':
        url += 'x'
    elif failure == 'missing_page':
        page = None
    elif failure == 'kind_mismatch':
        page['evidence_kind'] = 'recorded_fixture'
    elif failure == 'wrong_page_url':
        page['url'] = 'https://www.ons.gov.uk/other'
    elif failure == 'future_release':
        published = '2026-12-01'
    elif failure == 'page_after_ingest':
        page['retrieved_at'] = '2026-10-23T00:00:00Z'
    elif failure == 'year_after_release':
        published = '2025-03-26'
    store = Store(tmp_path / 'private')
    try:
        with pytest.raises(ValidationError):
            store.ingest(KEY, body, CPI_WHEN, source_url=url, source_published_date=published,
                         release_page_evidence=page)
        assert store.latest(KEY) is None
        assert store.db.execute('SELECT status FROM attempt WHERE key=?', (KEY,)).fetchone()[0] == 'rejected'
    finally:
        store.close()


def test_optional_fetch_failure_never_blocks_publishing_other_metrics(tmp_path):
    def broken(key):
        if key == KEY:
            raise TimeoutError('do not publish sensitive error detail')
        return fixture_transport(key)
    result = collect(tmp_path / 'private', transport=broken, clock=lambda: CPI_WHEN)
    assert result['failed_metrics'] == [KEY]
    data = read_generation(tmp_path / 'private')
    ratio = data['metrics'][KEY]
    assert ratio['validation_status'] == 'unavailable'
    assert ratio['latest'] is None and ratio['history'] == []
    assert data['metrics']['cpih']['latest']['value'] == '3.3'
    deliver(tmp_path / 'private', tmp_path / 'public')
    manifest = json.loads((tmp_path / 'public' / 'current.json').read_text())
    public = json.loads((tmp_path / 'public' / manifest['data_url']).read_text())
    assert public['metrics'][KEY]['latest'] is None
    assert public['metrics'][KEY]['history'] == []
    assert public['metrics']['gdp']['latest']['value'] is not None
    assert 'sensitive error' not in json.dumps(public)


def test_changed_table_shape_is_rejected_and_the_previous_figure_is_retained(tmp_path):
    private = tmp_path / 'private'
    collect(private, transport=fixture_transport, clock=lambda: CPI_WHEN)
    original = read_generation(private)['metrics'][KEY]
    assert original['latest']['value'] == '7.55'

    def changed(key):
        values = fixture_transport(key)
        if key != KEY:
            return values
        return (workbook.build(workbook.table_rows(['3.55'], title=workbook.TITLE.format(last=1997)
                                                   .replace('median', 'lower quartile'))),) + values[1:]
    result = collect(private, transport=changed, clock=lambda: CPI_WHEN + timedelta(days=1))
    assert result['failed_metrics'] == [KEY]
    retained = read_generation(private)['metrics'][KEY]
    assert retained['collection_status'] == 'degraded'
    assert retained['latest'] == original['latest']
    assert retained['history'] == original['history']


def test_revision_keeps_the_prior_vintage_and_a_dropped_year_is_refused(tmp_path):
    private = tmp_path / 'private'
    collect(private, transport=fixture_transport, clock=lambda: CPI_WHEN)
    original = read_generation(private)['metrics'][KEY]

    def revised(key):
        values = fixture_transport(key)
        if key != KEY:
            return values
        body = values[0]
        rebuilt = workbook.build(workbook.table_rows(
            [point['value'] for point in original['history'][:-1]] + ['7.60']))
        assert rebuilt != body
        return (rebuilt,) + values[1:]
    collect(private, transport=revised, clock=lambda: CPI_WHEN + timedelta(minutes=1))
    current = read_generation(private)['metrics'][KEY]
    assert (current['latest']['period'], current['latest']['value']) == ('2025', '7.60')
    assert current['snapshot_id'] != original['snapshot_id']
    store = Store(private)
    try:
        rows = store.db.execute(
            "SELECT a.raw_hash FROM snapshot s JOIN receipt r ON r.snapshot_id=s.id "
            "JOIN attempt a ON a.id=r.attempt_id WHERE s.key=? ORDER BY a.id", (KEY,)).fetchall()
        assert len({row['raw_hash'] for row in rows}) == 2
        assert all((private / 'raw' / f"{row['raw_hash']}.bin").is_file() for row in rows)
    finally:
        store.close()

    def shortened(key):
        values = fixture_transport(key)
        if key != KEY:
            return values
        return (workbook.build(workbook.table_rows(
            [point['value'] for point in original['history'][:-2]])),) + values[1:]
    result = collect(private, transport=shortened, clock=lambda: CPI_WHEN + timedelta(minutes=2))
    assert result['failed_metrics'] == [KEY]
    assert read_generation(private)['metrics'][KEY]['latest']['value'] == '7.60'


def test_recorded_fixture_replay_is_labelled_and_never_official(tmp_path):
    result = collect(tmp_path / 'private', fixtures=FIXTURES, clock=lambda: CPI_WHEN)
    assert KEY not in result['failed_metrics']
    ratio = read_generation(tmp_path / 'private')['metrics'][KEY]
    assert ratio['snapshot_evidence_kind'] == 'recorded_fixture'
    assert ratio['last_successful_check_at'] is None
    assert ratio['latest']['value'] == '7.55'
    with pytest.raises(ValueError, match='fixtures'):
        deliver(tmp_path / 'private', tmp_path / 'public')


def test_delivery_refuses_a_workbook_url_outside_the_reviewed_dataset(tmp_path):
    private, public = tmp_path / 'private', tmp_path / 'public'
    collect(private, transport=fixture_transport, clock=lambda: CPI_WHEN)
    store = Store(private)
    try:
        with store.db:
            store.db.execute("UPDATE attempt SET source_url=? WHERE key=? AND status='accepted'",
                             ('https://www.ons.gov.uk/file?uri=/economy/other/current/aff1.xlsx', KEY))
        publish(store, CPI_WHEN)
    finally:
        store.close()
    with pytest.raises(ValueError, match='workbook URL'):
        deliver(private, public)


def test_registered_definition_set_includes_the_ratio_exactly_once():
    assert list(DEFINITIONS).count(KEY) == 1
    assert DEFINITIONS[KEY].frequency == 'annual'


def _unsupported_compression(body):
    """Re-label every ZIP member as an unsupported method (99) so reads raise NotImplementedError."""
    stored = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(body)) as source, zipfile.ZipFile(stored, 'w', zipfile.ZIP_STORED) as out:
        for info in source.infolist():
            out.writestr(info.filename, source.read(info.filename))
    data = bytearray(stored.getvalue())
    for signature, offset in ((b'PK\x03\x04', 8), (b'PK\x01\x02', 10)):
        at = data.find(signature)
        while at != -1:
            data[at + offset:at + offset + 2] = (99).to_bytes(2, 'little')
            at = data.find(signature, at + 4)
    return bytes(data)


def test_unsupported_zip_compression_is_a_validation_error_not_an_escape():
    for key, body, today in (
        (KEY, build(), TODAY),
        ('private_rent_growth', fixture('private_rent_growth'), date(2026, 10, 21)),
    ):
        with pytest.raises(ValidationError):
            parse(key, _unsupported_compression(body), today)
