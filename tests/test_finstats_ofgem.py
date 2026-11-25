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


def standard_vat_july_2027_page(
    vat_text='Figures are rounded to two decimal places and include 5% VAT.',
    tax_change=False,
):
    change_note = (
        '<p>Costs cannot be compared directly to previous periods because of this change.</p>'
        if tax_change else ''
    )
    return (
        '<title>Energy price cap unit rates and standing charges | Ofgem</title>'
        '<p>Average electricity and gas unit prices and standing charges by Direct Debit</p>'
        '<p>From 1 July to 30 September 2027, the price cap will be £1,890 per year.</p>'
        '<p>This figure is based on the average energy unit rate and standing charge for people who pay by Direct Debit in England, Scotland and Wales.</p>'
        '<table><tr><th>Energy price cap per unit and standing charge</th>'
        '<th>1 July to 30 September 2027</th></tr>'
        '<tr><td>Electricity</td><td>28.40 pence per kWh 56.10 pence daily standing charge</td></tr>'
        '<tr><td>Gas</td><td>8.15 pence per kWh 30.20 pence daily standing charge</td></tr></table>'
        f'<p>{vat_text}</p>{change_note}'
    ).encode()


@pytest.mark.parametrize('vat_text', [
    'Figures are rounded to two decimal places and include 5% VAT.',
    'Prices including 5% VAT are rounded to two decimal places.',
    'Figures include 5% VAT on gas and electricity.',
    'Figures include 5% VAT on both electricity and gas.',
    'Rates shown with 5% VAT on gas and electricity.',
    'Figures include VAT at 5%.',
    'Figures are rounded to two decimal places and include 5% VAT. Prices include VAT and are rounded to two decimal places.',
])
def test_ofgem_standard_5_percent_vat_comparable_period(vat_text):
    snap = parse('household_energy', standard_vat_july_2027_page(vat_text=vat_text), date(2027, 7, 15))
    assert len(snap.observations) == 1
    point = snap.observations[0]
    assert point.period == '2027-07-01'
    assert point.value == '1890'
    assert point.reference['period_status'] == 'effective'
    assert point.reference['tax_treatment'] == '5% VAT on gas and electricity'
    assert point.reference['comparison_status'] == 'compare_only_same_basis'
    assert point.reference['electricity'] == {
        'unit_rate_p_per_kwh': '28.40', 'standing_charge_p_per_day': '56.10'}
    assert point.reference['gas'] == {
        'unit_rate_p_per_kwh': '8.15', 'standing_charge_p_per_day': '30.20'}


def test_ofgem_standard_5_percent_vat_return_marks_not_comparable_tax_change():
    snap = parse('household_energy', standard_vat_july_2027_page(tax_change=True), date(2027, 7, 15))
    point = snap.observations[0]
    assert point.reference['tax_treatment'] == '5% VAT on gas and electricity'
    assert point.reference['comparison_status'] == 'not_comparable_tax_change'


def test_ofgem_standard_5_percent_vat_two_period_page_marks_only_earliest_non_comparable():
    two_period_page = (
        '<title>Energy price cap unit rates and standing charges | Ofgem</title>'
        '<p>What net zero means for consumers.</p>'
        '<p>Average electricity and gas unit prices and standing charges by Direct Debit</p>'
        '<p>From 1 July to 30 September 2027, the price cap will be £1,890 per year.</p>'
        '<p>This figure is based on the average energy unit rate and standing charge for people who pay by Direct Debit in England, Scotland and Wales.</p>'
        '<p>From 1 October to 31 December 2027, the price cap will be £1,920 per year.</p>'
        '<p>This figure is based on the average energy unit rate and standing charge for people who pay by Direct Debit in England, Scotland and Wales.</p>'
        '<table><tr><th>Energy price cap per unit and standing charge</th>'
        '<th>1 July to 30 September 2027</th><th>1 October to 31 December 2027</th></tr>'
        '<tr><td>Electricity</td><td>28.40 pence per kWh 56.10 pence daily standing charge</td>'
        '<td>29.00 pence per kWh 56.50 pence daily standing charge</td></tr>'
        '<tr><td>Gas</td><td>8.15 pence per kWh 30.20 pence daily standing charge</td>'
        '<td>8.30 pence per kWh 30.40 pence daily standing charge</td></tr></table>'
        '<p>Figures are rounded to two decimal places and include 5% VAT.</p>'
        '<p>Costs cannot be compared directly to previous periods because of this change.</p>'
    ).encode()
    sep_snap = parse('household_energy', two_period_page, date(2027, 9, 1))
    assert [(o.period, o.reference['period_status'], o.reference['comparison_status'])
            for o in sep_snap.observations] == [
        ('2027-07-01', 'effective', 'not_comparable_tax_change'),
        ('2027-10-01', 'announced', 'compare_only_same_basis'),
    ]
    # Once Oct-Dec 2027 becomes effective while Jul-Sep remains in the headline, Oct-Dec stays comparable.
    oct_snap = parse('household_energy', two_period_page, date(2027, 10, 5))
    assert [(o.period, o.reference['period_status'], o.reference['comparison_status'])
            for o in oct_snap.observations] == [
        ('2027-10-01', 'effective', 'compare_only_same_basis'),
    ]


def test_ofgem_real_fixture_rewritten_to_standard_5_percent_vat_parses_cleanly():
    rewritten = (
        BODY
        .replace(b'include 5% VAT on gas. There is no VAT on electricity from 1 October 2026 to 31 March 2027.',
                 b'include 5% VAT.')
        .replace(b'Prices include VAT on gas only and are rounded to two decimal places.',
                 b'Prices include VAT and are rounded to two decimal places.')
        .replace(b'Costs cannot be compared directly to previous periods because of this change.', b'')
    )
    snap = parse('household_energy', rewritten, date(2026, 10, 22))
    assert snap.observations[0].reference['tax_treatment'] == '5% VAT on gas and electricity'
    assert snap.observations[0].reference['comparison_status'] == 'compare_only_same_basis'


@pytest.mark.parametrize('vat_text', [
    'Figures are rounded to two decimal places.',
    'Figures are rounded to two decimal places and include VAT.',
    'Figures include 5% VAT on gas.',
    'Figures include 5% VAT. There is no VAT on electricity until further notice.',
    'Figures include 5% VAT on gas. There is no VAT on electricity from 32 October 2026 to 30 June 2027.',
    'Figures include 5% VAT. Prices include VAT on gas only.',
    'Figures include 5% VAT (0% VAT on electricity).',
    'Figures include 5% VAT, except electricity which is zero-rated.',
    'Figures include 5% VAT. Electricity is 0% VAT from 1 July 2027 to 30 September 2027.',
    'Gas figures include 5% VAT. Electricity figures have zero VAT.',
    'Gas figures include 5% VAT.',
    'Figures include 5% VAT; no VAT applies to electricity.',
    'Figures do not include 5% VAT.',
    'Figures exclude VAT. Prepayment figures include 5% VAT.',
    'Figures include 5% VAT. Electricity is VAT-free.',
    'Figures include 5% VAT. VAT is not charged on electricity.',
    'Figures include 5% VAT. Electricity is not subject to VAT.',
    'Figures include 5% VAT, apart from electricity.',
    'Figures include 5% VAT. Electricity VAT is zero.',
    'Figures include 5% VAT. Electricity: 0 per cent VAT.',
    'Figures include 5% VAT. From 1 October electricity VAT is removed.',
    'Figures include 5% VAT where applicable.',
    'Figures include 5% VAT. Electricity is zero-rated.',
])
def test_ofgem_missing_malformed_or_gas_only_vat_fails_closed(vat_text):
    with pytest.raises(ValueError, match='VAT basis is missing or changed'):
        parse('household_energy', standard_vat_july_2027_page(vat_text=vat_text), date(2027, 7, 15))


# --- Mixed-VAT transition: 0% electricity VAT window ends 30 June 2027 (#203) ---

HEADLINE_BASIS = ('<p>This figure is based on the average energy unit rate and standing charge for '
                  'people who pay by Direct Debit in England, Scotland and Wales.</p>')
WINDOW_VAT = ('<p>Figures are rounded to two decimal places and include 5% VAT on gas. '
              'There is no VAT on electricity from 1 October 2026 to 30 June 2027.</p>')
POST_WINDOW_VAT = '<p>From 1 July 2027, 5% VAT applies to both gas and electricity.</p>'
TAX_CHANGE_NOTE = '<p>Costs cannot be compared directly to previous periods because of this change.</p>'


def transition_page(two_periods=True, vat=WINDOW_VAT, post=POST_WINDOW_VAT, note=TAX_CHANGE_NOTE,
                    q3_label='1 July to 30 September 2027', q3_headline='1 July to 30 September 2027'):
    q2_head = ('<p>From 1 April to 30 June 2027, the price cap will be £1,800 per year.</p>' + HEADLINE_BASIS
               if two_periods else '')
    q2_col = '<th>1 April to 30 June 2027</th>' if two_periods else ''
    q2_el = '<td>27.00 pence per kWh 55.00 pence daily standing charge</td>' if two_periods else ''
    q2_gas = '<td>8.00 pence per kWh 30.00 pence daily standing charge</td>' if two_periods else ''
    return (
        '<title>Energy price cap unit rates and standing charges | Ofgem</title>'
        '<p>Average electricity and gas unit prices and standing charges by Direct Debit</p>'
        f'{q2_head}'
        f'<p>From {q3_headline}, the price cap will be £1,890 per year.</p>{HEADLINE_BASIS}'
        f'<table><tr><th>Energy price cap per unit and standing charge</th>{q2_col}<th>{q3_label}</th></tr>'
        f'<tr><td>Electricity</td>{q2_el}<td>28.40 pence per kWh 56.10 pence daily standing charge</td></tr>'
        f'<tr><td>Gas</td>{q2_gas}<td>8.15 pence per kWh 30.20 pence daily standing charge</td></tr></table>'
        f'{vat}{post}{note}'
    ).encode()


WINDOW_TAX = '5% VAT on gas; 0% VAT on electricity from 1 October 2026 to 30 June 2027'
POST_TAX = '5% VAT on gas and electricity'


def test_ofgem_two_period_mixed_vat_transition_page_separates_tax_bases():
    snap = parse('household_energy', transition_page(), date(2027, 5, 28))
    assert [(o.period, o.value, o.reference['period_status'], o.reference['tax_treatment'],
             o.reference['comparison_status']) for o in snap.observations] == [
        ('2027-04-01', '1800', 'effective', WINDOW_TAX, 'compare_only_same_basis'),
        ('2027-07-01', '1890', 'announced', POST_TAX, 'not_comparable_tax_change'),
    ]


@pytest.mark.parametrize('post', [
    '<p>From 1 July 2027, 5% VAT applies to both gas and electricity.</p>',
    '<p>From 1 July 2027, 5% VAT applies to gas and electricity.</p>',
    '<p>From 1 July 2027, figures include 5% VAT on gas and electricity.</p>',
    '<p>Prices from 1 July 2027 include 5% VAT.</p>',
])
def test_ofgem_announcement_only_transition_page_with_explicit_post_window_vat(post):
    # No Ofgem "cannot be compared" note: returning to 5% VAT is still flagged.
    snap = parse('household_energy', transition_page(two_periods=False, post=post, note=''), date(2027, 5, 28))
    assert len(snap.observations) == 1
    point = snap.observations[0]
    assert (point.period, point.reference['period_status']) == ('2027-07-01', 'announced')
    assert point.reference['tax_treatment'] == POST_TAX
    assert point.reference['comparison_status'] == 'not_comparable_tax_change'


def test_ofgem_post_window_cap_becomes_effective_after_window_ends():
    snap = parse('household_energy', transition_page(), date(2027, 7, 2))
    assert [(o.period, o.reference['period_status'], o.reference['tax_treatment'])
            for o in snap.observations] == [('2027-07-01', 'effective', POST_TAX)]
    assert snap.observations[0].reference['comparison_status'] == 'not_comparable_tax_change'


@pytest.mark.parametrize('secondary_caption', [
    b'Prices include VAT on gas only and are rounded to two decimal places.',
    b'Prices include VAT and are rounded to two decimal places.',
    b'Prices include 5% VAT on gas and electricity and are rounded to two decimal places.',
])
def test_ofgem_real_fixture_rewritten_as_mixed_vat_transition_page_parses_both_periods(secondary_caption):
    announced_headline = (
        b'<p>From 1 January to 31 March 2027, the price cap will be \xc2\xa31,890 per year.</p>'
        b'<p>This figure is based on the average energy unit rate and standing charge '
        b'for people who pay by Direct Debit in England, Scotland and Wales.</p>'
    )
    rewritten = (
        BODY
        .replace(b'1 July to 30 September 2026', b'1 January to 31 March 2027')
        .replace(
            b'From 1 October to 31 December 2026, the price cap will be \xc2\xa31,723 per year.',
            announced_headline + b'From 1 October to 31 December 2026, the price cap will be \xc2\xa31,723 per year.',
            1,
        )
        .replace(
            b'There is no VAT on electricity from 1 October 2026 to 31 March 2027.',
            b'There is no VAT on electricity from 1 October 2026 to 31 December 2026. '
            b'From 1 January 2027, 5% VAT applies to both gas and electricity.',
        )
        .replace(b'Prices include VAT on gas only and are rounded to two decimal places.', secondary_caption)
    )
    snap = parse('household_energy', rewritten, date(2026, 11, 25))
    assert [(o.period, o.value, o.reference['period_status'], o.reference['tax_treatment'],
             o.reference['comparison_status']) for o in snap.observations] == [
        ('2027-01-01', '1890', 'announced', POST_TAX, 'not_comparable_tax_change'),
        ('2026-10-01', '1723', 'effective',
         '5% VAT on gas; 0% VAT on electricity from 1 October 2026 to 31 December 2026',
         'not_comparable_tax_change'),
    ]


@pytest.mark.parametrize('two_periods', [True, False])
@pytest.mark.parametrize('post', [
    '',  # Window mentioned, no post-window VAT statement.
    '<p>From 1 August 2027, 5% VAT applies to both gas and electricity.</p>',  # Wrong date.
    '<p>From 2 July 2027, 5% VAT applies to both gas and electricity.</p>',
    '<p>From 1 July 2026, 5% VAT applies to both gas and electricity.</p>',
    '<p>From 1 July 2027, 5% VAT applies to gas.</p>',  # Partial fuel.
    '<p>From 1 July 2027, 5% VAT applies to electricity.</p>',
    '<p>From 1 July 2027, figures include 5% VAT on gas.</p>',
    '<p>From 1 July 2027, 5% VAT applies to both gas and electricity where applicable.</p>',
    '<p>From 1 July 2027, 5% VAT applies to both gas and electricity, subject to confirmation.</p>',
    '<p>From 1 July 2027, 5% VAT applies to both gas and electricity.</p><p>The 0% VAT on electricity is extended.</p>',
    POST_WINDOW_VAT + '<p>0% VAT extended.</p>',
    POST_WINDOW_VAT + '<p>Electricity remains exempt.</p>',
    POST_WINDOW_VAT + '<p>Elec&shy;tricity remains exempt.</p>',
    POST_WINDOW_VAT + '<p>Elec\u2060tricity remains exempt.</p>',
    POST_WINDOW_VAT + '<p>Electricity carries no taxes until 30 September 2027.</p>',
    POST_WINDOW_VAT + '<p>The government has delayed the end of the zero rate for power.</p>',
    POST_WINDOW_VAT + '<p>0% applies to power until September 2027.</p>',
    POST_WINDOW_VAT + '<p>Electricity VAT is zero-rated.</p>',
    POST_WINDOW_VAT + '<p>There is no VAT on electricity from 1 October 2026 to 30 September 2027.</p>',
    POST_WINDOW_VAT + '<p>Prices include VAT where applicable.</p>',
    POST_WINDOW_VAT + '<p>Prices include VAT on gas only from 1 July 2027.</p>',
    POST_WINDOW_VAT + '<p>Figures exclude tax.</p>',
    POST_WINDOW_VAT + '<p>Prices are untaxed.</p>',
    POST_WINDOW_VAT + '<p>Prices include value added tax.</p>',
    '<p>From 1 July 2027, 5% VAT applies to both gas and electricity. 5% VAT applies from 1 October 2027.</p>',
])
def test_ofgem_transition_page_fails_closed_on_missing_or_ambiguous_post_window_vat(two_periods, post):
    with pytest.raises(ValueError, match='does not state VAT treatment'):
        parse('household_energy', transition_page(two_periods=two_periods, post=post), date(2027, 5, 28))


@pytest.mark.parametrize('post_only', [
    '<p>From 1 July 2027, figures include 5% VAT on gas and electricity.</p>',
    '<p>From 1 July 2027, prices include 5% VAT on gas as well as electricity.</p>',
    '<p>From 1 July 2027, prices include 5% VAT on gas, and electricity.</p>',
    '<p>Prices include 5% VAT on gas and on electricity from 1 July 2027.</p>',
])
def test_ofgem_post_window_statement_cannot_stand_in_for_gas_vat_or_window_sentence(post_only):
    # Post-window wording alone must not make the effective 0%-window period parse.
    only_post = WINDOW_VAT.replace('Figures are rounded to two decimal places and include 5% VAT on gas. ', '')
    with pytest.raises(ValueError, match='VAT basis is missing or changed'):
        parse('household_energy', transition_page(vat=only_post, post=post_only), date(2027, 5, 28))


def test_ofgem_pre_window_period_in_transition_page_fails_closed():
    # The effective quarter starts before the stated 0% window: it never inherits any basis.
    body = transition_page().replace(b'from 1 October 2026 to 30 June 2027', b'from 1 May 2027 to 30 June 2027')
    with pytest.raises(ValueError, match='does not state VAT treatment'):
        parse('household_energy', body, date(2027, 5, 28))


def test_ofgem_straddling_period_across_window_end_fails_closed():
    # Window ends mid-quarter: neither inside the window nor wholly after it.
    body = transition_page(two_periods=False).replace(
        b'from 1 October 2026 to 30 June 2027', b'from 1 October 2026 to 15 August 2027').replace(
        b'From 1 July 2027, 5% VAT', b'From 16 August 2027, 5% VAT')
    with pytest.raises(ValueError, match='does not state VAT treatment'):
        parse('household_energy', body, date(2027, 5, 28))


def test_ofgem_later_quarter_after_window_also_requires_post_window_statement():
    page = transition_page(two_periods=False, q3_label='1 October to 31 December 2027',
                           q3_headline='1 October to 31 December 2027')
    # Starts after the first post-window day: accepted on the statement but never the tax-change flag.
    snap = parse('household_energy', page, date(2027, 9, 1))
    assert snap.observations[0].reference['tax_treatment'] == POST_TAX
    assert snap.observations[0].reference['comparison_status'] == 'compare_only_same_basis'
    with pytest.raises(ValueError, match='does not state VAT treatment'):
        parse('household_energy', transition_page(two_periods=False, post='', q3_label='1 October to 31 December 2027',
                                                  q3_headline='1 October to 31 December 2027'), date(2027, 9, 1))


@pytest.mark.parametrize('vat_text', [
    'Figures include 5% VAT. Prices include value added tax on gas only.',
    'Figures include 5% VAT. Electricity is untaxed.',
    'Figures include 5% VAT. Figures exclude tax.',
    'Figures include 5% VAT. Electricity is tax-free.',
    'Figures include 5% VAT. Electricity is taxed at 0%.',
    'Figures include 5% VAT. Electricity carries no taxes.',
    'Figures include 5% VAT. Electricity is not subject to taxation.',
    'Figures include 5% VAT. Value added tax is not charged on electricity.',
])
def test_ofgem_standard_vat_mode_checks_tax_wording_beyond_vat_token(vat_text):
    with pytest.raises(ValueError, match='VAT basis is missing or changed'):
        parse('household_energy', standard_vat_july_2027_page(vat_text=vat_text), date(2027, 7, 15))


@pytest.mark.parametrize('vat_text', [
    'Figures include 5% VAT. Figures include 5%​ VAT on gas only; VAT‍ is zero on electricity.',
    'Figures include 5% VAT. Electricity is 0​% VAT.',
    'Figures include 5% VAT. Electricity is zero‌-rated.',
    'Figures include 5% VAT. Electricity is un​taxed.',
    'Figures include 5% VAT. Electricity is exem﻿pt.',
    'Figures include 5% VAT. Elec&shy;tricity is exempt.',
])
def test_ofgem_zero_width_characters_cannot_hide_vat_exceptions(vat_text):
    with pytest.raises(ValueError, match='VAT basis is missing or changed'):
        parse('household_energy', standard_vat_july_2027_page(vat_text=vat_text), date(2027, 7, 15))


def test_ofgem_zero_width_characters_are_stripped_not_rejected_in_clean_wording():
    page = standard_vat_july_2027_page(vat_text='Figures include 5%​ VAT﻿.')
    snap = parse('household_energy', page, date(2027, 7, 15))
    assert snap.observations[0].reference['tax_treatment'] == POST_TAX


def test_ofgem_unrelated_tax_words_do_not_reject_standard_vat():
    page = standard_vat_july_2027_page().replace(
        b'<p>Figures are',
        b'<p>Taxpayer information, Council Tax support and innovation news.</p><p>Figures are',
        1,
    )
    assert parse('household_energy', page, date(2027, 7, 15)).observations[0].value == '1890'


def test_published_mixed_basis_energy_keeps_both_tax_bases_distinct(tmp_path):
    store = Store(tmp_path / 'private')
    try:
        # Earlier quarter on the 0%-electricity window as first published (older window end date).
        store.ingest('household_energy', announced_only_jan_2027_page().replace(
            b'1 October 2026 to 30 June 2027', b'1 October 2026 to 31 March 2027'),
            datetime(2027, 1, 5, 8, tzinfo=timezone.utc), source_url=DEFINITIONS['household_energy'].download_url)
        store.ingest('household_energy', transition_page(), datetime(2027, 5, 28, 8, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url)
        publish(store, datetime(2027, 6, 10, 8, tzinfo=timezone.utc))
        public_dir = tmp_path / 'public'
        deliver(tmp_path / 'private', public_dir)
        manifest = json.loads((public_dir / 'current.json').read_text())
        energy = json.loads((public_dir / manifest['data_url']).read_text())['metrics']['household_energy']
        assert energy['latest']['period'] == '2027-04-01'
        assert energy['latest']['reference']['tax_treatment'] == WINDOW_TAX
        assert energy['latest']['reference']['comparison_status'] == 'compare_only_same_basis'
        upcoming = energy['upcoming_period']
        assert upcoming['period'] == '2027-07-01'
        assert upcoming['reference']['tax_treatment'] == POST_TAX
        assert upcoming['reference']['comparison_status'] == 'not_comparable_tax_change'
        # Earlier window quarter adopts the extended 30 June 2027 window end date.
        taxes = {p['period']: p['reference']['tax_treatment'] for p in energy['history']}
        assert taxes['2027-01-01'] == WINDOW_TAX
        assert taxes['2027-04-01'] == WINDOW_TAX
        # Once 1 July 2027 arrives, Q3 enters history with POST_TAX and is never rewritten into WINDOW_TAX.
        publish(store, datetime(2027, 7, 5, 8, tzinfo=timezone.utc))
        deliver(tmp_path / 'private', public_dir)
        manifest_after = json.loads((public_dir / 'current.json').read_text())
        energy_after = json.loads((public_dir / manifest_after['data_url']).read_text())['metrics']['household_energy']
        assert energy_after['latest']['period'] == '2027-07-01'
        assert energy_after['latest']['reference']['tax_treatment'] == POST_TAX
        assert energy_after['latest']['reference']['comparison_status'] == 'not_comparable_tax_change'
        taxes_after = {p['period']: p['reference']['tax_treatment'] for p in energy_after['history']}
        assert taxes_after['2027-01-01'] == WINDOW_TAX
        assert taxes_after['2027-04-01'] == WINDOW_TAX
        assert taxes_after['2027-07-01'] == POST_TAX
    finally:
        store.close()
