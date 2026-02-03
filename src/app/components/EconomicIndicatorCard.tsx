import { TrendingUp, TrendingDown, Calendar, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';

interface EconomicIndicatorCardProps {
  title: string;
  value: string;
  publicationDate: string;
  nextPublicationDate: string;
  source: string;
}

export function EconomicIndicatorCard({
  title,
  value,
  publicationDate,
  nextPublicationDate,
  source,
}: EconomicIndicatorCardProps) {
  const isPositive = value.startsWith('+');
  const isNegative = value.startsWith('-');
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
        {isPositive && <TrendingUp className="h-4 w-4 text-green-600" />}
        {isNegative && <TrendingDown className="h-4 w-4 text-red-600" />}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-4">{value}</div>
        
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="h-3.5 w-3.5" />
            <span>Published: {formatDate(publicationDate)}</span>
          </div>
          
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="text-xs">
              Next: {formatDate(nextPublicationDate)}
            </Badge>
          </div>
          
          <a 
            href={source} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors mt-3"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="text-xs">View Source</span>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
