# Product Overview

UK Macro Crew is a multi-agent AI system built with CrewAI that automates the collection and reporting of UK macroeconomic data. The system uses two specialized agents:

- **Researcher Agent**: Searches for and retrieves key UK economic indicators (Interest Rates, CPIH inflation, GDP) and central bank report summaries from authoritative sources
- **Reporting Analyst Agent**: Updates and maintains a chronological JSON report with the collected economic data

The system focuses on UK macroeconomic data including:
- Interest Rates
- CPIH (Consumer Price Index including Housing) month-over-month changes
- GDP monthly changes  
- Monetary Policy Report summaries
- Financial Stability Report summaries

The output is a structured JSON report that tracks these indicators over time, with data points tagged by month in MM-YY format. The system automatically searches for the latest available data and either updates existing entries or appends new data points to maintain a chronological record.