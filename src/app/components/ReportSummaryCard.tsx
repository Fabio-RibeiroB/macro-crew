import { FileText, Calendar, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';

interface ReportSummaryCardProps {
  title: string;
  summary: string;
  reportDate: string;
  nextPublicationDate: string;
  source: string;
}

export function ReportSummaryCard({
  title,
  summary,
  reportDate,
  nextPublicationDate,
  source,
}: ReportSummaryCardProps) {
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
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <FileText className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
            <div className="flex-1">
              <CardTitle className="text-lg mb-2">{title}</CardTitle>
              <CardDescription className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5" />
                Report Date: {formatDate(reportDate)}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-700 leading-relaxed mb-4">
          {summary}
        </p>
        
        <div className="flex items-center justify-between gap-4 pt-3 border-t">
          <Badge variant="secondary" className="text-xs">
            Next Report: {formatDate(nextPublicationDate)}
          </Badge>
          
          <a 
            href={source} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="text-xs">Read Full Report</span>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
