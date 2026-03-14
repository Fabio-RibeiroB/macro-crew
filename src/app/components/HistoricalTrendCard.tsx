import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';

interface TrendPoint {
  date: string;
  value: number;
}

type TrendRange = '1Y' | '3Y' | '5Y';

interface HistoricalTrendCardProps {
  title: string;
  unit?: string;
  data: TrendPoint[];
}

const RANGE_OPTIONS: TrendRange[] = ['1Y', '3Y', '5Y'];

function subtractYears(date: Date, years: number) {
  const nextDate = new Date(date);
  nextDate.setFullYear(nextDate.getFullYear() - years);
  return nextDate;
}

export function HistoricalTrendCard({ title, unit = '%', data }: HistoricalTrendCardProps) {
  const [selectedRange, setSelectedRange] = useState<TrendRange>('5Y');

  const latestDate = data.reduce<Date | null>((currentLatest, point) => {
    const pointDate = new Date(point.date);
    if (Number.isNaN(pointDate.getTime())) {
      return currentLatest;
    }
    if (!currentLatest || pointDate > currentLatest) {
      return pointDate;
    }
    return currentLatest;
  }, null);

  const visibleData = data.filter((point) => {
    if (!latestDate) {
      return false;
    }
    const pointDate = new Date(point.date);
    if (Number.isNaN(pointDate.getTime())) {
      return false;
    }

    const years = selectedRange === '1Y' ? 1 : selectedRange === '3Y' ? 3 : 5;
    return pointDate >= subtractYears(latestDate, years);
  });

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {RANGE_OPTIONS.map((range) => (
            <Button
              key={range}
              type="button"
              size="sm"
              variant={selectedRange === range ? 'default' : 'ghost'}
              className="h-8 px-3 text-xs"
              onClick={() => setSelectedRange(range)}
            >
              {range}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {visibleData.length === 0 ? (
          <p className="text-sm text-gray-600">No historical data available yet.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={visibleData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  formatter={(value: number) => [`${value}${unit}`, 'Value']}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
