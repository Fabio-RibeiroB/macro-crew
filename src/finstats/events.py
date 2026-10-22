"""Bounded official event schedules, private receipts and additive public export."""
from __future__ import annotations

from datetime import date, datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from finstats.storage import atomic_write, encode, timestamp

LONDON = ZoneInfo('Europe/London')
MAX_BYTES = 2_000_000
SOURCES = {
    'ons': ('https://api.beta.ons.gov.uk/v1/search/releases?limit=100&fromDate={today}&toDate={year}', 'https://www.ons.gov.uk/releasecalendar'),
    'boe_mpc': ('https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates', 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates'),
    'obr': ('https://obr.uk/publications/', 'https://obr.uk/publications/'),
    'hm_treasury': ('https://www.gov.uk/search/news-and-communications?organisations%5B%5D=hm-treasury', 'https://www.gov.uk/search/news-and-communications?organisations%5B%5D=hm-treasury'),
    'desnz_fuel': ('https://www.gov.uk/government/statistics/weekly-road-fuel-prices', 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices'),
    'ofgem_energy': ('https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-and-standing-charges-explained', 'https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-and-standing-charges-explained'),
}
INDICATORS = {'ons': ['uk.cpi.annual_rate','uk.cpih.annual_rate','uk.gdp.monthly_growth','uk.regular_pay.nominal_annual_growth','uk.regular_pay.real_annual_growth','uk.unemployment.rate','uk.private_rent.annual_growth','uk.private_rent.monthly_level','uk.house_price.average_level','uk.house_price.annual_change'], 'boe_mpc':['uk.bank_rate.daily'], 'desnz_fuel':['uk.road_fuel.unleaded_petrol_price','uk.road_fuel.diesel_price'], 'ofgem_energy':['uk.energy.price_cap'], 'obr':['uk.public_debt.share_gdp'], 'hm_treasury':['uk.public_debt.share_gdp']}

class Text(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]
    def handle_data(self, data): self.parts.append(data)

def _text(body):
    p=Text(); p.feed(body.decode('utf-8','replace')); return ' '.join(' '.join(p.parts).split())

def _fetch(url):
    if urlsplit(url).scheme != 'https': raise ValueError('HTTPS required')
    req=Request(url, headers={'User-Agent':'FinStats official events collector/1.0','Accept':'application/json,text/html'})
    with urlopen(req, timeout=20) as response:
        if response.geturl() != url: raise ValueError('redirect rejected')
        body=response.read(MAX_BYTES+1)
        if len(body)>MAX_BYTES: raise ValueError('source exceeds size limit')
        return body

def _parse_ons(body, today):
    data=json.loads(body)
    if not isinstance(data.get('releases'),list): raise ValueError('invalid ONS release response')
    out=[]
    for item in data['releases']:
        desc=item.get('description') or {}
        raw=desc.get('release_date'); title=desc.get('title')
        if not isinstance(raw,str) or not isinstance(title,str): continue
        if not re.search(r'\b(CPI|CPIH|consumer price|GDP|labour market|earnings|employment|unemployment|private rent|house price)\b',title,re.I): continue
        try: instant=datetime.fromisoformat(raw.replace('Z','+00:00'))
        except ValueError: continue
        if instant.tzinfo is None: continue
        d=instant.astimezone(LONDON).date().isoformat()
        if d < today.isoformat(): continue
        cancelled=bool(desc.get('cancelled'))
        status='cancelled' if cancelled else ('rescheduled' if desc.get('postponed') or item.get('date_changes') else ('published' if desc.get('published') else 'scheduled'))
        uri=item.get('uri','')
        if not uri.startswith('/'): continue
        out.append(event('ons:'+uri,title,d,raw,status,'ons',INDICATORS['ons'], 'https://www.ons.gov.uk'+uri))
    return out

def event(identity,title,day,when,status,source,indicators,url):
    date.fromisoformat(day)
    if not title or len(title)>240: raise ValueError('invalid event title')
    if when:
        parsed=datetime.fromisoformat(when)
        if parsed.tzinfo is None: raise ValueError('event time requires explicit timezone')
        local=parsed.astimezone(LONDON)
        value=local.isoformat(timespec='minutes')
        precision='minute'
    else: value=None; precision='date'
    return {'id':identity,'title':title,'date':day,'time':value,'time_precision':precision,'status':status,'source':source,'source_url':url,'linked_indicators':indicators}

MONTH={'January':1,'February':2,'March':3,'April':4,'May':5,'June':6,'July':7,'August':8,'September':9,'October':10,'November':11,'December':12}
def _date(text):
    m=re.search(r'\b(\d{1,2})\s+('+'|'.join(MONTH)+r')\s+(20\d{2})\b',text)
    if not m: return None
    return date(int(m[3]),MONTH[m[2]],int(m[1])).isoformat()

def parse_source(source,body,today):
    if source=='ons': return _parse_ons(body,today)
    text=_text(body)
    found=[]
    if source=='boe_mpc':
        # The Bank's dated confirmed-date table; date-only because no release time is given here.
        year_markers=list(re.finditer(r'(20\d{2})\s+confirmed dates',text,re.I))
        for m in re.finditer(r'(?:Thursday|Tuesday|Wednesday)\s+(\d{1,2})\s+('+'|'.join(MONTH)+r')\b',text):
            years=[y for y in year_markers if y.start()<m.start()]
            if not years: continue
            year=int(years[-1].group(1))
            d=date(year,MONTH[m[2]],int(m[1])).isoformat()
            if d>=today.isoformat(): found.append(event('boe:mpc:'+d,'MPC decision and minutes',d,None,'scheduled',source,INDICATORS[source],SOURCES[source][1]))
    elif source=='desnz_fuel':
        # Only dated page-update notices are actual publication evidence; no weekly extrapolation.
        for m in re.finditer(r'Road fuel prices for week commencing[^.]{0,100}published',text,re.I):
            before=text[max(0,m.start()-45):m.start()]
            d=_date(before)
            if d and d>=today.isoformat(): found.append(event('desnz:fuel:'+d,'Weekly road fuel prices',d,None,'scheduled',source,INDICATORS[source],SOURCES[source][1]))
    # HMT, OBR and Ofgem list/landing pages do not establish a future dated schedule.
    # Their successful checks explicitly publish unknown rather than inferred dates.
    return found

def _paths(state):
    root=Path(state); return root/'events.json',root/'events-raw'

def collect_events(state,clock=None,fetch=_fetch,fixtures=None):
    """Read one official bounded endpoint/provider; retain last verified events on failure."""
    now=(clock or (lambda:datetime.now(timezone.utc)))()
    if now.tzinfo is None: raise ValueError('timezone-aware collection time required')
    local=now.astimezone(LONDON).date(); state=Path(state); state.mkdir(parents=True,exist_ok=True,mode=0o700)
    state_file,raw_dir=_paths(state)
    saved=json.loads(state_file.read_text()) if state_file.exists() else {'schema_version':1,'providers':{},'attempts':[],'revisions':[]}
    failed=[]
    for name,(template,source_url) in SOURCES.items():
        url=template.format(today=local.isoformat(),year=local.replace(year=local.year+1).isoformat()) if '{' in template else template
        try:
            if fixtures:
                candidate=Path(fixtures)/('events_'+name+'.json')
                if not candidate.exists(): candidate=Path(fixtures)/('events_'+name+'.html')
                body=candidate.read_bytes(); kind='recorded_fixture'
            else: body=fetch(url); kind='official_download'
            events=parse_source(name,body,local)
            digest=sha256(body).hexdigest(); raw_dir.mkdir(mode=0o700,exist_ok=True); atomic_write(raw_dir/(digest+'.bin'),body)
            old=saved['providers'].get(name,{})
            # Dedupe by stable identity; latest source response is authoritative, including removals.
            dedup={e['id']:e for e in events}; events=sorted(dedup.values(),key=lambda e:(e['date'],e['id']))
            previous=old.get('events',[])
            if previous!=events: saved['revisions'].append({'provider':name,'at':timestamp(now),'from_sha256':old.get('sha256'),'to_sha256':digest})
            saved['providers'][name]={'status':'ok','retrieved_at':timestamp(now),'source_url':source_url,'sha256':digest,'evidence_kind':kind,'events':events,'unknown_dates':name in {'obr','hm_treasury','ofgem_energy'} or not events}
            saved['attempts'].append({'provider':name,'at':timestamp(now),'status':'ok','sha256':digest,'evidence_kind':kind})
        except Exception as exc:
            failed.append(name); old=saved['providers'].get(name,{})
            old.update(status='stale' if old.get('events') else 'unavailable',last_failure_at=timestamp(now),last_error=type(exc).__name__)
            saved['providers'][name]=old
            saved['attempts'].append({'provider':name,'at':timestamp(now),'status':'failed','error_type':type(exc).__name__,'evidence_kind':'recorded_fixture' if fixtures else 'official_download'})
    saved['checked_at']=timestamp(now); saved['mode']='fixtures' if fixtures else 'official'
    atomic_write(state_file,encode(saved))
    return {'failed_sources':failed,'schedule':saved}

def public_events(state):
    """Project safe public event feed; reject any fixture-derived provider."""
    source=Path(state)/'events.json'
    if not source.exists(): return None
    data=json.loads(source.read_text()); providers={}
    for name,p in data['providers'].items():
        if p.get('evidence_kind')=='recorded_fixture': raise ValueError('fixture events cannot be published as official')
        if p.get('events') and p.get('evidence_kind')!='official_download': raise ValueError('event evidence kind is missing')
        events=p.get('events',[])
        if any(e.get('source')!=name or urlsplit(e.get('source_url','')).scheme!='https' for e in events): raise ValueError('invalid event provenance')
        providers[name]={k:p.get(k) for k in ('status','retrieved_at','source_url','sha256','events','unknown_dates','last_failure_at') if k in p}
    shared=deduplicate_events(e for provider in providers.values() for e in provider.get('events',[]))
    return {'schema_version':1,'mode':'official','checked_at':data['checked_at'],'providers':providers,
            'events':shared}

def deduplicate_events(events):
    shared={}
    for item in events:
        prior=shared.get(item['id'])
        if prior is None: shared[item['id']]=dict(item)
        else:
            prior['linked_indicators']=sorted(set(prior.get('linked_indicators',[]))|set(item.get('linked_indicators',[])))
    return sorted(shared.values(),key=lambda e:(e['date'],e['id']))
