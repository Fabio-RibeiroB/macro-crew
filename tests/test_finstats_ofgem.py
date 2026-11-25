import hashlib
import json
import gzip
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from finstats.publication import publish
from finstats.delivery import deliver
from finstats.sources import DEFINITIONS, OFGEM_TDCV_URL, OFGEM_TDCV_SOURCE_SHA256, parse
from finstats.storage import Store


FIXTURES = Path(__file__).parent / 'fixtures' / 'official'
PAGE = FIXTURES / 'ofgem_energy_price_cap_2026-10.html.gz'
BODY = gzip.decompress(PAGE.read_bytes())


def future_period_page():
    return '''<title>Energy price cap unit rates and standing charges | Ofgem</title>
      <p>Average electricity and gas unit prices and standing charges by Direct Debit</p>
      <p>From 1 October to 31 December 2026, the price cap will be £1,723 per year.</p>
      <p>This figure is based on the average energy unit rate and standing charge for people who pay by Direct Debit in England, Scotland and Wales.</p>
      <p>From 1 January to 31 March 2027, the price cap will be £1,750 per year.</p>
      <p>This figure is based on the average energy unit rate and standing charge for people who pay by Direct Debit in England, Scotland and Wales.</p>
      <table><tr><th>Energy price cap per unit and standing charge</th>
      <th>1 October to 31 December 2026</th><th>1 January to 31 March 2027</th></tr>
      <tr><td>Electricity</td><td>26.32 pence per kWh 54.83 pence daily standing charge</td><td>27.00 pence per kWh 55.00 pence daily standing charge</td></tr>
      <tr><td>Gas</td><td>7.97 pence per kWh 29.68 pence daily standing charge</td><td>8.00 pence per kWh 30.00 pence daily standing charge</td></tr></table>
      <p>Figures include 5% VAT on gas.</p>
      <p>There is no VAT on electricity from 1 October 2026 to 31 March 2027.</p>
      <p>Costs cannot be compared directly to previous periods because of this change.</p>'''.encode()


def later_quarter_page():
    body = future_period_page()
    return (body.replace(b'1 October to 31 December 2026', b'__FIRST__')
            .replace(b'1 January to 31 March 2027', b'1 April to 30 June 2027')
            .replace(b'__FIRST__', b'1 January to 31 March 2027')
            .replace(b'1 October 2026 to 31 March 2027',
                     b'1 January 2027 to 30 June 2027'))


def test_ofgem_effective_period_bill_rates_basis_and_tax_break():
    body = BODY
    receipt = json.loads((FIXTURES / 'ofgem_energy_price_cap_receipt.json').read_text())
    assert hashlib.sha256(body).hexdigest() == receipt['sha256']
    snapshot = parse('household_energy', body, date(2026, 10, 22))
    point = snapshot.observations[-1]
    assert point.period == '2026-10-01'
    assert point.value == '1723'
    assert point.reference['effective_end'] == '2026-12-31'
    assert point.reference['electricity_kwh_per_year'] == 2500
    assert point.reference['gas_kwh_per_year'] == 9500
    assert point.reference['electricity'] == {
        'unit_rate_p_per_kwh': '26.32', 'standing_charge_p_per_day': '54.83'}
    assert point.reference['gas'] == {
        'unit_rate_p_per_kwh': '7.97', 'standing_charge_p_per_day': '29.68'}
    assert point.reference['comparison_status'] == 'not_comparable_tax_change'
    assert point.reference['announcement_date'] is None
    tdcv = json.loads((FIXTURES / 'ofgem_tdcv_decision_receipt.json').read_text())
    decision = FIXTURES / tdcv['file']
    assert tdcv['url'] == OFGEM_TDCV_URL
    assert tdcv['sha256'] == OFGEM_TDCV_SOURCE_SHA256 == hashlib.sha256(decision.read_bytes()).hexdigest()
    assert tdcv['publication_date'] == '2026-05-27'
    assert tdcv['effective_date'] == '2026-07-01'
    assert tdcv['final_medium_single_rate_electricity_kwh_per_year'] == point.reference['electricity_kwh_per_year']
    assert tdcv['final_medium_gas_kwh_per_year'] == point.reference['gas_kwh_per_year']


@pytest.mark.parametrize('replacement', [
    (b'who pay by Direct Debit', b'who use a prepayment meter'),
    (b'There is no VAT on electricity from', b'Electricity tax is zero from'),
    (b'This figure', b'This typical household uses 2,700 kWh of single-rate electricity and 11,500 kWh of gas. This figure'),
])
def test_changed_source_basis_or_tax_grammar_fails_closed(replacement):
    body = BODY.replace(*replacement, 1)
    assert body != BODY
    with pytest.raises(ValueError):
        parse('household_energy', body, date(2026, 10, 22))


def announced_only_jan_2027_page():
    """Matches Ofgem's 25 November 2026 layout: next-quarter headline only, both columns in table."""
    return '''<title>Energy price cap unit rates and standing charges | Ofgem</title>
      <p>From 1 January to 31 March 2027, the price cap will be £2,166 per year. This has gone up by 26% compared to the last price cap period.</p>
      <p>This figure is based on the average energy unit rate and standing charge for people who pay by Direct Debit in England, Scotland and Wales.</p>
      <p>Average electricity and gas unit prices and standing charges by Direct Debit</p>
      <table><tr><th></th>
      <th>Energy price cap per unit and standing charge 1 October to 31 December 2026</th>
      <th>Energy price cap per unit and standing charge 1 January to 31 March 2027</th></tr>
      <tr><td>Electricity</td><td>26.32 pence per kWh 54.83 pence daily standing charge</td><td>32.69 pence per kWh 54.77 pence daily standing charge</td></tr>
      <tr><td>Gas</td><td>7.97 pence per kWh 29.68 pence daily standing charge</td><td>10.96 pence per kWh 29.65 pence daily standing charge</td></tr></table>
      <p>Figures are rounded to two decimal places and include 5% VAT on gas. There is no VAT on electricity from 1 October 2026 to 30 June 2027. Costs cannot be compared directly to previous periods because of this change.</p>'''.encode()


def test_ofgem_effective_date_activation_fails_closed(tmp_path):
    body = BODY
    # Day before effective start: parsed as announced, never promoted to effective or latest.
    before = parse('household_energy', body, date(2026, 9, 30)).observations
    assert [(p.period, p.value, p.reference['period_status']) for p in before] == [
        ('2026-10-01', '1723', 'announced')]
    store = Store(tmp_path)
    try:
        store.ingest('household_energy', body, datetime(2026, 9, 30, 12, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url)
        publish(store, datetime(2026, 9, 30, 12, tzinfo=timezone.utc))
        manifest = json.loads((tmp_path / 'shadow' / 'current.json').read_text())
        data = json.loads((tmp_path / 'shadow' / manifest['data_url']).read_text())
        energy = data['metrics']['household_energy']
        assert energy['validation_status'] == 'unavailable'
        assert energy['latest'] is None
        assert energy['upcoming_period']['period'] == '2026-10-01'
    finally:
        store.close()
    # On effective start: active.
    assert parse('household_energy', body, date(2026, 10, 1)).observations[0].reference['period_status'] == 'effective'
    assert parse('household_energy', body, date(2026, 10, 1)).observations[0].value == '1723'
    # After expiry: fails closed.
    with pytest.raises(ValueError, match='currently effective or next announced'):
        parse('household_energy', body, date(2027, 1, 1))
    # More than one quarter ahead: fails closed.
    with pytest.raises(ValueError, match='next calendar quarter'):
        parse('household_energy', body, date(2026, 6, 30))


def test_announced_cap_is_separate_until_its_effective_date():
    before = parse('household_energy', future_period_page(), date(2026, 10, 22)).observations
    assert [(p.value, p.reference['period_status']) for p in before] == [
        ('1723', 'effective'), ('1750', 'announced')]
    assert before[0].reference['comparison_status'] == 'not_comparable_tax_change'
    assert before[1].reference['comparison_status'] == 'compare_only_same_basis'
    after = parse('household_energy', future_period_page(), date(2027, 1, 1)).observations
    assert [(p.period, p.value, p.reference['period_status']) for p in after] == [
        ('2027-01-01', '1750', 'effective')]


def test_missing_announcement_and_failed_refresh_retain_last_verified_period(tmp_path):
    body = BODY
    store = Store(tmp_path)
    when = datetime(2026, 10, 22, tzinfo=timezone.utc)
    try:
        store.ingest('household_energy', body, when,
                     source_url=DEFINITIONS['household_energy'].download_url)
        receipt = store.latest('household_energy')
        assert json.loads(receipt['payload'])['observations'][0]['reference']['announcement_date'] is None
        store.failed('household_energy', datetime(2026, 10, 23, tzinfo=timezone.utc), 'TimeoutError')
        retained = store.latest('household_energy')
        assert retained['id'] == receipt['id']
        assert json.loads(retained['payload'])['observations'][0]['value'] == '1723'
    finally:
        store.close()


def test_published_source_snapshots_accumulate_quarter_history(tmp_path):
    store = Store(tmp_path)
    when = datetime(2026, 10, 22, tzinfo=timezone.utc)
    try:
        store.ingest('household_energy', BODY, when,
                     source_url=DEFINITIONS['household_energy'].download_url)
        store.ingest('household_energy', future_period_page(), datetime(2026, 11, 1, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url)
        history = store.observations('household_energy')
        assert [p['period'] for p in history] == ['2026-10-01', '2027-01-01']
        assert [p['value'] for p in history] == ['1723', '1750']
        october = datetime(2026, 11, 1, tzinfo=timezone.utc)
        publish(store, october)
        shadow = json.loads((tmp_path / 'shadow' / 'generations' /
                             json.loads((tmp_path / 'shadow' / 'current.json').read_text())['generation_id'] /
                             'data.json').read_text())
        energy = shadow['metrics']['household_energy']
        assert energy['latest']['period'] == '2026-10-01'
        assert energy['latest']['reference']['period_status'] == 'effective'
        assert energy['upcoming_period']['period'] == '2027-01-01'
        assert energy['upcoming_period']['reference']['period_status'] == 'announced'

        store.failed('household_energy', datetime(2027, 1, 1, tzinfo=timezone.utc), 'TimeoutError')
        publish(store, datetime(2027, 1, 1, tzinfo=timezone.utc))
        shadow = json.loads((tmp_path / 'shadow' / 'generations' /
                             json.loads((tmp_path / 'shadow' / 'current.json').read_text())['generation_id'] /
                             'data.json').read_text())
        energy = shadow['metrics']['household_energy']
        assert energy['validation_status'] == 'verified'
        assert energy['collection_status'] == 'degraded'
        assert energy['latest']['period'] == '2027-01-01'
        assert energy['latest']['reference']['period_status'] == 'effective'
        assert energy['history'][0]['reference']['period_status'] == 'expired'
        assert energy['upcoming_period'] is None
        assert len(shadow['metrics']) == len(DEFINITIONS)
    finally:
        store.close()


@pytest.mark.parametrize(('old_evidence_kind', 'expected_periods'), [
    ('recorded_fixture', ['2027-01-01']),
    ('official_download', ['2026-10-01', '2027-01-01']),
])
def test_official_history_isolated_by_evidence_kind(tmp_path, old_evidence_kind, expected_periods):
    store = Store(tmp_path)
    try:
        store.ingest('household_energy', BODY,
                     datetime(2026, 11, 30, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url,
                     evidence_kind=old_evidence_kind)
        store.ingest('household_energy', later_quarter_page(),
                     datetime(2027, 1, 1, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url,
                     evidence_kind='official_download')
        store.ingest('bank_rate', (FIXTURES / 'bank_rate.csv').read_bytes(),
                     datetime(2027, 1, 1, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['bank_rate'].download_url,
                     evidence_kind='official_download')
        publish(store, datetime(2027, 1, 1, tzinfo=timezone.utc))
        public_dir = tmp_path.with_name(tmp_path.name + '-public')
        deliver(tmp_path, public_dir)
        manifest = json.loads((public_dir / 'current.json').read_text())
        data = json.loads((public_dir / manifest['data_url']).read_text())
        energy = data['metrics']['household_energy']
        assert energy['validation_status'] == 'verified'
        assert energy['snapshot_evidence_kind'] == 'official_download'
        assert [point['period'] for point in energy['history']] == expected_periods
        assert energy['latest']['period'] == '2027-01-01'
        assert data['metrics']['bank_rate']['latest']['value'] == '3.75'
    finally:
        store.close()


def test_no_current_cap_is_unavailable_but_keeps_expired_history_and_siblings(tmp_path):
    store = Store(tmp_path)
    try:
        store.ingest('household_energy', BODY,
                     datetime(2026, 10, 22, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url)
        bank_rate = (FIXTURES / 'bank_rate.csv').read_bytes()
        store.ingest('bank_rate', bank_rate,
                     datetime(2026, 10, 22, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['bank_rate'].download_url,
                     evidence_kind='official_download')
        store.failed('household_energy', datetime(2027, 1, 1, tzinfo=timezone.utc), 'TimeoutError')
        publish(store, datetime(2027, 1, 1, tzinfo=timezone.utc))
        manifest = json.loads((tmp_path / 'shadow' / 'current.json').read_text())
        data = json.loads((tmp_path / 'shadow' / manifest['data_url']).read_text())
        energy = data['metrics']['household_energy']
        assert energy['validation_status'] == 'unavailable'
        assert energy['latest'] is None
        assert len(energy['history']) == 1
        assert energy['history'][0]['reference']['period_status'] == 'expired'
        assert len(data['metrics']) == len(DEFINITIONS)
        public_dir = tmp_path.with_name(tmp_path.name + '-public')
        deliver(tmp_path, public_dir)
        public_manifest = json.loads((public_dir / 'current.json').read_text())
        public = json.loads((public_dir / public_manifest['data_url']).read_text())
        assert public['metrics']['household_energy']['validation_status'] == 'unavailable'
        assert public['metrics']['household_energy']['latest'] is None
        assert public['metrics']['household_energy']['history'][0]['reference']['period_status'] == 'expired'
        assert public['metrics']['bank_rate']['latest']['value'] == '3.75'
    finally:
        store.close()


def test_expired_fixture_cap_is_not_projected_even_with_official_sibling(tmp_path):
    store = Store(tmp_path)
    try:
        store.ingest('household_energy', BODY,
                     datetime(2026, 10, 22, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url,
                     evidence_kind='recorded_fixture')
        store.ingest('bank_rate', (FIXTURES / 'bank_rate.csv').read_bytes(),
                     datetime(2026, 10, 22, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['bank_rate'].download_url,
                     evidence_kind='official_download')
        store.failed('household_energy', datetime(2027, 1, 1, tzinfo=timezone.utc), 'TimeoutError')
        publish(store, datetime(2027, 1, 1, tzinfo=timezone.utc))
        public_dir = tmp_path.with_name(tmp_path.name + '-public')
        with pytest.raises(ValueError, match='Recorded fixtures cannot be published'):
            deliver(tmp_path, public_dir)
        assert not (public_dir / 'current.json').exists()
    finally:
        store.close()


def test_never_collected_empty_energy_is_publishable_with_official_sibling(tmp_path):
    store = Store(tmp_path)
    try:
        store.ingest('bank_rate', (FIXTURES / 'bank_rate.csv').read_bytes(),
                     datetime(2026, 10, 22, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['bank_rate'].download_url,
                     evidence_kind='official_download')
        store.failed('household_energy', datetime(2026, 10, 22, tzinfo=timezone.utc), 'TimeoutError')
        publish(store, datetime(2026, 10, 22, tzinfo=timezone.utc))
        public_dir = tmp_path.with_name(tmp_path.name + '-public')
        deliver(tmp_path, public_dir)
        manifest = json.loads((public_dir / 'current.json').read_text())
        public = json.loads((public_dir / manifest['data_url']).read_text())
        energy = public['metrics']['household_energy']
        assert energy['validation_status'] == 'unavailable'
        assert energy['latest'] is None
        assert energy['history'] == []
        assert public['metrics']['bank_rate']['latest']['value'] == '3.75'
    finally:
        store.close()


def test_announced_only_ofgem_page_keeps_effective_cap_and_rolls_over(tmp_path):
    store = Store(tmp_path)
    try:
        store.ingest('household_energy', BODY, datetime(2026, 10, 22, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url)
        store.ingest('bank_rate', (FIXTURES / 'bank_rate.csv').read_bytes(),
                     datetime(2026, 11, 25, 8, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['bank_rate'].download_url)
        store.ingest('household_energy', announced_only_jan_2027_page(),
                     datetime(2026, 11, 25, 8, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url)

        publish(store, datetime(2026, 11, 25, 8, tzinfo=timezone.utc))
        public_dir = tmp_path.with_name(tmp_path.name + '-public')
        deliver(tmp_path, public_dir)
        manifest = json.loads((public_dir / 'current.json').read_text())
        energy = json.loads((public_dir / manifest['data_url']).read_text())['metrics']['household_energy']
        assert energy['collection_status'] == 'ok'
        assert energy['validation_status'] == 'verified'
        assert energy['release_status'] == 'awaiting_next_release'
        expected_tax = '5% VAT on gas; 0% VAT on electricity from 1 October 2026 to 30 June 2027'
        assert energy['latest']['period'] == '2026-10-01'
        assert energy['latest']['value'] == '1723'
        assert energy['latest']['reference']['period_status'] == 'effective'
        assert energy['latest']['reference']['tax_treatment'] == expected_tax
        assert [p['period'] for p in energy['history']] == ['2026-10-01']
        assert energy['history'][0]['reference']['tax_treatment'] == expected_tax
        upcoming = energy['upcoming_period']
        assert upcoming['period'] == '2027-01-01'
        assert upcoming['value'] == '2166'
        assert upcoming['reference']['period_status'] == 'announced'
        assert upcoming['reference']['electricity'] == {
            'unit_rate_p_per_kwh': '32.69', 'standing_charge_p_per_day': '54.77'}
        assert upcoming['reference']['gas'] == {
            'unit_rate_p_per_kwh': '10.96', 'standing_charge_p_per_day': '29.65'}
        assert upcoming['reference']['tax_treatment'] == expected_tax
        assert upcoming['reference']['comparison_status'] == 'compare_only_same_basis'

        # On 1 January 2027, the announced cap automatically becomes the active cap.
        publish(store, datetime(2027, 1, 1, 0, 5, tzinfo=timezone.utc))
        deliver(tmp_path, public_dir)
        manifest = json.loads((public_dir / 'current.json').read_text())
        energy = json.loads((public_dir / manifest['data_url']).read_text())['metrics']['household_energy']
        assert energy['validation_status'] == 'verified'
        assert energy['latest']['period'] == '2027-01-01'
        assert energy['latest']['value'] == '2166'
        assert energy['latest']['reference']['period_status'] == 'effective'
        assert energy['latest']['reference']['tax_treatment'] == expected_tax
        assert energy['upcoming_period'] is None
        assert [(p['period'], p['reference']['period_status'], p['reference']['tax_treatment'])
                for p in energy['history']] == [
            ('2026-10-01', 'expired', expected_tax),
            ('2027-01-01', 'effective', expected_tax),
        ]

        # A later separate 0% VAT window with a different start date must not overwrite the 2026 window.
        future_window_page = (
            announced_only_jan_2027_page()
            .replace(b'From 1 January to 31 March 2027, the price cap will be \xc2\xa32,166 per year.',
                     b'From 1 October to 31 December 2028, the price cap will be \xc2\xa31,900 per year.')
            .replace(b'1 January to 31 March 2027', b'1 October to 31 December 2028')
            .replace(b'from 1 October 2026 to 30 June 2027', b'from 1 October 2028 to 31 March 2029')
        )
        store.ingest('household_energy', future_window_page,
                     datetime(2028, 10, 15, 8, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url)
        publish(store, datetime(2028, 10, 15, 8, tzinfo=timezone.utc))
        deliver(tmp_path, public_dir)
        manifest = json.loads((public_dir / 'current.json').read_text())
        energy = json.loads((public_dir / manifest['data_url']).read_text())['metrics']['household_energy']
        by_period = {p['period']: p['reference']['tax_treatment'] for p in energy['history']}
        assert by_period == {
            '2026-10-01': expected_tax,
            '2027-01-01': expected_tax,
            '2028-10-01': '5% VAT on gas; 0% VAT on electricity from 1 October 2028 to 31 March 2029',
        }
    finally:
        store.close()


def test_ofgem_duplicate_announced_headline_and_repeated_start_year():
    repeated_year = announced_only_jan_2027_page().replace(
        b'From 1 January to 31 March 2027', b'From 1 January 2027 to 31 March 2027')
    snap = parse('household_energy', repeated_year, date(2026, 11, 25))
    assert snap.observations[0].period == '2027-01-01'
    assert snap.observations[0].value == '2166'

    duplicate = announced_only_jan_2027_page().replace(
        b'<p>Average electricity',
        ('<p>From 1 January to 31 March 2027, the price cap will be £2,200 per year.</p>'
         '<p>This figure is based on the average energy unit rate and standing charge for people who pay by Direct Debit in England, Scotland and Wales.</p>'
         '<p>Average electricity').encode())
    with pytest.raises(ValueError, match='currently effective or next announced'):
        parse('household_energy', duplicate, date(2026, 11, 25))
