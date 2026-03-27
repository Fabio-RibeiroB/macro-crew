import { ExternalLink, CalendarClock } from 'lucide-react';

interface PublicationItem {
  id: string;
  title: string;
  nextPublicationDate: string;
  source: string;
  category: 'Indicator' | 'Report';
}

const PLACEHOLDER = 'not available';
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): Date | null {
  if (!value || value === PLACEHOLDER) return null;

  const dateOnlyMatch = value.match(DATE_ONLY_PATTERN);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: string): string {
  const parsed = parseDate(value);
  if (!parsed) return 'TBC';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(value: string): number | null {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function countdownLabel(days: number | null): string {
  if (days === null) return 'TBC';
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function dotColor(days: number | null): string {
  if (days === null || days < 0) return 'var(--dash-border)';
  if (days <= 7) return 'var(--dash-negative)';
  if (days <= 30) return 'var(--dash-warning)';
  return 'var(--dash-positive)';
}

function countdownColor(days: number | null): string {
  if (days === null || days < 0) return 'var(--dash-text-4)';
  if (days <= 7) return 'var(--dash-negative)';
  if (days <= 30) return 'var(--dash-warning)';
  return 'var(--dash-positive)';
}

export function PublicationCalendarCard({ items }: { items: PublicationItem[] }) {
  const orderedItems = [...items]
    .filter((item) => {
      const days = daysUntil(item.nextPublicationDate);
      return days === null || days >= 0;
    })
    .sort((a, b) => {
    const aDate = parseDate(a.nextPublicationDate);
    const bDate = parseDate(b.nextPublicationDate);
    if (aDate && bDate) return aDate.getTime() - bDate.getTime();
    return aDate ? -1 : bDate ? 1 : a.title.localeCompare(b.title);
    });

  return (
    <div
      className="rounded-xl border overflow-hidden h-full flex flex-col transition-colors duration-200"
      style={{ background: 'var(--dash-card)', borderColor: 'var(--dash-border)' }}
    >
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--dash-border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <CalendarClock className="h-4 w-4" style={{ color: 'var(--dash-blue)' }} />
          <h3 className="text-base font-semibold" style={{ color: 'var(--dash-text-1)' }}>Coming Up</h3>
        </div>
        <p className="text-xs" style={{ color: 'var(--dash-text-4)' }}>When the next official data releases are due</p>
      </div>

      <div className="flex-1 divide-y" style={{ borderColor: 'var(--dash-border)' }}>
        {orderedItems.length === 0 && (
          <p className="px-5 py-4 text-sm" style={{ color: 'var(--dash-text-4)' }}>
            No upcoming publications scheduled.
          </p>
        )}
        {orderedItems.map((item) => {
          const days = daysUntil(item.nextPublicationDate);
          return (
            <div
              key={item.id}
              className="px-5 py-4 transition-colors duration-150"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--dash-card-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor(days) }} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug" style={{ color: 'var(--dash-text-2)' }}>{item.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--dash-text-4)' }}>{formatDate(item.nextPublicationDate)}</p>
                    <span
                      className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--dash-border)', color: 'var(--dash-text-4)' }}
                    >
                      {item.category}
                    </span>
                  </div>
                </div>
                <span className="flex-shrink-0 text-sm font-semibold" style={{ color: countdownColor(days) }}>
                  {countdownLabel(days)}
                </span>
              </div>

              <a
                href={item.source}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs transition-colors mt-2.5"
                style={{ color: 'var(--dash-text-4)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--dash-blue)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--dash-text-4)')}
              >
                <ExternalLink className="h-3 w-3" />
                Source
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
