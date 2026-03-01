# Product Overview

UK Macro Crew is a multi-agent AI system built with CrewAI that automates the collection and reporting of UK macroeconomic data. The system uses two specialized agents:

- **Researcher Agent**: Searches for and retrieves key UK economic indicators (Interest Rates, CPIH inflation, GDP) and central bank report summaries from authoritative sources
- **Reporting Analyst Agent**: Updates and maintains a chronological JSON report with the collected economic data

The system focuses on UK macroeconomic data including:
- Interest Rates
- CPIH (Consumer Price Index including Housing) month-over-month changes
- GDP monthly changes  
- Monetary Policy Report summaries (comprehensive paragraph-length analysis)
- Financial Stability Report summaries (comprehensive paragraph-length analysis)

The output is a structured JSON report that tracks these indicators over time, with data points tagged by month in MM-YY format. The system automatically searches for the latest available data and either updates existing entries or appends new data points to maintain a chronological record.

## Report Summary Quality

The system generates comprehensive, substantive summaries for Bank of England reports:

**Monetary Policy Report Summaries:**
- Minimum 3-4 sentences providing detailed analysis
- Covers key policy decisions, inflation outlook, economic growth assessment
- Includes forward-looking guidance and monetary policy stance
- Provides meaningful insights into the Bank's economic assessment

**Financial Stability Report Summaries:**
- Minimum 3-4 sentences covering comprehensive risk assessment
- Addresses banking system resilience and key risk areas
- Covers household debt concerns and commercial real estate issues
- Includes systemic risk assessment and financial stability outlook