import { CalendarClock, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';

interface PublicationItem {
  id: string;
  title: string;
  nextPublicationDate: string;
  source: string;
  category: 'Indicator' | 'Report';
}

interface PublicationCalendarCardProps {
  items: PublicationItem[];
}

const PLACEHOLDER = 'not available';

function parseDate(value: string): Date | null {
  if (!value || value === PLACEHOLDER) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function formatDate(value: string): string {
  const parsed = parseDate(value);
  if (!parsed) {
    return 'Not available';
  }
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysUntil(value: string): number | null {
  const parsed = parseDate(value);
  if (!parsed) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.round((target.getTime() - today.getTime()) / millisecondsPerDay);
}

export function PublicationCalendarCard({ items }: PublicationCalendarCardProps) {
  const futureItems = items.filter((item) => {
    const days = daysUntil(item.nextPublicationDate);
    return days === null || days >= 0;
  });

  const orderedItems = [...futureItems].sort((left, right) => {
    const leftDate = parseDate(left.nextPublicationDate);
    const rightDate = parseDate(right.nextPublicationDate);

    if (leftDate && rightDate) {
      return leftDate.getTime() - rightDate.getTime();
    }
    if (leftDate) {
      return -1;
    }
    if (rightDate) {
      return 1;
    }
    return left.title.localeCompare(right.title);
  });

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-blue-600" />
          Upcoming Publication Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {orderedItems.length === 0 && (
          <p className="text-sm text-gray-500">No upcoming publications scheduled.</p>
        )}
        {orderedItems.map((item) => {
          const days = daysUntil(item.nextPublicationDate);
          const countdownLabel =
            days === null
              ? 'Date unknown'
              : days < 0
                ? `${Math.abs(days)} day(s) ago`
                : days === 0
                  ? 'Today'
                  : `In ${days} day(s)`;

          return (
            <div key={item.id} className="border rounded-md p-3 bg-white/70">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                <Badge variant="secondary" className="text-xs">
                  {item.category}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-600">
                <span>Next release: {formatDate(item.nextPublicationDate)}</span>
                <Badge variant="outline" className="text-xs">
                  {countdownLabel}
                </Badge>
              </div>
              <a
                href={item.source}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <ExternalLink className="h-3 w-3" />
                Source
              </a>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
