import hashlib
import json
import gzip
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from finstats.sources import DEFINITIONS, parse
from finstats.storage import Store


FIXTURES = Path(__file__).parent / 'fixtures' / 'official'
PAGE = FIXTURES / 'ofgem_energy_price_cap_2026-10.html.gz'
BODY = gzip.decompress(PAGE.read_bytes())


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


def test_ofgem_effective_date_activation_fails_closed():
    body = BODY
    with pytest.raises(ValueError, match='currently effective'):
        parse('household_energy', body, date(2026, 9, 30))
    assert parse('household_energy', body, date(2026, 10, 1)).observations[0].value == '1723'
    with pytest.raises(ValueError, match='currently effective'):
        parse('household_energy', body, date(2027, 1, 1))


def test_announced_cap_is_separate_until_its_effective_date():
    body = '''<p>From 1 October to 31 December 2026, the price cap will be £1,723 per year.</p>
      <p>From 1 January to 31 March 2027, the price cap will be \xa31,750 per year.</p>
      <table><tr><th>Energy price cap per unit and standing charge</th>
      <th>1 October to 31 December 2026</th><th>1 January to 31 March 2027</th></tr>
      <tr><td>Electricity</td><td>26.32 pence per kWh 54.83 pence daily standing charge</td><td>27.00 pence per kWh 55.00 pence daily standing charge</td></tr>
      <tr><td>Gas</td><td>7.97 pence per kWh 29.68 pence daily standing charge</td><td>8.00 pence per kWh 30.00 pence daily standing charge</td></tr></table>
      <p>Figures include 5% VAT on gas and 0% VAT on electricity.</p>'''.encode()
    before = parse('household_energy', body, date(2026, 10, 22)).observations
    assert [(p.value, p.reference['period_status']) for p in before] == [
        ('1723', 'effective'), ('1750', 'announced')]
    after = parse('household_energy', body, date(2027, 1, 1)).observations
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
    next_page = '''<p>From 1 January to 31 March 2027, the price cap will be £1,750 per year.</p>
      <table><tr><th></th><th>Energy price cap per unit and standing charge 1 January to 31 March 2027</th></tr>
      <tr><td>Electricity</td><td>27.00 pence per kWh 55.00 pence daily standing charge</td></tr>
      <tr><td>Gas</td><td>8.00 pence per kWh 30.00 pence daily standing charge</td></tr></table>
      <p>Figures include 5% VAT on gas and 0% VAT on electricity.</p>'''.encode()
    try:
        store.ingest('household_energy', BODY, when,
                     source_url=DEFINITIONS['household_energy'].download_url)
        store.ingest('household_energy', next_page, datetime(2027, 1, 1, tzinfo=timezone.utc),
                     source_url=DEFINITIONS['household_energy'].download_url)
        history = store.observations('household_energy')
        assert [p['period'] for p in history] == ['2026-10-01', '2027-01-01']
        assert [p['value'] for p in history] == ['1723', '1750']
    finally:
        store.close()
