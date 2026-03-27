import { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, Sun, Moon } from 'lucide-react';
import { EconomicIndicatorCard } from '@/app/components/EconomicIndicatorCard';
import { ReportSummaryCard } from '@/app/components/ReportSummaryCard';
import { HistoricalTrendCard } from '@/app/components/HistoricalTrendCard';
import { PublicationCalendarCard } from '@/app/components/PublicationCalendarCard';
import { PlainEnglishSection } from '@/app/components/PlainEnglishSection';

interface EconomicData {
  current_economic_indicators: {
    interest_rate: { value: string; publication_date: string; next_publication_date: string; source: string };
    cpih: { value: string; publication_date: string; next_publication_date: string; source: string };
    gdp: { value: string; publication_date: string; next_publication_date: string; source: string };
  };
  current_report_summaries: {
    monetary_policy_report: { summary: string; report_date: string; next_publication_date: string; source: string };
    financial_stability_report: { summary: string; report_date: string; next_publication_date: string; source: string };
  };
  metadata: { generated_at: string; last_updated: string };
  plain_english_context?: {
    overall_summary?: string;
    interest_rate?: string;
    cpih?: string;
    gdp?: string;
  };
}

interface HistoryData {
  history: {
    economic_indicators: {
      interest_rate: Array<{ value: string; publication_date: string }>;
      cpih: Array<{ value: string; publication_date: string }>;
      gdp: Array<{ value: string; publication_date: string }>;
    };
  };
}

export default function App() {
  const [data, setData] = useState<EconomicData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored ? stored === 'dark' : true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const loadData = async () => {
    try {
      const cacheBuster = Date.now();
      const snapshotUrl = `${import.meta.env.BASE_URL}research_report.json?v=${cacheBuster}`;
      const historyUrl = `${import.meta.env.BASE_URL}history_report.json?v=${cacheBuster}`;

      void fetch(historyUrl, { cache: 'no-store' })
        .then(async (res) => {
          const ct = res.headers.get('content-type') ?? '';
          if (res.ok && ct.includes('application/json')) {
            setHistoryData((await res.json()) as HistoryData);
          } else {
            setHistoryData(null);
          }
        })
        .catch((err) => { console.warn('History unavailable:', err); setHistoryData(null); });

      const snapshotResponse = await fetch(snapshotUrl, { cache: 'no-store' });
      if (!snapshotResponse.ok) throw new Error(`Failed to load data: ${snapshotResponse.statusText}`);
      const ct = snapshotResponse.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) throw new Error(`Expected JSON but got ${ct || 'unknown'}`);
      setData((await snapshotResponse.json()) as EconomicData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dash-bg)' }}>
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-[var(--dash-blue)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm" style={{ color: 'var(--dash-text-3)' }}>Loading economic data…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dash-bg)' }}>
        <div className="text-center max-w-sm mx-auto p-8 rounded-xl border" style={{ background: 'var(--dash-card)', borderColor: 'var(--dash-border)' }}>
          <AlertCircle className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--dash-negative)' }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--dash-text-1)' }}>Couldn't load data</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--dash-text-3)' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 text-sm px-5 py-2.5 rounded-lg border transition-colors"
            style={{ color: 'var(--dash-blue)', borderColor: 'var(--dash-blue)', background: 'var(--dash-blue-bg)' }}
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      </div>
    );
  }

  const toTrendPoints = (entries: Array<{ value: string; publication_date: string }> | undefined) => {
    if (!entries) return [];
    return entries
      .map((e) => ({ date: e.publication_date, value: Number(e.value.replace('%', '')) }))
      .filter((p) => Number.isFinite(p.value));
  };

  // Returns { previousValue, previousLabel } for a given indicator from history
  const getPrevious = (key: 'interest_rate' | 'cpih' | 'gdp') => {
    const entries = historyData?.history?.economic_indicators?.[key];
    if (!entries || entries.length < 2) return { previousValue: undefined, previousLabel: undefined };
    const sorted = [...entries].sort((a, b) => a.publication_date.localeCompare(b.publication_date));
    const prev = sorted[sorted.length - 2];
    const d = new Date(prev.publication_date);
    const label = isNaN(d.getTime()) ? prev.publication_date : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    return { previousValue: prev.value, previousLabel: label };
  };

  // Returns a context badge string based on historical position
  const getContextBadge = (key: 'interest_rate' | 'cpih' | 'gdp', currentVal: string, extraBadge?: string): string | undefined => {
    if (extraBadge) return extraBadge;
    const entries = historyData?.history?.economic_indicators?.[key];
    if (!entries || entries.length < 3) return undefined;
    const current = parseFloat(currentVal.replace('%', ''));
    if (!Number.isFinite(current)) return undefined;
    const sorted = [...entries].sort((a, b) => a.publication_date.localeCompare(b.publication_date));
    const history = sorted.slice(0, -1); // exclude current
    const prevHigher = [...history].reverse().find(e => parseFloat(e.value.replace('%', '')) > current);
    const prevLower = [...history].reverse().find(e => parseFloat(e.value.replace('%', '')) < current);
    // "Highest in 5Y" if nothing higher found in history
    const allVals = history.map(e => parseFloat(e.value.replace('%', ''))).filter(Number.isFinite);
    if (allVals.length === 0) return undefined;
    if (current >= Math.max(...allVals)) return 'Highest in 5 years';
    if (current <= Math.min(...allVals)) return 'Lowest in 5 years';
    if (!prevHigher) return undefined;
    const d = new Date(prevHigher.publication_date);
    const monthLabel = isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    return monthLabel ? `Last higher: ${monthLabel}` : undefined;
  };

  const cpihNum = parseFloat(data.current_economic_indicators.cpih.value.replace('%', ''));
  const cpihBadge = Number.isFinite(cpihNum) && cpihNum > 2 ? 'Above 2% target' : Number.isFinite(cpihNum) ? 'At or below 2% target' : undefined;

  const indicators = [
    {
      key: 'interest_rate' as const, label: 'Bank Rate', title: 'Bank of England Base Rate',
      description: 'The interest rate set by the Bank of England. It directly influences mortgage rates, savings rates, and the cost of borrowing across the UK.',
      measurement: 'Current rate',
      sentimentMode: 'neutral' as const,
      contextBadge: getContextBadge('interest_rate', data.current_economic_indicators.interest_rate.value),
      ...getPrevious('interest_rate'),
      ...data.current_economic_indicators.interest_rate,
    },
    {
      key: 'cpih' as const, label: 'CPIH', title: 'Inflation — Year on Year',
      description: 'How much prices have risen over the past 12 months, measured by the Consumer Price Index including Housing costs. This is the headline inflation figure you hear about in the news.',
      measurement: 'Year-on-year change',
      sentimentMode: 'positive-is-bad' as const,
      contextBadge: cpihBadge,
      ...getPrevious('cpih'),
      ...data.current_economic_indicators.cpih,
    },
    {
      key: 'gdp' as const, label: 'GDP', title: 'Economic Growth — Monthly',
      description: "The change in the UK's total economic output compared to the previous month. A positive number means the economy grew; negative means it shrank.",
      measurement: 'Month-on-month change',
      sentimentMode: 'positive-is-good' as const,
      contextBadge: getContextBadge('gdp', data.current_economic_indicators.gdp.value),
      ...getPrevious('gdp'),
      ...data.current_economic_indicators.gdp,
    },
  ];

  const reports = [
    {
      key: 'monetary_policy', tag: 'Bank of England', title: 'Monetary Policy Report',
      description: "The Bank of England's assessment of the economy and why they set interest rates where they did.",
      ...data.current_report_summaries.monetary_policy_report,
    },
    {
      key: 'financial_stability', tag: 'Bank of England', title: 'Financial Stability Report',
      description: 'An assessment of risks to the UK financial system — banks, borrowing, and economic vulnerabilities.',
      ...data.current_report_summaries.financial_stability_report,
    },
  ];

  const upcomingPublications = [
    { id: 'interest_rate_next', title: 'Bank of England Interest Rate', nextPublicationDate: data.current_economic_indicators.interest_rate.next_publication_date, source: data.current_economic_indicators.interest_rate.source, category: 'Indicator' as const },
    { id: 'cpih_next', title: 'CPIH Inflation', nextPublicationDate: data.current_economic_indicators.cpih.next_publication_date, source: data.current_economic_indicators.cpih.source, category: 'Indicator' as const },
    { id: 'gdp_next', title: 'GDP Growth', nextPublicationDate: data.current_economic_indicators.gdp.next_publication_date, source: data.current_economic_indicators.gdp.source, category: 'Indicator' as const },
    { id: 'mpr_next', title: 'Monetary Policy Report', nextPublicationDate: data.current_report_summaries.monetary_policy_report.next_publication_date, source: data.current_report_summaries.monetary_policy_report.source, category: 'Report' as const },
    { id: 'fsr_next', title: 'Financial Stability Report', nextPublicationDate: data.current_report_summaries.financial_stability_report.next_publication_date, source: data.current_report_summaries.financial_stability_report.source, category: 'Report' as const },
  ];

  const trendCards = [
    { key: 'interest_rate_trend', label: 'Bank Rate', title: 'Base rate over time', color: '#60a5fa', data: toTrendPoints(historyData?.history?.economic_indicators?.interest_rate), referenceLine: undefined },
    { key: 'cpih_trend', label: 'CPIH Inflation', title: 'Year-on-year inflation over time', color: '#4ade80', data: toTrendPoints(historyData?.history?.economic_indicators?.cpih), referenceLine: { value: 2, label: '2% target' } },
    { key: 'gdp_trend', label: 'GDP Growth', title: 'Monthly economic growth over time', color: '#fb923c', data: toTrendPoints(historyData?.history?.economic_indicators?.gdp), referenceLine: undefined },
  ];

  return (
    <div className="min-h-screen transition-colors duration-200" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text-1)' }}>

      {/* ── Header ── */}
      <header className="border-b sticky top-0 z-10 transition-colors duration-200" style={{ background: 'var(--dash-header)', borderColor: 'var(--dash-border)' }}>
        <div className="h-1" style={{ background: 'var(--dash-header-grad)' }} />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--dash-text-1)' }}>
                UK Economy at a Glance
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--dash-text-4)' }}>
                Data from the Bank of England &amp; ONS · Updated automatically
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs" style={{ color: 'var(--dash-text-4)' }}>Last updated</p>
                <p className="text-sm font-medium" style={{ color: 'var(--dash-text-3)' }}>
                  {formatDateTime(data.metadata.last_updated)}
                </p>
              </div>
              <button
                onClick={() => setIsDark(!isDark)}
                className="p-2 rounded-lg border transition-colors duration-200"
                style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card)', color: 'var(--dash-text-3)' }}
                aria-label="Toggle light/dark mode"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        <section
          className="rounded-2xl border px-5 py-5 sm:px-6 sm:py-6"
          style={{ background: 'var(--dash-section)', borderColor: 'var(--dash-border)' }}
        >
          <div className="max-w-4xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--dash-blue)' }}>
              Quick Read
            </p>
            <p className="text-lg sm:text-xl leading-8" style={{ color: 'var(--dash-text-2)' }}>
              This dashboard tracks the main UK economic releases and explains what changed, when it changed, and what is coming next.
            </p>
            <p className="text-sm sm:text-base leading-7 max-w-3xl" style={{ color: 'var(--dash-text-3)' }}>
              Use the top cards for the latest numbers, the report section for the Bank of England view, and the charts for longer-term trends. Tap <strong style={{ color: 'var(--dash-text-2)' }}>ⓘ</strong> on any indicator card for a short explanation.
            </p>
          </div>
        </section>

        {/* ── Key Indicators ── */}
        <section
          className="rounded-2xl border px-5 py-6 sm:px-6 sm:py-7"
          style={{ background: 'var(--dash-section)', borderColor: 'var(--dash-border)' }}
        >
          <div className="mb-6 pb-4 border-b" style={{ borderColor: 'var(--dash-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--dash-blue)' }}>Section 1</p>
            <h2 className="text-2xl mt-2" style={{ color: 'var(--dash-text-1)' }}>Key Indicators</h2>
            <p className="text-sm sm:text-base mt-2 max-w-2xl leading-7" style={{ color: 'var(--dash-text-3)' }}>
              The three figures most people look for first: interest rates, inflation, and monthly growth.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {indicators.map((ind) => (
              <EconomicIndicatorCard
                key={ind.key}
                label={ind.label}
                title={ind.title}
                description={ind.description}
                measurement={ind.measurement}
                value={ind.value}
                previousValue={ind.previousValue}
                previousLabel={ind.previousLabel}
                sentimentMode={ind.sentimentMode}
                contextBadge={ind.contextBadge}
                publicationDate={ind.publication_date}
                nextPublicationDate={ind.next_publication_date}
                source={ind.source}
              />
            ))}
          </div>
        </section>

        {/* ── Plain English Context ── */}
        {data.plain_english_context && (
          <PlainEnglishSection context={data.plain_english_context} />
        )}

        {/* ── Reports + Calendar ── */}
        <section
          className="rounded-2xl border px-5 py-6 sm:px-6 sm:py-7"
          style={{ background: 'var(--dash-section)', borderColor: 'var(--dash-border)' }}
        >
          <div className="mb-6 pb-4 border-b" style={{ borderColor: 'var(--dash-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--dash-blue)' }}>Section 2</p>
            <h2 className="text-2xl mt-2" style={{ color: 'var(--dash-text-1)' }}>Reports and Upcoming Dates</h2>
            <p className="text-sm sm:text-base mt-2 max-w-2xl leading-7" style={{ color: 'var(--dash-text-3)' }}>
              Read the latest Bank of England summaries on the left and scan the next official releases on the right.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
            <div className="lg:col-span-3 space-y-5">
              {reports.map((r) => (
                <ReportSummaryCard
                  key={r.key}
                  tag={r.tag}
                  title={r.title}
                  description={r.description}
                  summary={r.summary}
                  reportDate={r.report_date}
                  nextPublicationDate={r.next_publication_date}
                  source={r.source}
                />
              ))}
            </div>
            <div className="lg:col-span-2">
              <PublicationCalendarCard items={upcomingPublications} />
            </div>
          </div>
        </section>

        {/* ── Historical Trends ── */}
        <section
          className="rounded-2xl border px-5 py-6 sm:px-6 sm:py-7"
          style={{ background: 'var(--dash-section)', borderColor: 'var(--dash-border)' }}
        >
          <div className="mb-6 pb-4 border-b" style={{ borderColor: 'var(--dash-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--dash-blue)' }}>Section 3</p>
            <h2 className="text-2xl mt-2" style={{ color: 'var(--dash-text-1)' }}>Historical Trends</h2>
            <p className="text-sm sm:text-base mt-2 max-w-2xl leading-7" style={{ color: 'var(--dash-text-3)' }}>
              Use these charts to see whether the latest number is part of a larger move or just a one-off change.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {trendCards.map((t) => (
              <HistoricalTrendCard
                key={t.key}
                label={t.label}
                title={t.title}
                color={t.color}
                data={t.data}
                referenceLine={t.referenceLine}
              />
            ))}
          </div>
        </section>

      </main>

      <footer className="border-t mt-6 transition-colors duration-200" style={{ borderColor: 'var(--dash-border)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-sm" style={{ color: 'var(--dash-text-4)' }}>
            Data sourced from the{' '}
            <a href="https://www.bankofengland.co.uk" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dash-blue)' }} className="hover:underline">Bank of England</a>
            {' '}and the{' '}
            <a href="https://www.ons.gov.uk" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dash-blue)' }} className="hover:underline">Office for National Statistics</a>
          </p>
          <p className="text-sm" style={{ color: 'var(--dash-text-4)' }}>Refreshed automatically on each publication date</p>
        </div>
      </footer>
    </div>
  );
}
