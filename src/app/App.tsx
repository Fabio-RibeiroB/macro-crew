import { useState, useEffect } from 'react';
import { Activity, RefreshCw, AlertCircle } from 'lucide-react';
import { EconomicIndicatorCard } from '@/app/components/EconomicIndicatorCard';
import { ReportSummaryCard } from '@/app/components/ReportSummaryCard';
import { Button } from '@/app/components/ui/button';

interface EconomicData {
  current_economic_indicators: {
    interest_rate: {
      value: string;
      publication_date: string;
      next_publication_date: string;
      source: string;
    };
    cpih_mom: {
      value: string;
      publication_date: string;
      next_publication_date: string;
      source: string;
    };
    gdp_mom: {
      value: string;
      publication_date: string;
      next_publication_date: string;
      source: string;
    };
  };
  current_report_summaries: {
    monetary_policy_report: {
      summary: string;
      report_date: string;
      next_publication_date: string;
      source: string;
    };
    financial_stability_report: {
      summary: string;
      report_date: string;
      next_publication_date: string;
      source: string;
    };
  };
  metadata: {
    generated_at: string;
    last_updated: string;
  };
}

export default function App() {
  const [data, setData] = useState<EconomicData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const response = await fetch('/research_report.json');
      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.statusText}`);
      }
      const jsonData = await response.json();
      setData(jsonData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      console.error('Error loading research report:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading economic data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to Load Data</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={handleRefresh} className="flex items-center gap-2 mx-auto">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const indicators = [
    {
      key: 'interest_rate',
      title: 'Bank of England Interest Rate',
      ...data.current_economic_indicators.interest_rate
    },
    {
      key: 'cpih_mom',
      title: 'CPIH Inflation (Month-on-Month)',
      ...data.current_economic_indicators.cpih_mom
    },
    {
      key: 'gdp_mom',
      title: 'GDP Growth (Month-on-Month)',
      ...data.current_economic_indicators.gdp_mom
    }
  ];

  const reports = [
    {
      key: 'monetary_policy',
      title: 'Monetary Policy Report',
      ...data.current_report_summaries.monetary_policy_report
    },
    {
      key: 'financial_stability',
      title: 'Financial Stability Report',
      ...data.current_report_summaries.financial_stability_report
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-3 rounded-lg">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  UK Economic Dashboard
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Last updated: {formatDateTime(data.metadata.last_updated)}
                </p>
              </div>
            </div>
            
            <Button 
              onClick={handleRefresh} 
              disabled={isRefreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Economic Indicators Section */}
        <div className="mb-10">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Current Economic Indicators
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {indicators.map((indicator) => (
              <EconomicIndicatorCard
                key={indicator.key}
                title={indicator.title}
                value={indicator.value}
                publicationDate={indicator.publication_date}
                nextPublicationDate={indicator.next_publication_date}
                source={indicator.source}
              />
            ))}
          </div>
        </div>

        {/* Report Summaries Section */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Latest Report Summaries
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {reports.map((report) => (
              <ReportSummaryCard
                key={report.key}
                title={report.title}
                summary={report.summary}
                reportDate={report.report_date}
                nextPublicationDate={report.next_publication_date}
                source={report.source}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
