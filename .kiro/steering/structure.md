# Project Structure

## Directory Organization

```
uk_macro_crew/
├── .env                    # Environment variables (API keys and error handling config)
├── pyproject.toml         # Project configuration and dependencies
├── research_report.json   # Generated output JSON report (time-series format)
├── uv.lock               # UV dependency lock file
├── knowledge/             # Static data and configuration
│   ├── blank_report.json  # Template JSON structure for time-series data
│   └── user_preference.txt # User configuration preferences
├── src/uk_macro_crew/     # Main source code
│   ├── __init__.py
│   ├── main.py           # Entry point and CLI commands with error handling
│   ├── crew.py           # CrewAI crew definition and agent setup
│   ├── utils.py          # Helper functions, hooks, and JSON utilities
│   ├── config/           # Agent and task configurations
│   │   ├── agents.yaml   # Agent definitions (roles, goals, backstories)
│   │   └── tasks.yaml    # Task definitions and expected outputs
│   └── tools/            # Custom CrewAI tools
│       ├── __init__.py
│       ├── csv_tool.py   # CSV manipulation tool (legacy - not used)
│       ├── json_tool.py  # JSON manipulation tool (primary - time-series format)
│       └── custom_tool.py # Additional custom tools
└── tests/                # Comprehensive test directory
    ├── __init__.py
    ├── test_json_tool.py      # Core JSON tool functionality tests
    ├── test_integration.py    # End-to-end workflow tests
    ├── test_utils.py          # Helper function tests
    ├── test_timeframe_parsing.py # Date/time parsing tests
    └── test_workflow_simulation.py # Workflow simulation tests
```

## Architecture Patterns

### CrewAI Decorators Pattern
- Use `@CrewBase` class decorator for crew definition
- Use `@agent` decorator for agent factory methods
- Use `@task` decorator for task factory methods  
- Use `@crew` decorator for crew assembly
- Use `@after_kickoff` decorator for post-execution hooks

### Configuration-Driven Design
- Agent definitions in YAML (`config/agents.yaml`)
- Task definitions in YAML (`config/tasks.yaml`)
- Separation of configuration from implementation logic

### Tool Architecture
- Custom tools inherit from `crewai.tools.BaseTool`
- Input schemas defined using Pydantic `BaseModel`
- Tools registered with agents in crew.py

### Data Flow Pattern
1. **Input**: JSON report (time-series format) + research parameters
2. **Research**: Agent searches for latest economic data using EXA search
3. **Processing**: JSON tool updates report with new data in chronological arrays
4. **Output**: Updated time-series JSON saved via post-execution hook
5. **Error Handling**: Comprehensive safeguards prevent infinite loops and timeouts

## File Naming Conventions
- Snake_case for Python files and directories
- YAML files for configuration
- JSON files for data input/output (time-series format, migrated from CSV)
- Descriptive names reflecting functionality (e.g., `json_tool.py`, `research_task`)
- Test files follow pytest conventions (`test_*.py`)

## Key Integration Points
- `main.py`: CLI entry points, input preparation, and error handling configuration
- `crew.py`: Agent orchestration and tool assignment with reliability controls
- `utils.py`: Cross-cutting concerns (env loading, file operations, JSON utilities)
- `config/`: Declarative agent and task definitions with search strategies
- `tools/json_tool.py`: Time-series data structure management and chronological ordering