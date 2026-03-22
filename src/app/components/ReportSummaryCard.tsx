import { ExternalLink } from 'lucide-react';

interface ReportSummaryCardProps {
  tag: string;
  title: string;
  description: string;
  summary: string;
  reportDate: string;
  nextPublicationDate: string;
  source: string;
}

export function ReportSummaryCard({ tag, title, description, summary, reportDate, nextPublicationDate, source }: ReportSummaryCardProps) {
  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'not available') return 'TBC';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'TBC';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div
      className="rounded-xl border overflow-hidden transition-colors duration-200"
      style={{ background: 'var(--dash-card)', borderColor: 'var(--dash-border)' }}
    >
      <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--dash-border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <span
              className="inline-block text-xs font-medium px-2.5 py-1 rounded-full mb-3"
              style={{ background: 'var(--dash-tag-bg)', color: 'var(--dash-tag-text)' }}
            >
              {tag}
            </span>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--dash-text-1)' }}>{title}</h3>
            <p className="text-xs" style={{ color: 'var(--dash-text-4)' }}>{description}</p>
          </div>
          <a
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors mt-1"
            style={{ color: 'var(--dash-blue)', borderColor: 'var(--dash-border)', background: 'transparent' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--dash-blue-bg)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Full report
          </a>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--dash-text-4)' }}>Published {formatDate(reportDate)}</p>
      </div>

      <div className="px-6 py-5">
        <p
          className="text-sm leading-relaxed"
          style={{ fontFamily: "'Source Serif 4', Georgia, serif", lineHeight: '1.8', color: 'var(--dash-text-2)' }}
        >
          {summary}
        </p>
      </div>

      <div className="px-6 py-3 border-t flex items-center gap-2 text-xs" style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-bg)' }}>
        <span style={{ color: 'var(--dash-text-4)' }}>Next publication:</span>
        <span className="font-medium" style={{ color: 'var(--dash-warning)' }}>{formatDate(nextPublicationDate)}</span>
      </div>
    </div>
  );
}
