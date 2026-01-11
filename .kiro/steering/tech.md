# Technology Stack

## Framework & Dependencies
- **CrewAI 1.7.2**: Multi-agent AI framework for orchestrating collaborative agents
- **Python 3.10-3.13**: Core runtime environment (>=3.10,<3.14)
- **UV**: Modern Python package manager for dependency management and virtual environments
- **Pandas 2.3.3+**: Data manipulation (used in legacy CSV tool, not in current implementation)
- **EXA-PY 2.0.2+**: Web search and data retrieval tool for economic data
- **OpenAI GPT-4o-mini**: Default LLM for agents (configurable via MODEL env var)
- **Pytest 7.0.0+**: Testing framework with coverage support

## Build System
- **UV** for dependency management and virtual environment handling
- **Hatchling** as the build backend
- **pyproject.toml** for project configuration

## Common Commands

### Setup & Installation
```bash
# Install UV package manager
pip install uv

# Install project dependencies
crewai install
# or manually with UV
uv sync
```

### Running the Application
```bash
# Run the main crew workflow
crewai run

# Alternative entry points
uv run uk_macro_crew
uv run run_crew
```

### Development & Testing
```bash
# Train the crew (requires iterations and filename)
uv run train <n_iterations> <filename>

# Test the crew (requires iterations and eval_llm)
uv run test <n_iterations> <eval_llm>

# Run tests with UV
uv run pytest

# Run tests with coverage
uv run pytest --cov=uk_macro_crew

# Replay specific task execution
uv run replay <task_id>

# Run with trigger payload
uv run run_with_trigger '<json_payload>'
```

## Environment Configuration
- Requires `.env` file with `OPENAI_API_KEY` and `EXA_API_KEY`
- Optional `TIMEFRAME` environment variable for controlling research periods
- Environment variables loaded via python-dotenv
- API keys managed through utils.py helper functions

### Environment Variables
```bash
OPENAI_API_KEY=your_key_here    # Required: OpenAI API access
EXA_API_KEY=your_key_here       # Required: Exa search API access
TIMEFRAME=last 3 months         # Optional: Research timeframe (default: "last 3 months")

# Error Handling & Reliability Configuration
AGENT_MAX_ITERATIONS=5          # Maximum iterations per agent before stopping (default: 5)
AGENT_MAX_RETRIES=2            # Maximum retries per agent on failure (default: 2)
AGENT_MAX_EXECUTION_TIME=900   # Maximum execution time per agent in seconds (default: 900 = 15 min)
AGENT_MAX_RPM=150              # Maximum requests per minute per agent (default: 150)
CREW_FAIL_FAST=true           # Stop execution immediately on first error (default: true)
CREW_MAX_RPM=100              # Maximum requests per minute for the crew (default: 100)
```

## Error Handling & Reliability

The system includes comprehensive error handling to prevent common issues:

### Built-in Safeguards
- **Iteration Limits**: Prevents infinite loops by limiting agent iterations
- **Execution Timeouts**: Individual agents timeout to prevent system hangs
- **Retry Logic**: Failed operations retry with exponential backoff
- **Rate Limiting**: Prevents API quota exhaustion and rate limit errors
- **Fail-Fast Mode**: Configurable immediate stopping on errors
- **Graceful Degradation**: Provides partial results when possible

### Configuration Scenarios
```bash
# Quick Testing (restrictive settings)
AGENT_MAX_ITERATIONS=2
AGENT_MAX_RETRIES=1
AGENT_MAX_EXECUTION_TIME=300   # 5 minutes
CREW_FAIL_FAST=true

# Production (balanced settings)
AGENT_MAX_ITERATIONS=5
AGENT_MAX_RETRIES=2
AGENT_MAX_EXECUTION_TIME=900   # 15 minutes
CREW_FAIL_FAST=true

# Research Mode (lenient settings)
AGENT_MAX_ITERATIONS=10
AGENT_MAX_RETRIES=3
AGENT_MAX_EXECUTION_TIME=1800  # 30 minutes
CREW_FAIL_FAST=false
```