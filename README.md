# UK Macro Crew

UK Macro Crew is a multi-agent AI system built with [crewAI](https://crewai.com) that automates the monthly collection and reporting of UK macroeconomic data. The system uses specialized agents to research and maintain a chronological JSON report of key UK economic indicators.

## Installation

Ensure you have Python >=3.10 <3.14 installed on your system. This project uses [UV](https://docs.astral.sh/uv/) for dependency management and package handling.

First, if you haven't already, install uv:

## What It Does

The system is designed for **monthly execution** to build a comprehensive time-series dataset of UK macroeconomic data including:
- **Interest Rates**: Bank of England base rates
- **CPIH**: Consumer Price Index including Housing (month-over-month changes)
- **GDP**: Gross Domestic Product monthly changes
- **Monetary Policy Report**: Bank of England policy summaries
- **Financial Stability Report**: BoE financial stability summaries

### Final Output: `research_report.json`
The system produces a single, comprehensive JSON file that serves as the **primary deliverable**:
- **Location**: `research_report.json` (in project root)
- **Growth Pattern**: New data is appended monthly, preserving all historical data
- **Structure**: Time-series format with chronological arrays for each indicator
- **Usage**: This file contains the complete economic dataset and grows with each monthly execution

### Agents

- **Researcher Agent**: Searches for and retrieves key UK economic indicators from authoritative sources
- **Reporting Analyst Agent**: Updates and maintains a chronological JSON report with collected data

### Output

The system generates `research_report.json` - a structured JSON file that tracks economic indicators over time, with data points tagged by month in MM-YY format.

```bash
pip install uv
```

Next, navigate to your project directory and install the dependencies:

(Optional) Lock the dependencies and install them by using the CLI command:
```bash
crewai install
```
### Environment Setup

**Add your API keys to the `.env` file:**
```bash
OPENAI_API_KEY=your_openai_api_key_here
EXA_API_KEY=your_exa_api_key_here

# Error Handling & Timeout Configuration
AGENT_MAX_ITERATIONS=8          # Maximum iterations per agent (default: 8)
AGENT_MAX_RETRIES=2            # Maximum retries on failure (default: 2)
AGENT_MAX_EXECUTION_TIME=900   # Timeout per agent in seconds (default: 900 = 15 min)
AGENT_MAX_RPM=150              # Rate limit per agent (default: 150)
CREW_FAIL_FAST=true           # Stop on first error (default: true)
CREW_MAX_RPM=100              # Rate limit for crew (default: 100)
```

The system requires:
- **OpenAI API Key**: For the LLM agents (GPT-4o-mini by default)
- **Exa API Key**: For web search and data retrieval

## Error Handling & Reliability

The system includes robust error handling to prevent infinite loops and timeouts:

### Built-in Safeguards
- **Iteration Limits**: Each agent stops after 8 iterations by default
- **Retry Logic**: Failed operations retry only twice before giving up
- **Execution Timeouts**: Individual agents timeout after 15 minutes
- **Fail-Fast Mode**: System stops immediately on unrecoverable errors
- **Rate Limiting**: Prevents API quota exhaustion

### Configuration Options
```bash
# Restrictive settings (for testing or quick runs)
AGENT_MAX_ITERATIONS=2
AGENT_MAX_RETRIES=1
AGENT_MAX_EXECUTION_TIME=300   # 5 minutes

# Production settings (more resilient)
AGENT_MAX_ITERATIONS=8
AGENT_MAX_RETRIES=2
AGENT_MAX_EXECUTION_TIME=900   # 15 minutes

# Disable fail-fast for partial results
CREW_FAIL_FAST=false
```

### Error Scenarios Handled
- **API Rate Limits**: Automatic rate limiting prevents quota exhaustion
- **Search Failures**: Agents provide partial results rather than complete failure
- **Data Parsing Errors**: Invalid data is skipped, valid data is preserved
- **Network Timeouts**: Individual agent timeouts prevent system hangs
- **Infinite Loops**: Iteration limits prevent runaway processes

## Running the Project

To start the UK macro data collection process:

```bash
# Monthly production run (searches for latest available data)
crewai run

# Alternative entry points for monthly execution
uv run uk_macro_crew
uv run run_crew
```

The system is now simplified to always search for the **latest available data** for each economic indicator. This ensures you always get the most recent UK macroeconomic data without needing to specify timeframes.

This initializes the UK Macro Crew, where the Researcher Agent searches for the latest UK economic data and the Reporting Analyst Agent updates the `research_report.json` file with new findings. If the latest data already exists in the JSON file, it will be updated; otherwise, new data will be appended.

### Additional Commands

```bash
# Run tests
uv run pytest

# Run tests with coverage
uv run pytest --cov=uk_macro_crew

# Train the crew (for model improvement)
uv run train <n_iterations> <filename>

# Replay specific task execution
uv run replay <task_id>
```

## How It Works

The UK Macro Crew consists of two specialized AI agents working together:

### Researcher Agent
- **Role**: UK Macroeconomic Data Researcher
- **Goal**: Find and retrieve the most current UK economic indicators
- **Tools**: Web search capabilities via Exa API
- **Sources**: Bank of England, ONS, and other authoritative UK economic data sources

### Reporting Analyst Agent  
- **Role**: Economic Data Analyst and Report Maintainer
- **Goal**: Update and maintain chronological economic data reports
- **Tools**: JSON manipulation tool for structured data updates
- **Output**: Time-series JSON report with proper chronological ordering

### Data Structure

The system maintains data in this JSON format:
```json
{
  "metadata": {
    "updated_at": "2026-01-11",
    "created_at": "2026-01-11"
  },
  "economic_indicators": {
    "interest_rate": [
      {
        "value": "3.75%",
        "date_published": "2025-12-17", 
        "month_period": "Dec-25"
      }
    ],
    "cpih_mom": [
      {
        "value": "-0.1%",
        "date_published": "2025-11-20",
        "month_period": "Nov-25"
      }
    ],
    "gdp_mom": [
      {
        "value": "-0.1%",
        "date_published": "2025-10-15",
        "month_period": "Oct-25"
      }
    ]
  },
  "report_summaries": {
    "monetary_policy_report": [
      {
        "summary": "Brief summary of policy decisions...",
        "report_date": "2025-12-17",
        "month_period": "Dec-25"
      }
    ],
    "financial_stability_report": [
      {
        "summary": "Brief summary of financial system assessment...",
        "report_date": "2025-12-15",
        "month_period": "Dec-25"
      }
    ]
  }
}
```

## Configuration

The system is configured through YAML files:
- `src/uk_macro_crew/config/agents.yaml`: Agent definitions and capabilities
- `src/uk_macro_crew/config/tasks.yaml`: Task definitions and expected outputs
- `knowledge/user_preference.txt`: User preferences for data presentation

## Support

For support, questions, or feedback regarding the UK Macro Crew:
- Visit the [crewAI documentation](https://docs.crewai.com)
- Check the [crewAI GitHub repository](https://github.com/joaomdmoura/crewai)
- [Join the crewAI Discord](https://discord.com/invite/X4JWnZnxPb)

## Project Structure

```
uk-macro-tracker/          # Project root
├── .env                   # API keys (OPENAI_API_KEY, EXA_API_KEY)
├── .env.dist             # Environment template
├── research_report.json  # Generated economic data report
├── knowledge/            # Templates and configuration
├── src/uk_macro_crew/    # Main source code
│   ├── config/          # Agent and task YAML configurations
│   ├── tools/           # Custom JSON manipulation tools
│   ├── crew.py          # Agent orchestration
│   └── main.py          # CLI entry points
└── tests/               # Test suite
```
