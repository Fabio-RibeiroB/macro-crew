"""Bounded official event schedules, private receipts and additive public export."""
from __future__ import annotations

from datetime import date, datetime, timezone, timedelta
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
    'ons': ('https://api.beta.ons.gov.uk/v1/search/releases?limit=1000&offset=0&sort=release_date_asc&fromDate={today}&toDate={year}', 'https://www.ons.gov.uk/releasecalendar'),
    'boe_mpc': ('https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates', 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates'),
    'obr': ('https://obr.uk/publications/', 'https://obr.uk/publications/'),
    'hm_treasury': ('https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date', 'https://www.gov.uk/government/publications/chancellor-letter-to-the-treasury-select-committee-tsc-budget-2026-date'),
    'desnz_fuel': ('https://www.gov.uk/government/statistics/weekly-road-fuel-prices', 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices'),
    'ofgem_energy': ('https://www.ofgem.gov.uk/news/changes-energy-price-cap-between-1-october-and-31-december-2026', 'https://www.ofgem.gov.uk/energy-regulation/domestic-and-non-domestic/energy-pricing-rules/energy-price-cap'),
}
INDICATORS = {
    'boe_mpc':['uk.bank_rate.daily'],
    'desnz_fuel':['uk.road_fuel.unleaded_petrol_price','uk.road_fuel.diesel_price'],
    'ofgem_energy':['uk.energy.price_cap'],
    'obr':['uk.public_debt.net_debt_gdp'],
    'hm_treasury':['uk.public_debt.net_debt_gdp'],
}
UNQUALIFIED_SOURCES = set()
ONS_FAMILIES = {
    'inflation': ['uk.cpi.annual_rate','uk.cpih.annual_rate'],
    'gdp': ['uk.gdp.monthly_growth'],
    'labour': ['uk.regular_pay.nominal_annual_growth','uk.regular_pay.real_annual_growth','uk.unemployment.rate'],
    'rent': ['uk.private_rent.annual_growth','uk.private_rent.monthly_level'],
    'housing': ['uk.house_price.average_level','uk.house_price.annual_change'],
}

def _ons_indicators(title):
    title=' '.join(title.split())
    if re.match(r'^Consumer price inflation(?:,|:|\b)',title,re.I):
        return ONS_FAMILIES['inflation']
    if re.match(r'^GDP monthly estimate(?:,|:|\b)',title,re.I):
        return ONS_FAMILIES['gdp']
    if re.match(r'^UK Labour Market(?:,|:|\b)',title,re.I):
        return ONS_FAMILIES['labour']
    # Earnings-only bulletins inform pay indicators, not unemployment.
    if re.match(r'^(?:Employee earnings in the UK|Earnings and working hours)(?:,|:|\b)',title,re.I):
        return ONS_FAMILIES['labour'][:2]
    if re.match(r'^Private rent and house prices, UK(?:,|:|\b)',title,re.I):
        return ONS_FAMILIES['rent'] + ONS_FAMILIES['housing']
    if re.match(r'^Index of Private Housing Rental Prices, UK(?:,|:|\b)',title,re.I):
        return ONS_FAMILIES['rent']
    if re.match(r'^UK House Price Index(?:,|:|\b)',title,re.I):
        return ONS_FAMILIES['housing']
    return []

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

def _provider_url_valid(name,url):
    parts=urlsplit(url)
    if parts.scheme!='https': return False
    if name=='ons':
        return bool(parts.hostname=='api.beta.ons.gov.uk' and parts.port is None and
                    re.fullmatch(r'/v1/search/releases',parts.path) and
                    re.fullmatch(r'limit=1000&offset=0&sort=release_date_asc&fromDate=\d{4}-\d{2}-\d{2}&toDate=\d{4}-\d{2}-\d{2}',parts.query))
    return url==SOURCES[name][0]

def _parse_ons(body, today):
    data=json.loads(body)
    if not isinstance(data.get('releases'),list): raise ValueError('invalid ONS release response')
    total=(data.get('breakdown') or {}).get('total')
    if not isinstance(total,int) or total<len(data['releases']):
        raise ValueError('invalid ONS result count')
    if total>len(data['releases']):
        raise ValueError('ONS release page is truncated')
    out=[]
    for item in data['releases']:
        desc=item.get('description') or {}
        raw=desc.get('release_date'); title=desc.get('title')
        if not isinstance(raw,str) or not isinstance(title,str): continue
        indicators=_ons_indicators(title)
        if not indicators: continue
        try: instant=datetime.fromisoformat(raw.replace('Z','+00:00'))
        except ValueError: continue
        if instant.tzinfo is None: continue
        d=instant.astimezone(LONDON).date().isoformat()
        if d < today.isoformat(): continue
        cancelled=bool(desc.get('cancelled'))
        status='cancelled' if cancelled else ('published' if desc.get('published') else ('rescheduled' if desc.get('postponed') or item.get('date_changes') else 'scheduled'))
        uri=item.get('uri','')
        if not re.fullmatch(r'/releases/[a-zA-Z0-9/_-]+',uri): continue
        out.append(event('ons:'+uri,title,d,raw,status,'ons',indicators, 'https://www.ons.gov.uk'+uri))
    return out

def event(identity,title,day,when,status,source,indicators,url):
    date.fromisoformat(day)
    if not title or len(title)>240: raise ValueError('invalid event title')
    if when:
        parsed=datetime.fromisoformat(when.replace('Z','+00:00'))
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
    if source=='obr': return _parse_obr(body,today)
    if source=='hm_treasury': return _parse_hm_treasury(body,today)
    if source=='ofgem_energy': return _parse_ofgem(body,today)
    text=_text(body)
    found=[]
    if source=='boe_mpc':
        # The Bank's dated confirmed-date table; date-only because no release time is given here.
        year_markers=list(re.finditer(r'(20\d{2})\s+confirmed dates',text,re.I))
        date_matches=list(re.finditer(r'(?:Thursday|Tuesday|Wednesday)\s+(\d{1,2})\s+('+'|'.join(MONTH)+r')\b',text))
        if not year_markers or not date_matches:
            raise ValueError('unrecognized BoE confirmed-date page structure')
        for m in date_matches:
            years=[y for y in year_markers if y.start()<m.start()]
            if not years: continue
            year=int(years[-1].group(1))
            d=date(year,MONTH[m[2]],int(m[1])).isoformat()
            if d>=today.isoformat(): found.append(event('boe:mpc:'+d,'MPC decision and minutes',d,None,'scheduled',source,INDICATORS[source],SOURCES[source][1]))
    elif source=='desnz_fuel':
        # Only dated page-update notices are actual publication evidence; no weekly extrapolation.
        release_pattern=(r'Road fuel prices for week commencing\s+(?:Monday\s+)?'
                         r'\d{1,2}\s+(?:'+'|'.join(MONTH)+r')\s+20\d{2}\s+'
                         r'published\.\s*(\d{1,2}\s+(?:'+'|'.join(MONTH)+r')\s+20\d{2})')
        release_matches=list(re.finditer(release_pattern,text,re.I))
        if not re.search(r'Weekly road fuel prices',text,re.I) or not re.search(r'Updates to this page',text,re.I) or not release_matches:
            raise ValueError('unrecognized DESNZ weekly fuel release page structure')
        for m in release_matches:
            # The update-history date after the notice is its publication date;
            # the week-commencing date describes the data, not the release.
            d=_date(m.group(1))
            # The update history is evidence that this release has been published.
            # A release dated today is not an upcoming event either.
            if d and d>today.isoformat(): found.append(event('desnz:fuel:'+d,'Weekly road fuel prices',d,None,'published',source,INDICATORS[source],SOURCES[source][1]))
    return found

def _parse_obr(body,today):
    html=body.decode('utf-8','replace')
    blocks=re.findall(r'<div\b[^>]*class=["\'][^"\']*\bblock-pubs-footer\b[^"\']*["\'][^>]*>(.*?)</div\s*>',html,re.I|re.S)
    if not blocks: raise ValueError('unrecognized OBR publication card structure')
    forecasts=[]
    for block in blocks:
        title=re.search(r'<h4\b[^>]*>\s*<a\b[^>]*>(.*?)</a>',block,re.I|re.S)
        if title and re.search(r'Economic\s+and\s+fiscal\s+outlook',_text(title.group(1).encode()),re.I):
            forecasts.append(_text(block.encode()))
    if len(forecasts)!=1 or not re.search(r'Next release\s*:',forecasts[0],re.I):
        raise ValueError('unrecognized OBR forecast release structure')
    match=re.search(r'Next release\s*:\s*(\d{1,2}\s+(?:'+'|'.join(MONTH)+r')\s+20\d{2})\b',forecasts[0],re.I)
    if not match:
        next_release=re.search(r'Next release\s*:\s*([^,;]+)',forecasts[0],re.I)
        if not next_release or not re.fullmatch(r'(?:TBC|to be confirmed|to be announced|(?:winter|spring|summer|autumn)\s+20\d{2}(?:[-/]\d{2,4})?|20\d{2})',next_release.group(1).strip(),re.I):
            raise ValueError('unrecognized OBR next-release date value')
        return []
    d=_date(match.group(1))
    if d<today.isoformat(): return []
    return [event('obr:efo','OBR Economic and fiscal outlook',d,None,'scheduled','obr',INDICATORS['obr'],SOURCES['obr'][0])]

def _parse_hm_treasury(body,today):
    html=body.decode('utf-8','replace')
    heading=re.search(r'<h1\b[^>]*>(.*?)</h1\s*>',html,re.I|re.S)
    if (not re.search(r'<main\b',html,re.I) or not heading
            or not re.search(r'Budget\s+2026\s+date',_text(heading.group(1).encode()),re.I)
            or not re.search(r'class=["\'][^"\']*\bgovspeak\b',html,re.I)):
        raise ValueError('unrecognized HM Treasury budget announcement structure')
    text=_text(body)
    match=re.search(r'\bThe\s+Budget\s+will\s+be\s+held\s+on\s+(\d{1,2}\s+(?:'+'|'.join(MONTH)+r')\s+20\d{2})\b',text,re.I)
    if not match:
        if re.search(r'\bBudget\s+date\s+has\s+not\s+been\s+announced\b',text,re.I): return []
        raise ValueError('unrecognized HM Treasury explicit Budget date')
    d=_date(match.group(1))
    if d<today.isoformat(): return []
    return [event('hm_treasury:budget','HM Treasury Budget',d,None,'scheduled','hm_treasury',INDICATORS['hm_treasury'],SOURCES['hm_treasury'][0])]

def _parse_ofgem(body,today):
    html=body.decode('utf-8','replace')
    heading=re.search(r'<h1\b[^>]*>(.*?)</h1\s*>',html,re.I|re.S)
    section=re.search(r'<h[2-4]\b[^>]*>\s*Energy\s+price\s+cap\s+level\s+dates\s*</h[2-4]\s*>',html,re.I)
    if (not heading or not re.search(r'Changes\s+to\s+energy\s+price\s+cap',_text(heading.group(1).encode()),re.I)
            or not section):
        raise ValueError('unrecognized Ofgem price-cap announcement structure')
    text=_text(body)
    anchor=re.search(r'Energy\s+price\s+cap\s+level\s+dates.*?levels\s+for\s+the\s+next\s+periods\s+will\s+be\s+announced\s+by\s*:\s*(.*?)(?:We\s+may\s+publish\s+before\s+these\s+dates|$)',text,re.I)
    if not anchor: raise ValueError('unrecognized Ofgem announcement date context')
    pattern=r'(\d{1,2}\s+(?:'+'|'.join(MONTH)+r')\s+20\d{2})\s*[–—-]\s*period\s+(\d{1,2}\s+(?:'+'|'.join(MONTH)+r')\s+20\d{2})\s+to\s+(\d{1,2}\s+(?:'+'|'.join(MONTH)+r')\s+20\d{2})'
    matches=list(re.finditer(pattern,anchor.group(1),re.I))
    if not matches and re.sub(r'\s+',' ',anchor.group(1)).strip():
        raise ValueError('unrecognized Ofgem price-cap date rows')
    found=[]
    for match in matches:
        announcement=_date(match.group(1)); start=_date(match.group(2)); end=_date(match.group(3))
        if announcement>=today.isoformat():
            found.append(event('ofgem:price-cap:'+start, f'Ofgem price cap announcement for {start} to {end}', announcement,None,'scheduled','ofgem_energy',INDICATORS['ofgem_energy'],SOURCES['ofgem_energy'][0]))
    return found

def _paths(state):
    root=Path(state); return root/'events.json',root/'events-raw'

def _source_url(name,local):
    template=SOURCES[name][0]
    return template.format(today=local.isoformat(),year=(local+timedelta(days=365)).isoformat()) if '{' in template else template

def collect_events(state,clock=None,fetch=_fetch,fixtures=None):
    """Read one official bounded endpoint/provider; retain last verified events on failure."""
    now=(clock or (lambda:datetime.now(timezone.utc)))()
    if now.tzinfo is None: raise ValueError('timezone-aware collection time required')
    local=now.astimezone(LONDON).date(); state=Path(state); state.mkdir(parents=True,exist_ok=True,mode=0o700)
    state_file,raw_dir=_paths(state)
    if state_file.exists():
        saved=json.loads(state_file.read_text())
        if (not isinstance(saved,dict) or saved.get('schema_version')!=1
                or not isinstance(saved.get('providers'),dict)
                or not isinstance(saved.get('attempts'),list)
                or not isinstance(saved.get('revisions'),list)):
            raise ValueError('invalid private event state')
    else: saved={'schema_version':1,'providers':{},'attempts':[],'revisions':[]}
    failed=[]
    unqualified=[]
    for name,(template,source_url) in SOURCES.items():
        url=template
        try:
            url=_source_url(name,local)
            if fixtures:
                candidate=Path(fixtures)/('events_case_'+name+'.json')
                if not candidate.exists(): candidate=Path(fixtures)/('events_case_'+name+'.html')
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
            qualified=name not in UNQUALIFIED_SOURCES
            if not qualified: unqualified.append(name)
            saved['providers'][name]={'status':'ok' if qualified else 'unqualified','qualification':'qualified' if qualified else 'unqualified','retrieved_at':timestamp(now),'source_url':url,'calendar_url':source_url,'sha256':digest,'evidence_kind':kind,'events':events}
            if qualified: saved['providers'][name]['unknown_dates']=not bool(events)
            saved['attempts'].append({'provider':name,'at':timestamp(now),'status':'ok' if qualified else 'unqualified','source_url':url,'sha256':digest,'evidence_kind':kind})
        except Exception as exc:
            failed.append(name); old=saved['providers'].get(name,{})
            had_success=old.get('evidence_kind')=='official_download' and old.get('retrieved_at')
            old.update(status='stale' if had_success else 'unavailable',
                       qualification='unqualified' if name in UNQUALIFIED_SOURCES else 'qualified',
                       events=old.get('events',[]),
                       source_url=old.get('source_url',url),calendar_url=old.get('calendar_url',source_url),
                       last_failure_at=timestamp(now),last_error=type(exc).__name__)
            saved['providers'][name]=old
            saved['attempts'].append({'provider':name,'at':timestamp(now),'status':'failed','source_url':url,'error_type':type(exc).__name__,'evidence_kind':'recorded_fixture' if fixtures else 'official_download'})
    saved['checked_at']=timestamp(now); saved['mode']='fixtures' if fixtures else 'official'
    atomic_write(state_file,encode(saved))
    return {'failed_sources':failed,'unqualified_sources':unqualified,'schedule':saved}

def public_events(state):
    """Project safe public event feed; reject any fixture-derived provider."""
    source=Path(state)/'events.json'
    if not source.exists(): return None
    data=json.loads(source.read_text())
    if (not isinstance(data,dict) or data.get('schema_version')!=1
            or not isinstance(data.get('providers'),dict)
            or not isinstance(data.get('checked_at'),str)):
        raise ValueError('invalid private event state')
    providers={}
    for name,p in data['providers'].items():
        if name not in SOURCES or not isinstance(p,dict): raise ValueError('unknown event provider')
        if p.get('evidence_kind')=='recorded_fixture': raise ValueError('fixture events cannot be published as official')
        if p.get('qualification') not in {'qualified','unqualified'}:
            raise ValueError('invalid provider qualification')
        if p.get('status') not in {'ok','stale','unavailable','unqualified'}:
            raise ValueError('invalid provider status')
        if p.get('status')=='unqualified':
            if p.get('qualification')!='unqualified' or p.get('events'):
                raise ValueError('invalid unqualified provider')
        elif p.get('qualification')!='qualified':
            raise ValueError('qualified provider status mismatch')
        elif p.get('status')=='unavailable':
            if p.get('events'): raise ValueError('unavailable provider cannot contain events')
        elif p.get('evidence_kind')!='official_download': raise ValueError('event evidence kind is missing')
        if p.get('source_url') and not _provider_url_valid(name,p['source_url']):
            raise ValueError('event provider URL is outside the bounded source path')
        if p.get('calendar_url') and p['calendar_url']!=SOURCES[name][1]:
            raise ValueError('event calendar URL is outside the bounded source path')
        events=p.get('events',[])
        for e in events:
            if (not isinstance(e,dict) or e.get('source')!=name or not isinstance(e.get('id'),str)
                    or not isinstance(e.get('title'),str) or not e['title'] or len(e['title'])>240):
                raise ValueError('invalid event identity')
            if e.get('status') not in {'scheduled','rescheduled','cancelled','published'}: raise ValueError('invalid event status')
            date.fromisoformat(e['date'])
            if e.get('time') is not None:
                instant=datetime.fromisoformat(e['time'])
                if (instant.tzinfo is None or instant.utcoffset() is None
                        or instant.astimezone(LONDON).date().isoformat()!=e['date']
                        or e.get('time_precision')!='minute'):
                    raise ValueError('invalid event time')
            elif e.get('time_precision')!='date':
                raise ValueError('invalid date-only event precision')
            if name=='ons':
                expected=_ons_indicators(e.get('title',''))
                if not expected or e.get('linked_indicators')!=expected: raise ValueError('invalid ONS indicator links')
                event_url=urlsplit(e.get('source_url',''))
                if (event_url.scheme!='https' or event_url.hostname!='www.ons.gov.uk'
                        or not re.fullmatch(r'/releases/[a-zA-Z0-9/_-]+',event_url.path)
                        or e['id']!='ons:'+event_url.path):
                    raise ValueError('invalid ONS release URL')
            else:
                if e.get('linked_indicators')!=INDICATORS[name] or e.get('source_url')!=SOURCES[name][0]:
                    raise ValueError('invalid event provenance')
        providers[name]={k:p.get(k) for k in ('status','qualification','retrieved_at','source_url','calendar_url','sha256','events','unknown_dates','last_failure_at') if k in p}
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

def prune_event_generations(root,retain_days=14):
    """Prune old immutable public event payloads while preserving active and unknown files."""
    root=Path(root); directory=root/'event-generations'; manifest_path=root/'events-manifest.json'
    if directory.is_symlink() or not directory.is_dir() or not manifest_path.is_file() or manifest_path.is_symlink():
        return
    try:
        manifest=json.loads(manifest_path.read_text())
        digest=manifest['sha256']; relative=manifest['data_url']
        if not re.fullmatch(r'[a-f0-9]{64}',digest) or relative!=f'event-generations/{digest}.json':
            return
    except (OSError,ValueError,KeyError,TypeError):
        return
    cutoff=datetime.now(timezone.utc).timestamp()-retain_days*86400
    for candidate in directory.iterdir():
        if (candidate.is_symlink() or not candidate.is_file()
                or not re.fullmatch(r'[a-f0-9]{64}\.json',candidate.name)
                or candidate.name==f'{digest}.json'):
            continue
        try:
            if candidate.stat().st_mtime<cutoff: candidate.unlink()
        except OSError:
            continue
