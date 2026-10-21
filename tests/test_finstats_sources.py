"""Offline source contracts; fixtures retain original official bytes and receipts."""
from datetime import date
from pathlib import Path
import hashlib
import io
import json
import zipfile
import xml.etree.ElementTree as ET

import pytest

from finstats.sources import DEFINITIONS, ValidationError, fixture_file, parse

FIXTURES = Path(__file__).parent / 'fixtures' / 'official'
TODAY = date(2026, 10, 20)
CPI_TODAY = date(2026, 10, 21)  # The recorded CPI release is dated 21 October.


def fixture(key):
    return (FIXTURES / fixture_file(key)).read_bytes()


def fixture_transport(key):
    body = fixture(key)
    if key.startswith('private_rent_'):
        return body, ('https://www.ons.gov.uk/file?uri=%2Feconomy%2Finflationandpriceindices%2Fdatasets%2Fpriceindexofprivaterentsukmonthlypricestatistics%2F21october2026%2Fpriceindexofprivaterentsukmonthlypricestatistics.xlsx')
    if key.startswith('house_price_'):
        receipt = json.loads((FIXTURES / 'receipts.json').read_text())['uk_hpi_average_prices.csv']
        return body, receipt['originalURL'], receipt['source_published_date']
    return body


def test_recorded_bytes_match_receipts():
    receipts = json.loads((FIXTURES / 'receipts.json').read_text())
    for name, receipt in receipts.items():
        assert hashlib.sha256((FIXTURES / name).read_bytes()).hexdigest() == receipt['sha256']


def test_recorded_uk_hpi_average_price_contract_and_display_precision():
    receipts = json.loads((FIXTURES / 'receipts.json').read_text())['uk_hpi_average_prices.csv']
    assert receipts['originalURL'].startswith('https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/Average-prices-')
    assert receipts['original_bytes'] > receipts['bytes']
    assert 'reduced test fixture' in receipts['source']
    level = parse('house_price_level', fixture('house_price_level'), date(2026, 10, 22))
    growth = parse('house_price_growth', fixture('house_price_growth'), date(2026, 10, 22))
    assert level.observations[-1].period == growth.observations[-1].period == '2026-08'
    assert level.observations[-1].value == '273037'
    assert growth.observations[-1].value == '0.9'
    assert level.definition.unit == 'GBP'
    assert growth.definition.unit == 'percent'
    assert level.definition.series == 'Average_Price'
    assert growth.definition.series == 'Annual_Change'
    assert level.definition.source_url.startswith('https://www.gov.uk/')


def test_uk_hpi_wrong_geography_and_columns_fail_closed():
    body = fixture('house_price_level').decode()
    with pytest.raises(ValidationError, match='national row unavailable'):
        parse('house_price_level', body.replace('United Kingdom,K02000001', 'Great Britain,K03000001').encode(), date(2026, 10, 22))
    with pytest.raises(ValidationError, match='columns changed'):
        parse('house_price_level', body.replace('Average_Price,Monthly_Change', 'Price,Monthly_Change', 1).encode(), date(2026, 10, 22))


def test_uk_hpi_series_validation_is_independent():
    body = fixture('house_price_level').decode()
    level_bad_growth = body.replace('273037,0.3,0.9,', '273037,0.3,UNKNOWN,')
    assert parse('house_price_level', level_bad_growth.encode(), date(2026, 10, 22)).observations[-1].value == '273037'
    with pytest.raises(ValidationError, match='token'):
        parse('house_price_growth', level_bad_growth.encode(), date(2026, 10, 22))

    growth_bad_level = body.replace('273037,0.3,0.9,', 'UNKNOWN,0.3,0.9,')
    assert parse('house_price_growth', growth_bad_level.encode(), date(2026, 10, 22)).observations[-1].value == '0.9'
    with pytest.raises(ValidationError, match='token'):
        parse('house_price_level', growth_bad_level.encode(), date(2026, 10, 22))


def test_recorded_pipr_workbook_selects_only_the_uk_national_growth_and_level():
    from finstats.sources import public_definition
    body = fixture('private_rent_growth')
    growth = parse('private_rent_growth', body, date(2026, 10, 21))
    level = parse('private_rent_level', body, date(2026, 10, 21))
    assert growth.definition.series == 'Annual change'
    assert level.definition.series == 'Rental price'
    assert growth.definition.unit == 'percent'
    assert level.definition.unit == 'GBP_per_month'
    assert public_definition('private_rent_growth')['area_code'] == 'K02000001'
    assert public_definition('private_rent_growth')['geography'] == 'United Kingdom'
    assert growth.published_date == level.published_date == '2026-10-21'
    assert growth.observations[-1].period == level.observations[-1].period == '2026-09'
    assert [point.value for point in growth.observations[-2:]] == ['3.8', '3.8']
    # The recorded workbook stores distinct binary numeric values; its G cells
    # share the custom 0.0 number format documented from the original edition.
    table = ET.fromstring(zipfile.ZipFile(io.BytesIO(body)).read('xl/worksheets/sheet4.xml'))
    rows = table.findall('.//m:sheetData/m:row', {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'})
    raw_latest = [row.find('m:c[@r="G%s"]/m:v' % row.get('r'), {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}).text for row in rows[-2:]]
    assert raw_latest == ['3.836147', '3.8052769999999998']
    assert raw_latest[0] != raw_latest[1]
    assert level.observations[-1].value == '1406'
    assert any(point.status == 'missing' and point.value is None for point in growth.observations)
    assert all(point.period == level.observations[index].period for index, point in enumerate(growth.observations))


def test_missing_pipr_level_column_value_does_not_invalidate_growth():
    source = zipfile.ZipFile(io.BytesIO(fixture('private_rent_growth')))
    rows_xml = ET.fromstring(source.read('xl/worksheets/sheet4.xml'))
    namespace = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = rows_xml.findall('.//m:sheetData/m:row', namespace)
    last = rows[-1]
    for cell in list(last.findall('m:c', namespace)):
        if cell.get('r', '').startswith('H'):
            last.remove(cell)
    altered = io.BytesIO()
    with zipfile.ZipFile(altered, 'w', zipfile.ZIP_DEFLATED) as output:
        for member in source.infolist():
            content = ET.tostring(rows_xml) if member.filename == 'xl/worksheets/sheet4.xml' else source.read(member)
            output.writestr(member.filename, content)
    body = altered.getvalue()
    assert parse('private_rent_growth', body, date(2026, 10, 21)).observations[-1].value == '3.8'
    with pytest.raises(ValidationError, match='Latest UK PIPR observation unavailable'):
        parse('private_rent_level', body, date(2026, 10, 21))


def test_malformed_pipr_xml_and_cell_references_are_validation_failures():
    source = zipfile.ZipFile(io.BytesIO(fixture('private_rent_growth')))
    members = [(member.filename, source.read(member.filename)) for member in source.infolist()]
    malformed_xml = io.BytesIO()
    with zipfile.ZipFile(malformed_xml, 'w', zipfile.ZIP_DEFLATED) as output:
        for filename, original in members:
            content = b'<invalid' if filename == 'xl/worksheets/sheet4.xml' else original
            output.writestr(filename, content)
    with pytest.raises(ValidationError, match='Malformed PIPR workbook structure'):
        parse('private_rent_growth', malformed_xml.getvalue(), date(2026, 10, 21))

    source_xml = ET.fromstring(dict(members)['xl/worksheets/sheet4.xml'])
    namespace = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    source_xml.find('.//m:sheetData/m:row[@r="6"]/m:c[@r="A6"]', namespace).set('r', '?')
    malformed_cell = io.BytesIO()
    with zipfile.ZipFile(malformed_cell, 'w', zipfile.ZIP_DEFLATED) as output:
        for filename, original in members:
            content = ET.tostring(source_xml) if filename == 'xl/worksheets/sheet4.xml' else original
            output.writestr(filename, content)
    with pytest.raises(ValidationError, match='Malformed PIPR workbook structure'):
        parse('private_rent_growth', malformed_cell.getvalue(), date(2026, 10, 21))

    unknown_missing = io.BytesIO()
    original_xml = ET.fromstring(dict(members)['xl/worksheets/sheet4.xml'])
    for text in original_xml.findall('.//m:t', namespace):
        if text.text == '[x]':
            text.text = '[z]'
    with zipfile.ZipFile(unknown_missing, 'w', zipfile.ZIP_DEFLATED) as output:
        for filename, original in members:
            content = ET.tostring(original_xml) if filename == 'xl/worksheets/sheet4.xml' else original
            output.writestr(filename, content)
    with pytest.raises(ValidationError, match='Unrecognised numerical value'):
        parse('private_rent_growth', unknown_missing.getvalue(), date(2026, 10, 21))


def test_cpih_is_annual_rate_with_monthly_reference_periods():
    data = parse('cpih', fixture('cpih'), TODAY)
    assert data.definition.comparison == 'year_on_year'
    assert data.observations[-1].period == '2026-08'
    assert data.observations[-1].value == '3.3'
    assert data.published_date == '2026-09-16'
    assert data.next_release == '2026-10-21'
    assert all(len(o.period) == 7 for o in data.observations)


def test_gdp_matches_same_release_bulletin():
    # ONS August 2026 bulletin, published 15 October: June .4, July .4, August .1.
    data = parse('gdp', fixture('gdp'), TODAY)
    assert [(o.period, o.value) for o in data.observations[-3:]] == [
        ('2026-06', '0.4'), ('2026-07', '0.4'), ('2026-08', '0.1')]
    assert data.published_date == '2026-10-15'
    assert data.definition.adjustment == 'seasonally_adjusted'


def test_bank_rate_preserves_daily_values_without_inventing_release_date():
    data = parse('bank_rate', fixture('bank_rate'), TODAY)
    assert data.published_date is None
    assert data.next_release is None
    assert data.observations[-1].period == '2026-10-19'
    assert len([o for o in data.observations if o.period.startswith('2026-01')]) > 1


@pytest.mark.parametrize('old,new', [
    (b'L55O', b'L59C'), (b'MM23', b'OTHER'), (b'"Unit","%"', b'"Unit","index"'),
    (b'"2026 AUG","3.3"', b'"2026 AUG","NaN"'),
    (b'"2026 AUG","3.3"', b'"2026 XYZ","3.3"'),
    (b'16-09-2026', b'16-09-2027'),
    (b'"2026 AUG","3.3"', b'"2026 AUG",""'),
    (b'"2026 AUG","3.3"', b'"2026 AUG","3.3"\n"2026 AUG","3.4"'),
])
def test_rejects_wrong_identity_units_periods_and_values(old, new):
    assert old in fixture('cpih')
    with pytest.raises(ValidationError):
        parse('cpih', fixture('cpih').replace(old, new), TODAY)


@pytest.mark.parametrize('body', [b'', b'<html>Access denied</html>', b'"unterminated'])
def test_invalid_response_never_becomes_empty_success(body):
    with pytest.raises(ValidationError):
        parse('gdp', body, TODAY)


def test_bank_rate_checks_series_and_duplicates():
    for body in [fixture('bank_rate').replace(b'IUDBEDR', b'OTHER'),
                 b'DATE,SERIES,VALUE\n01 Jan 2026,IUDBEDR,1\n01 Jan 2026,IUDBEDR,2']:
        with pytest.raises(ValidationError):
            parse('bank_rate', body, TODAY)


def test_missing_historical_observation_is_not_zero_and_extremes_are_preserved():
    body = fixture('gdp').replace(b'"1997 FEB","0.3"', b'"1997 FEB",".."')
    data = parse('gdp', body.replace(b'"1997 MAR","0.0"', b'"1997 MAR","-20.1234"'), TODAY)
    assert data.observations[0].value is None
    assert data.observations[0].status == 'missing'
    assert data.observations[1].value == '-20.1234'


def test_cpi_is_uk_annual_rate_from_the_qualified_json_endpoint():
    data = parse('cpi', fixture('cpi'), CPI_TODAY)
    definition = data.definition
    assert definition.metric_id == 'uk.cpi.annual_rate'
    assert definition.series == 'D7G7'
    assert definition.dataset == 'MM23'
    assert definition.comparison == 'year_on_year'
    assert definition.adjustment == 'not_seasonally_adjusted'
    assert definition.source_url == 'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23'
    assert definition.download_url == 'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23/data'
    assert data.observations[-1].period == '2026-09'
    assert data.observations[-1].value == '3.5'
    assert all(o.status == 'observed' for o in data.observations)
    assert all(len(o.period) == 7 for o in data.observations)


def test_cpi_release_date_converts_to_london_calendar_date():
    # The recorded releaseDate is 2026-10-20T23:00:00.000Z; UTC slicing would
    # give 20 October, but the UK calendar release is 21 October (BST midnight).
    data = parse('cpi', fixture('cpi'), CPI_TODAY)
    assert data.published_date == '2026-10-21'
    assert data.next_release == '2026-11-18'
    assert data.observations[-1].period <= data.published_date[:7]


def test_cpi_keeps_recorded_monthly_gaps_and_never_invents_periods():
    # The recorded excerpt's months[] is a 17-month subset that omits 2025
    # FEB/APR/AUG/DEC (excerpt-selection artefacts, not endpoint absence);
    # only present months may be observed and gaps must stay visible.
    data = parse('cpi', fixture('cpi'), CPI_TODAY)
    periods = [o.period for o in data.observations]
    assert periods[:4] == ['2025-01', '2025-03', '2025-05', '2025-06']
    assert '2025-02' not in periods


def test_unemployment_uses_full_label_window_not_source_date_as_end_month():
    data = parse('unemployment', fixture('unemployment'), TODAY)
    assert data.definition.series == 'MGSX'
    assert data.definition.dataset == 'LMS'
    assert data.definition.download_url == 'https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms/data'
    latest = data.observations[-1]
    assert latest.period == '2026-08'
    assert latest.reference == {
        'kind': 'rolling_months', 'start_month': '2026-06', 'end_month': '2026-08'}
    cross_year = next(o for o in data.observations if o.reference['start_month'] == '2025-12')
    assert cross_year.period == '2026-02'
    assert cross_year.reference['end_month'] == '2026-02'


@pytest.mark.parametrize('old,new', [
    (b'2026 JUN-AUG', b'2026 JUN-SEP'),
    (b'2026 JUN-AUG', b'2026 JUL-SEP'),
    (b'2026 JUN-AUG', b'2026 JUN-XYZ'),
    (b'2026 JUL', b'2026 AUG'),
    (b'"year": "2026", "month": "July"', b'"year": "2025", "month": "July"'),
])
def test_unemployment_rejects_inconsistent_period_identity(old, new):
    body = fixture('unemployment')
    assert old in body
    with pytest.raises(ValidationError):
        parse('unemployment', body.replace(old, new, 1), TODAY)


def test_cpi_ignores_annual_and_quarterly_arrays_but_keeps_their_months():
    payload = json.loads(fixture('cpi').decode())
    assert payload['years'] and payload['quarters']
    data = parse('cpi', fixture('cpi'), CPI_TODAY)
    assert all('Q' not in o.period for o in data.observations)


@pytest.mark.parametrize('old,new', [
    (b'"title": "CPI ANNUAL RATE 00: ALL ITEMS 2015=100"', b'"title": "CPIH ANNUAL RATE 00: ALL ITEMS 2015=100"'),
    (b'"cdid": "D7G7"', b'"cdid": "L55O"'),
    (b'"datasetId": "MM23"', b'"datasetId": "OTHER"'),
    (b'"unit": "%"', b'"unit": "index"'),
    (b'"preUnit": ""', '"preUnit": "\u00a3"'.encode()),
    (b'"uri": "/economy/inflationandpriceindices/timeseries/d7g7/mm23"',
     b'"uri": "/economy/inflationandpriceindices/timeseries/l55o/mm23"'),
    (b'"type": "timeseries"', b'"type": "dataset"'),
])
def test_cpi_rejects_wrong_identity_units_and_series_binding(old, new):
    assert old in fixture('cpi')
    with pytest.raises(ValidationError):
        parse('cpi', fixture('cpi').replace(old, new), CPI_TODAY)


@pytest.mark.parametrize('old,new', [
    (b'"releaseDate": "2026-10-20T23:00:00.000Z"', b'"releaseDate": "2026-11-19T23:00:00.000Z"'),
    (b'"releaseDate": "2026-10-20T23:00:00.000Z"', b'"releaseDate": "21-10-2026"'),
    (b'"nextRelease": "18 November 2026"', b'"nextRelease": "Q4 2026"'),
    (b'"date": "2026 SEP"', b'"date": "2026 XXX"'),
    (b'"date": "2026 SEP"', b'"date": "2026 AUG"'),
])
def test_cpi_rejects_bad_dates_and_duplicate_periods(old, new):
    assert old in fixture('cpi')
    with pytest.raises(ValidationError):
        parse('cpi', fixture('cpi').replace(old, new), CPI_TODAY)


@pytest.mark.parametrize('token', [b'""', b'".."', b'"NaN"', b'"3,5"'])
def test_cpi_unknown_value_tokens_quarantine_the_feed(token):
    body = fixture('cpi').replace(b'"value": "3.5"', b'"value": ' + token)
    with pytest.raises(ValidationError):
        parse('cpi', body, CPI_TODAY)


@pytest.mark.parametrize('body', [b'', b'<html>Access denied</html>', b'{"years":['])
def test_cpi_invalid_json_response_never_becomes_empty_success(body):
    with pytest.raises(ValidationError):
        parse('cpi', body, CPI_TODAY)


def test_cpi_collection_before_the_release_is_rejected_not_published():
    with pytest.raises(ValidationError, match='Future publication date'):
        parse('cpi', fixture('cpi'), TODAY)


def test_cpi_fixture_bytes_and_receipt_remain_the_recorded_excerpt():
    receipts = json.loads((FIXTURES / 'receipts.json').read_text())
    body = fixture('cpi')
    assert hashlib.sha256(body).hexdigest() == receipts['cpi_d7g7_mm23.json']['sha256']
    assert receipts['cpi_d7g7_mm23.json']['url'] == DEFINITIONS['cpi'].download_url


@pytest.mark.parametrize(('key', 'series', 'value'), [
    ('regular_pay_nominal_growth', 'KAI9', '3.7'),
    ('regular_pay_real_growth', 'A2FA', '0.6'),
])
def test_regular_pay_binds_exact_series_and_official_three_month_window(key, series, value):
    data = parse(key, fixture(key), CPI_TODAY)
    assert data.definition.series == series
    assert data.definition.dataset == 'LMS'
    assert data.definition.adjustment == 'seasonally_adjusted'
    assert data.observations[-1].period == '2026-08'
    assert data.observations[-1].value == value
    assert data.observations[-1].reference == {
        'kind': 'rolling_months', 'start_month': '2026-06', 'end_month': '2026-08'}
    assert all(o.reference and o.reference['end_month'] == o.period for o in data.observations)


def test_real_pay_blank_unit_exception_is_specific_to_a2fa():
    real = json.loads(fixture('regular_pay_real_growth'))
    nominal = json.loads(fixture('regular_pay_nominal_growth'))
    assert real['description']['unit'] == ''
    assert parse('regular_pay_real_growth', json.dumps(real).encode(), CPI_TODAY)
    nominal['description']['unit'] = ''
    with pytest.raises(ValidationError, match='unit'):
        parse('regular_pay_nominal_growth', json.dumps(nominal).encode(), CPI_TODAY)


def test_regular_pay_crosses_year_boundary_in_reference_windows():
    body = fixture('regular_pay_nominal_growth')
    payload = json.loads(body)
    payload['months'] = [next(row for row in payload['months'] if row['date'] == '2026 JAN')]
    data = parse('regular_pay_nominal_growth', json.dumps(payload).encode(), CPI_TODAY)
    assert data.observations[0].period == '2026-01'
    assert data.observations[0].reference == {
        'kind': 'rolling_months', 'start_month': '2025-11', 'end_month': '2026-01'}
