import { TrendingUp, Landmark, BarChart2, Globe } from 'lucide-react';

interface PlainEnglishContext {
  overall_summary?: string;
  interest_rate?: string;
  cpih?: string;
  gdp?: string;
}

interface PlainEnglishSectionProps {
  context: PlainEnglishContext;
}

const cards = [
  { key: 'interest_rate' as const, label: 'Bank Rate', Icon: Landmark, color: 'var(--dash-blue)' },
  { key: 'cpih' as const, label: 'Inflation', Icon: TrendingUp, color: 'var(--dash-negative)' },
  { key: 'gdp' as const, label: 'Growth', Icon: BarChart2, color: 'var(--dash-warning)' },
];

export function PlainEnglishSection({ context }: PlainEnglishSectionProps) {
  if (!context.overall_summary && !context.interest_rate && !context.cpih && !context.gdp) {
    return null;
  }

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--dash-text-1)' }}>What Does This Mean for You?</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--dash-text-4)' }}>Plain-English explanations of what the current numbers mean in everyday life</p>
      </div>

      {/* Overall summary callout */}
      {context.overall_summary && (
        <div
          className="flex gap-3 p-4 rounded-xl border mb-4"
          style={{ background: 'var(--dash-blue-bg)', borderColor: 'var(--dash-blue)', borderWidth: '1px' }}
        >
          <Globe className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--dash-blue)' }} />
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--dash-text-2)', fontFamily: "'Source Serif 4', Georgia, serif", lineHeight: '1.75' }}
          >
            {context.overall_summary}
          </p>
        </div>
      )}

      {/* Per-indicator cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(({ key, label, Icon, color }) => {
          const text = context[key];
          if (!text) return null;
          return (
            <div
              key={key}
              className="rounded-xl border p-5 flex flex-col gap-3 transition-colors duration-200"
              style={{ background: 'var(--dash-card)', borderColor: 'var(--dash-border)' }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color }} />
                </div>
                <span className="text-xs font-semibold" style={{ color: 'var(--dash-text-4)' }}>{label}</span>
              </div>
              <p
                className="text-sm leading-relaxed flex-1"
                style={{ color: 'var(--dash-text-2)', fontFamily: "'Source Serif 4', Georgia, serif", lineHeight: '1.75' }}
              >
                {text}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
