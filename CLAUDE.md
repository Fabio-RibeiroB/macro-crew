# UK Macro Crew - AI Assistant Guide

## Project Overview

UK Macro Crew is a multi-agent AI system built with CrewAI that automates the collection and reporting of UK macroeconomic data. The system runs **automatically on publication dates** via a scheduler that checks daily at 5pm.

### Core Purpose
- Automate collection of UK macroeconomic data from authoritative sources
- Build and maintain a cumulative time-series JSON report (`research_report.json`)
- Focus on Bank of England and ONS data sources for accuracy
- Provide chronological tracking of economic trends over time
- **Automated Scheduling**: Runs automatically at 5pm on each indicator's `next_publication_date`

### Final Output: `research_report.json`
The system produces a single, comprehensive JSON file that serves as the **final deliverable**:
- **Location**: `/home/finstats/public_html/macro-crew/research_report.json`
- **Copies**: Automatically synced to `dist/` and `public/` for frontend access
- **Structure**: Current snapshot format with `next_publication_date` for each indicator
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
- **CPIH**: Consumer Price Index including Housing (headline annual rate)
- **GDP**: Gross Domestic Product quarterly growth
- **Monetary Policy Report**: BoE policy summaries (comprehensive paragraph-length analysis)
- **Financial Stability Report**: BoE financial stability summaries (comprehensive paragraph-length analysis)

### Report Summary Quality Standards
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
    "cpih": [
      {
        "value": "4.0%",
        "date_published": "2025-11-20",
        "month_period": "Nov-25"
      }
      // Historical data continues...
    ],
    "gdp": [
      {
        "value": "+0.1%",
        "date_published": "2025-10-15",
        "month_period": "Oct-25"
      }
      // Historical data continues...
    ]
  },
  "report_summaries": {
    "monetary_policy_report": [
      {
        "summary": "Comprehensive paragraph summary covering key policy decisions, inflation outlook, economic growth assessment, and forward-looking guidance - minimum 3-4 sentences providing substantive insights into the Bank's monetary policy stance and economic assessment...",
        "report_date": "2025-12-17",
        "month_period": "Dec-25"
      }
      // Previous reports preserved...
    ],
    "financial_stability_report": [
      {
        "summary": "Comprehensive paragraph summary covering banking system resilience, key risk areas, household debt concerns, commercial real estate issues, and systemic risk assessment - minimum 3-4 sentences providing substantive insights into financial stability conditions and risk outlook...",
        "report_date": "2025-12-15",
        "month_period": "Dec-25"
      }
      // Historical reports continue...
    ]
  }
}
```

### Automated Scheduling

The system uses `scheduler.py` to automatically run on publication dates:

**How it works:**
1. A cron job runs daily at 5pm
2. The scheduler reads `next_publication_date` from each indicator in `research_report.json`
3. If today matches any publication date, the CrewAI crew runs
4. Updated report is copied to `dist/` and `public/` for the frontend
5. Logs are written to `/home/finstats/logs/scheduler.log`

**Cron job (finstats user):**
```
PATH=/home/finstats/.local/bin:/usr/bin:/bin
0 17 * * * cd public_html/macro-crew && uv run scheduler.py run
```

**Scheduler commands:**
```bash
cd /home/finstats/public_html/macro-crew

# List all next publication dates
uv run scheduler.py list

# Show scheduler status and next run date
uv run scheduler.py status

# Manual run (checks if today is a publication date)
uv run scheduler.py run
```

### Data Format Rules
- **Date Format**: ISO format `YYYY-MM-DD` for `date_published`
- **Period Format**: `MMM-YY` format for `month_period` (e.g., "Dec-25")
- **Chronological Ordering**: Data arrays sorted by date (newest first)
- **Time-Series Structure**: Each indicator is an array of objects with value, date, and period

## Project Structure

```
/home/finstats/
├── .env                    # API keys (OPENAI_API_KEY, EXA_API_KEY) - outside public_html for security
└── logs/
    └── scheduler.log       # Scheduler execution logs

/home/finstats/public_html/macro-crew/
├── scheduler.py           # Publication date scheduler (cron entry point)
├── pyproject.toml         # Project configuration and dependencies
├── research_report.json   # Generated output JSON report (primary)
├── dist/                  # Built React frontend (served by Apache HTTPS)
│   └── research_report.json  # Copy for frontend
├── public/
│   └── research_report.json  # Copy for frontend dev
├── src/uk_macro_crew/     # Main source code
│   ├── main.py           # Entry point and CLI commands
│   ├── crew.py           # CrewAI crew definition and agent setup
│   ├── utils.py          # Helper functions and hooks
│   ├── config/           # Agent and task configurations
│   │   ├── agents.yaml   # Agent definitions (roles, goals, backstories)
│   │   └── tasks.yaml    # Task definitions and expected outputs
│   └── tools/            # Custom CrewAI tools
│       └── json_tool.py  # JSON manipulation tool (primary)
└── tests/                # Test directory
    └── test_*.py         # Various test files
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
The `.env` file is stored at `/home/finstats/.env` (outside public_html for security):
```bash
OPENAI_API_KEY=your_openai_api_key_here
EXA_API_KEY=your_exa_api_key_here
```

The `find_dotenv()` function in `utils.py` searches upward from the source directory and finds this file automatically.

**Required Environment Variables:**
- **OPENAI_API_KEY**: OpenAI API access for LLM agents
- **EXA_API_KEY**: Exa search API access for web research

## Running the System

### Automatic Execution (Production)
The system runs automatically via cron. No manual intervention needed for normal operation.

To check status or upcoming runs:
```bash
cd /home/finstats/public_html/macro-crew
uv run scheduler.py status
```

### Manual Execution
```bash
cd /home/finstats/public_html/macro-crew

# Run the crew directly (bypasses date check)
uv run run_crew

# Run via scheduler (only runs if today is a publication date)
uv run scheduler.py run
```

### Development Commands
**Note**: All commands run from the `/home/finstats/public_html/macro-crew/` directory.

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
- API keys stored in `/home/finstats/.env` (outside public_html, not web-accessible)
- `.env` file permissions set to 600 (owner read/write only)
- Environment variables loaded via `utils.py` helper functions using `find_dotenv()`
- No hardcoded credentials in source code

## Apache Configuration
- **HTTPS DocumentRoot**: `/home/finstats/public_html/macro-crew/dist` (React SPA)
- **FallbackResource**: `/index.html` (SPA routing)
- The `.env` file is outside the DocumentRoot and not accessible via web

## Deployment Architecture
```
Apache (HTTPS:443)
    └── serves dist/index.html (React frontend)
              └── fetches dist/research_report.json

Cron (daily 5pm)
    └── scheduler.py
              └── checks next_publication_date
              └── runs CrewAI crew if due
              └── copies report to dist/ and public/
              └── logs to /home/finstats/logs/scheduler.log
```

This guide provides everything needed to understand, modify, and extend the UK Macro Crew system effectively.

---

## Changelog

### 2026-02-05
- **Added**: `scheduler.py` - Python utility for automated crew execution based on publication dates
  - `list` command: Shows all next publication dates
  - `status` command: Shows next scheduled run and upcoming dates
  - `run` command: Cron entry point - runs crew if today matches a publication date
- **Added**: Cron job for finstats user - runs daily at 17:00
- **Added**: Logging to `/home/finstats/logs/scheduler.log`
- **Changed**: `.env` location moved to `/home/finstats/.env` (outside public_html for security)
- **Changed**: `.env` permissions set to 600
- **Installed**: `uv` 0.9.30 for finstats user (`~/.local/bin/uv`)
- **Installed**: All Python dependencies via `uv sync` (156 packages including CrewAI 1.7.2)
- **Verified**: First successful automated run - collected interest_rate and monetary_policy_report data