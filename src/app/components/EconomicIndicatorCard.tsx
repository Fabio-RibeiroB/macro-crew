import { ArrowUpRight, ArrowDownRight, Minus, ExternalLink, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { useState } from 'react';

// positive-is-good: GDP (growth is good)
// positive-is-bad:  CPIH (rising inflation is bad)
// neutral:          Interest rate (it's a level, not a directional signal)
type SentimentMode = 'positive-is-good' | 'positive-is-bad' | 'neutral';

interface EconomicIndicatorCardProps {
  label: string;
  title: string;
  description: string;
  measurement: string;
  value: string;
  previousValue?: string;
  previousLabel?: string;
  publicationDate: string;
  nextPublicationDate: string;
  source: string;
  sentimentMode?: SentimentMode;
  contextBadge?: string;
}

export function EconomicIndicatorCard({
  label, title, description, measurement, value,
  previousValue, previousLabel,
  publicationDate, nextPublicationDate, source,
  sentimentMode = 'positive-is-good',
  contextBadge,
}: EconomicIndicatorCardProps) {
  const [showInfo, setShowInfo] = useState(false);

  const numericValue = parseFloat(value?.replace('%', '') ?? '');
  const isPositive = !isNaN(numericValue) && numericValue > 0;
  const isNegative = !isNaN(numericValue) && numericValue < 0;

  // Determine semantic "good/bad" based on sentiment mode
  const isGood = sentimentMode === 'neutral'
    ? false
    : sentimentMode === 'positive-is-good'
      ? isPositive
      : isNegative; // positive-is-bad: negative direction is "good"

  const isBad = sentimentMode === 'neutral'
    ? false
    : sentimentMode === 'positive-is-good'
      ? isNegative
      : isPositive;

  const valueColor = sentimentMode === 'neutral'
    ? 'var(--dash-text-1)'
    : isGood
      ? 'var(--dash-positive)'
      : isBad
        ? 'var(--dash-negative)'
        : 'var(--dash-text-1)';

  const accentColor = sentimentMode === 'neutral'
    ? 'var(--dash-blue)'
    : isGood
      ? 'var(--dash-positive)'
      : isBad
        ? 'var(--dash-negative)'
        : 'var(--dash-blue)';

  // Delta vs previous period
  const numericPrev = previousValue ? parseFloat(previousValue.replace('%', '')) : NaN;
  const delta = !isNaN(numericValue) && !isNaN(numericPrev) ? numericValue - numericPrev : null;
  const deltaGood = delta === null ? null
    : sentimentMode === 'neutral' ? null
    : sentimentMode === 'positive-is-good' ? delta > 0
    : delta < 0; // positive-is-bad: falling is good

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'not available') return 'TBC';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'TBC';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const daysAgo = (dateStr: string) => {
    if (!dateStr || dateStr === 'not available') return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const diff = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'today';
    if (diff === 1) return '1 day ago';
    return `${diff} days ago`;
  };

  const pubAgo = daysAgo(publicationDate);

  return (
    <div
      className="relative flex flex-col rounded-xl border overflow-hidden transition-colors duration-200"
      style={{ background: 'var(--dash-card)', borderColor: 'var(--dash-border)' }}
    >
      <div className="h-1 w-full" style={{ background: accentColor }} />

      <div className="p-6 flex flex-col flex-1 gap-3">
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--dash-tag-bg)', color: 'var(--dash-tag-text)' }}
          >
            {label}
          </span>
          <div className="flex items-center gap-2">
            {sentimentMode !== 'neutral' && isPositive && <ArrowUpRight className="h-4 w-4" style={{ color: isBad ? 'var(--dash-negative)' : 'var(--dash-positive)' }} />}
            {sentimentMode !== 'neutral' && isNegative && <ArrowDownRight className="h-4 w-4" style={{ color: isGood ? 'var(--dash-positive)' : 'var(--dash-negative)' }} />}
            {(sentimentMode === 'neutral' || (!isPositive && !isNegative)) && <Minus className="h-4 w-4" style={{ color: 'var(--dash-blue)' }} />}
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="transition-colors"
              style={{ color: showInfo ? 'var(--dash-blue)' : 'var(--dash-text-4)' }}
              aria-label="More information"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showInfo && (
          <div
            className="p-3 rounded-lg text-xs leading-relaxed border"
            style={{ background: 'var(--dash-bg)', color: 'var(--dash-text-3)', borderColor: 'var(--dash-border)' }}
          >
            {description}
          </div>
        )}

        <div
          className="text-5xl font-bold leading-none tracking-tight"
          style={{ color: valueColor, fontFamily: "'JetBrains Mono', monospace" }}
        >
          {value}
        </div>

        {/* Delta vs previous period */}
        {delta !== null && previousLabel && (
          <div className="flex items-center gap-1.5">
            {deltaGood === true && <TrendingDown className="h-3.5 w-3.5" style={{ color: 'var(--dash-positive)' }} />}
            {deltaGood === false && <TrendingUp className="h-3.5 w-3.5" style={{ color: 'var(--dash-negative)' }} />}
            {deltaGood === null && (delta > 0
              ? <TrendingUp className="h-3.5 w-3.5" style={{ color: 'var(--dash-text-4)' }} />
              : <TrendingDown className="h-3.5 w-3.5" style={{ color: 'var(--dash-text-4)' }} />
            )}
            <span
              className="text-xs"
              style={{
                color: deltaGood === true
                  ? 'var(--dash-positive)'
                  : deltaGood === false
                    ? 'var(--dash-negative)'
                    : 'var(--dash-text-4)'
              }}
            >
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}% vs {previousLabel}
            </span>
          </div>
        )}

        {/* Context badge */}
        {contextBadge && (
          <span
            className="inline-block self-start text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'var(--dash-border)', color: 'var(--dash-text-3)' }}
          >
            {contextBadge}
          </span>
        )}

        <p className="text-xs" style={{ color: 'var(--dash-text-4)' }}>{measurement}</p>
        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--dash-text-2)' }}>{title}</p>

        <div className="mt-auto pt-4 border-t space-y-2" style={{ borderColor: 'var(--dash-border)' }}>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--dash-text-4)' }}>Published</span>
            <span style={{ color: 'var(--dash-text-3)' }}>
              {formatDate(publicationDate)}
              {pubAgo && <span style={{ color: 'var(--dash-text-4)' }} className="ml-1">({pubAgo})</span>}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--dash-text-4)' }}>Next release</span>
            <span className="font-medium" style={{ color: 'var(--dash-blue)' }}>{formatDate(nextPublicationDate)}</span>
          </div>
        </div>

        <a
          href={source}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs transition-colors mt-1"
          style={{ color: 'var(--dash-text-4)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--dash-blue)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--dash-text-4)')}
        >
          <ExternalLink className="h-3 w-3" />
          View source data
        </a>
      </div>
    </div>
  );
}
