# UK Macro Crew - AI Assistant Guide

## Project Overview

UK Macro Crew is a multi-agent AI system built with CrewAI that automates the collection and reporting of UK macroeconomic data. The system is designed for **monthly execution** to build a comprehensive time-series dataset of UK economic indicators.

### Core Purpose
- Automate monthly collection of UK macroeconomic data from authoritative sources
- Build and maintain a cumulative time-series JSON report (`research_report.json`)
- Focus on Bank of England and ONS data sources for accuracy
- Provide chronological tracking of economic trends over time
- **Monthly Execution**: Run monthly to append latest data to the growing historical dataset

### Final Output: `research_report.json`
The system produces a single, comprehensive JSON file that serves as the **final deliverable**:
- **Location**: `uk_macro_crew/research_report.json`
- **Structure**: Time-series format with chronological arrays for each indicator
- **Growth Pattern**: New data is appended monthly, preserving all historical data
- **Usage**: This file contains the complete economic dataset and is the primary output

## System Architecture

### Agents
1. **Researcher Agent** (`researcher`)
   - Role: UK Macroeconomic Data Researcher
   - Tools: EXASearchTool, ScrapeWebsiteTool
   - Goal: Find current UK economic indicators from authoritative sources
   - Sources: Bank of England, ONS, government publications

2. **Reporting Analyst Agent** (`reporting_analyst`)
   - Role: Economic Data Analyst and Report Maintainer
   - Tools: JSONTool (custom)
   - Goal: Update and maintain chronological economic data reports
   - Output: Structured JSON with proper time-series ordering

### Key Economic Indicators Tracked
- **Interest Rates**: Bank of England base rates
- **CPIH**: Consumer Price Index including Housing (month-over-month)
- **GDP**: Gross Domestic Product monthly changes
- **Monetary Policy Report**: BoE policy summaries
- **Financial Stability Report**: BoE financial stability summaries

## Data Structure & Monthly Growth Pattern

The system maintains data in `research_report.json` - **the final deliverable** that grows monthly:

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
      // Previous months' data preserved here...
    ],
    "cpih_mom": [
      {
        "value": "-0.1%",
        "date_published": "2025-11-20",
        "month_period": "Nov-25"
      }
      // Historical data continues...
    ],
    "gdp_mom": [
      {
        "value": "-0.1%",
        "date_published": "2025-10-15",
        "month_period": "Oct-25"
      }
      // Historical data continues...
    ]
  },
  "report_summaries": {
    "monetary_policy_report": [
      {
        "summary": "Brief summary of latest policy decisions...",
        "report_date": "2025-12-17",
        "month_period": "Dec-25"
      }
      // Previous reports preserved...
    ],
    "financial_stability_report": [
      {
        "summary": "Brief summary of financial system assessment...",
        "report_date": "2025-12-15",
        "month_period": "Dec-25"
      }
      // Historical reports continue...
    ]
  }
}
```

### Monthly Execution Pattern
- **Frequency**: Run monthly (typically first week of each month)
- **Data Accumulation**: Each run appends new data while preserving historical records
- **Final Output**: `research_report.json` becomes increasingly comprehensive over time
- **Data Integrity**: Chronological ordering maintained, no data loss between runs

### Data Format Rules
- **Date Format**: ISO format `YYYY-MM-DD` for `date_published`
- **Period Format**: `MMM-YY` format for `month_period` (e.g., "Dec-25")
- **Chronological Ordering**: Data arrays sorted by date (newest first)
- **Time-Series Structure**: Each indicator is an array of objects with value, date, and period

## Project Structure

```
uk_macro_crew/
├── .env                    # API keys (OPENAI_API_KEY, EXA_API_KEY)
├── pyproject.toml         # Project configuration and dependencies
├── research_report.json   # Generated output JSON report
├── knowledge/             # Static data and configuration
│   ├── blank_report.json  # Template JSON structure
│   └── user_preference.txt # User configuration
├── src/uk_macro_crew/     # Main source code
│   ├── main.py           # Entry point and CLI commands
│   ├── crew.py           # CrewAI crew definition and agent setup
│   ├── utils.py          # Helper functions and hooks
│   ├── config/           # Agent and task configurations
│   │   ├── agents.yaml   # Agent definitions (roles, goals, backstories)
│   │   └── tasks.yaml    # Task definitions and expected outputs
│   └── tools/            # Custom CrewAI tools
│       ├── json_tool.py  # JSON manipulation tool (primary)
│       ├── csv_tool.py   # CSV manipulation tool (legacy - not used)
│       └── custom_tool.py # Additional custom tools
└── tests/                # Test directory
    ├── test_json_tool.py      # Core JSON tool functionality
    ├── test_integration.py    # End-to-end workflow tests
    ├── test_utils.py          # Helper function tests
    └── test_workflow_simulation.py # Workflow simulation tests
```

## Technology Stack

### Core Dependencies
- **CrewAI 1.7.2**: Multi-agent AI framework
- **Python 3.10-3.13**: Runtime environment
- **UV**: Package manager and dependency management
- **EXA-PY 2.0.2+**: Web search and data retrieval
- **OpenAI GPT-4o-mini**: Default LLM for agents
- **Pandas 2.3.3+**: Data manipulation (legacy CSV tool only)
- **Pytest**: Testing framework

### Build System
- **UV** for dependency management
- **Hatchling** as build backend
- **pyproject.toml** for configuration

## Setup and Installation

### Prerequisites
```bash
# Install UV package manager
pip install uv

# Install project dependencies
crewai install
# or manually with UV
uv sync
```

### Environment Configuration
Create `.env` file with:
```bash
OPENAI_API_KEY=your_openai_api_key_here
EXA_API_KEY=your_exa_api_key_here
TIMEFRAME=last 3 months
```

**Required Environment Variables:**
- **OPENAI_API_KEY**: OpenAI API access for LLM agents
- **EXA_API_KEY**: Exa search API access for web research

**Optional Environment Variables:**
- **TIMEFRAME**: Controls research timeframe (default: "last 3 months")
  - Examples: "latest print", "last 1 year", "most recent data", "last 6 months"

## Running the System

### Monthly Production Execution
**Important**: The system is designed for **monthly execution** to build a comprehensive dataset.

```bash
# Navigate to project directory first
cd uk_macro_crew

# Monthly production run (searches for latest available data)
crewai run

# Alternative entry points for monthly execution
uv run uk_macro_crew
uv run run_crew
```

### Execution Results
- **Primary Output**: Updated `research_report.json` with new monthly data appended
- **Data Preservation**: All historical data maintained in chronological arrays
- **Growth Pattern**: File grows monthly as new economic indicators are added
- **Final Deliverable**: `research_report.json` is the complete economic dataset

### Timeframe Configuration (Development/Testing)
For development and testing purposes, the system supports flexible timeframe specifications:

```bash
# Development: Run with custom timeframe via command line
crewai run latest print
crewai run last 1 year
crewai run most recent data

# Development: Run with timeframe via environment variable
TIMEFRAME="latest print" crewai run
```

**Timeframe Priority Levels:**
1. **Command Line** (highest priority): `crewai run latest print`
2. **Environment Variable**: `TIMEFRAME="latest print" crewai run`
3. **Default**: "latest print" (production default)

**Note**: In production, the system defaults to "latest print" to ensure the most current data is collected monthly.

### Development Commands
**Note**: All commands run from the `uk_macro_crew/` directory.

```bash
# Run tests
uv run pytest

# Run tests with coverage
uv run pytest --cov=uk_macro_crew

# Run specific test file
uv run pytest tests/test_json_tool.py -v

# Train the crew
uv run train <n_iterations> <filename>

# Test the crew
uv run test <n_iterations> <eval_llm>

# Replay specific task execution
uv run replay <task_id>

# Run with trigger payload
uv run run_with_trigger '<json_payload>'
```

## Key Files for AI Assistants

### Configuration Files
- **`config/agents.yaml`**: Agent definitions, roles, goals, backstories
- **`config/tasks.yaml`**: Task definitions and expected outputs
- **`knowledge/user_preference.txt`**: User preferences (economist, concise results)
- **`knowledge/blank_report.json`**: Template JSON structure

### Core Implementation
- **`crew.py`**: Agent orchestration, tool assignment, CrewAI decorators
- **`main.py`**: CLI entry points, input preparation
- **`utils.py`**: Helper functions, environment loading, file operations
- **`tools/json_tool.py`**: Primary tool for JSON manipulation

### Testing
- **`tests/test_json_tool.py`**: Core JSON tool functionality tests
- **`tests/test_integration.py`**: End-to-end workflow tests
- **`tests/test_utils.py`**: Helper function tests

## Development Patterns

### CrewAI Decorators
```python
@CrewBase
class UkMacroCrew:
    @agent
    def researcher(self) -> Agent: ...
    
    @task
    def research_task(self) -> Task: ...
    
    @crew
    def crew(self) -> Crew: ...
    
    @after_kickoff
    def save_report(self, result): ...
```

### Tool Development
- Custom tools inherit from `crewai.tools.BaseTool`
- Input schemas defined using Pydantic `BaseModel`
- Tools registered with agents in `crew.py`

### Data Flow
1. **Input**: Existing JSON report (time-series format) + research parameters
2. **Research**: Agent searches for latest economic data via Exa search
3. **Processing**: JSON tool appends new data to existing chronological arrays
4. **Output**: Updated time-series JSON saved as final deliverable (`research_report.json`)
5. **Monthly Growth**: Each execution adds to the cumulative dataset

## Testing Strategy

### Test Categories
1. **Unit Tests** (`test_json_tool.py`): Core JSON manipulation
2. **Integration Tests** (`test_integration.py`): End-to-end workflows
3. **Utility Tests** (`test_utils.py`): Helper functions

### Critical Test Areas
- **Time-Series Data Structure**: Chronological ordering, data parsing
- **Data Integrity**: Historical data preservation, merge logic
- **File Operations**: JSON loading, saving, error handling

### Running Tests
```bash
# All tests
uv run pytest

# Specific test with verbose output
uv run pytest tests/test_json_tool.py -v

# With coverage
uv run pytest --cov=uk_macro_crew
```

## Common Modification Patterns

### Adding New Economic Indicators
1. Update `knowledge/blank_report.json` with new indicator structure
2. Modify `tools/json_tool.py` to handle new indicator parsing
3. Update `config/tasks.yaml` to include new indicator in research goals
4. Add tests in `test_json_tool.py` for new indicator handling

### Modifying Agent Behavior
1. Update `config/agents.yaml` for role/goal changes
2. Update `config/tasks.yaml` for task modifications
3. Modify `crew.py` if tool assignments change
4. Update integration tests in `test_integration.py`

### JSON Structure Changes
1. Update `knowledge/blank_report.json` template
2. Modify `tools/json_tool.py` parsing logic
3. Update all test files with new expected structures
4. Ensure backward compatibility or migration strategy

## Troubleshooting

### Common Issues
- **API Key Errors**: Check `.env` file has both OPENAI_API_KEY and EXA_API_KEY
- **EXA Date Range Errors**: Agents receive guidance on proper date formatting for EXA tool
- **Timeframe Interpretation**: Use TIMEFRAME env var or command line for custom periods
- **JSON Structure Errors**: Validate against `blank_report.json` template
- **Date Format Issues**: Ensure ISO format for dates, MMM-YY for periods
- **Chronological Ordering**: Data should be sorted by date (newest first)

### Debug Commands
```bash
# Verbose test output
uv run pytest -v -s

# Stop on first failure
uv run pytest -x

# Run last failed tests only
uv run pytest --lf
```

## File Naming Conventions
- Snake_case for Python files and directories
- YAML files for configuration
- JSON files for data input/output
- Descriptive names reflecting functionality

## Security Notes
- API keys stored in `.env` file (not committed to git)
- Environment variables loaded via `utils.py` helper functions
- No hardcoded credentials in source code

This guide provides everything needed to understand, modify, and extend the UK Macro Crew system effectively.