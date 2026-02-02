# Testing Strategy

## Overview

The UK Macro Crew project uses a comprehensive testing strategy with pytest to ensure reliability and prevent regressions. Tests are organized into three main categories covering different aspects of the system.

## Test Structure

### Test Categories

1. **Unit Tests** (`test_json_tool.py`)
   - Tests the core JSON manipulation tool in isolation
   - Validates time-series data structure handling
   - Tests data parsing, merging, and chronological ordering
   - Critical for ensuring data integrity in array-based structure

2. **Integration Tests** (`test_integration.py`)
   - Tests end-to-end workflows from data input to JSON output
   - Validates complete crew execution cycles
   - Tests file operations and data persistence
   - Ensures components work together correctly

3. **Utility Tests** (`test_utils.py`)
   - Tests helper functions and file operations
   - Validates JSON structure creation and loading
   - Tests error handling and file management
   - Covers cross-cutting concerns

4. **Workflow Tests** (`test_workflow_simulation.py`)
   - Tests workflow simulation and execution patterns
   - Validates agent interaction scenarios
   - Tests error handling in complex workflows

5. **Timeframe Tests** (`test_timeframe_parsing.py`)
   - Tests date and timeframe parsing functionality
   - Validates chronological ordering logic
   - Tests MM-YY format handling

### Key Test Files

```
tests/
├── test_json_tool.py           # Core JSON tool functionality
├── test_integration.py         # End-to-end workflow tests
├── test_utils.py              # Helper function tests
├── test_workflow_simulation.py # Workflow simulation tests
└── test_timeframe_parsing.py  # Date/time parsing tests
```

## Running Tests

### Basic Test Execution
```bash
# Run all tests
uv run pytest

# Run with verbose output
uv run pytest -v

# Run specific test file
uv run pytest tests/test_json_tool.py -v

# Run with coverage report
uv run pytest --cov=uk_macro_crew

# Run tests in parallel (if pytest-xdist installed)
uv run pytest -n auto
```

### Test Filtering
```bash
# Run tests matching pattern
uv run pytest -k "json_tool"

# Run specific test method
uv run pytest tests/test_json_tool.py::TestJSONTool::test_chronological_ordering

# Run integration tests only
uv run pytest tests/test_integration.py
```

## Critical Test Areas

### 1. Time-Series Data Structure
**Location**: `test_json_tool.py`

**Key Tests**:
- `test_economic_indicator_parsing`: Validates data parsing into arrays
- `test_same_month_data_update`: Ensures same-month data updates correctly
- `test_chronological_ordering`: Verifies data is sorted by date
- `test_multiple_time_periods`: Tests historical data preservation

**What to Update**: When changing JSON structure or data parsing logic

### 2. Data Integrity
**Location**: `test_json_tool.py`, `test_integration.py`

**Key Tests**:
- `test_existing_data_preservation`: Ensures historical data isn't lost
- `test_multiple_time_periods_integration`: Validates time-series behavior
- `test_json_structure_validation`: Confirms schema compliance

**What to Update**: When modifying data storage format or merge logic

### 3. File Operations
**Location**: `test_utils.py`, `test_integration.py`

**Key Tests**:
- `test_load_json_report_*`: Tests file loading scenarios
- `test_save_json_hook_*`: Tests file saving and error handling
- `test_file_operations_create_read_update`: End-to-end file cycle

**What to Update**: When changing file handling or JSON structure

## When to Update Tests

### JSON Structure Changes
If you modify the JSON schema (e.g., adding new fields, changing array structure):

1. **Update `test_json_tool.py`**:
   - Modify structure validation tests
   - Update expected output assertions
   - Add tests for new fields

2. **Update `test_integration.py`**:
   - Adjust end-to-end workflow expectations
   - Update JSON structure validation tests

3. **Update `test_utils.py`**:
   - Modify empty structure tests
   - Update file loading/saving tests

### Agent/Task Configuration Changes
If you modify agent roles, tasks, or expected outputs:

1. **Update `test_integration.py`**:
   - Modify crew configuration tests
   - Update expected output formats
   - Adjust workflow validation

### Tool Functionality Changes
If you modify the JSON tool or add new tools:

1. **Update `test_json_tool.py`**:
   - Add tests for new functionality
   - Modify existing behavior tests
   - Update input/output validation

2. **Update `test_integration.py`**:
   - Test new tools in workflow context
   - Validate tool integration

## Test Data Patterns

### Time-Series Structure
Tests expect this JSON format:
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
        "summary": "Comprehensive paragraph summary covering key policy decisions, inflation outlook, economic growth assessment, and forward-looking guidance - minimum 3-4 sentences providing substantive insights into the Bank's monetary policy stance and economic assessment...",
        "report_date": "2025-12-17",
        "month_period": "Dec-25"
      }
    ],
    "financial_stability_report": [
      {
        "summary": "Comprehensive paragraph summary covering banking system resilience, key risk areas, household debt concerns, commercial real estate issues, and systemic risk assessment - minimum 3-4 sentences providing substantive insights into financial stability conditions and risk outlook...",
        "report_date": "2025-12-15",
        "month_period": "Dec-25"
      }
    ]
  }
}
```

### Test Data Consistency
- Use consistent date formats: `YYYY-MM-DD` for dates, `MMM-YY` for periods
- Maintain chronological ordering in test expectations
- Use realistic economic data values in tests

## Common Pitfalls

### 1. Array vs Object Confusion
**Problem**: Tests expecting single objects when data is now arrays
**Solution**: Always access array elements with `[0]` for single entries

```python
# Wrong
assert result["economic_indicators"]["interest_rate"]["value"] == "3.75%"

# Correct
assert result["economic_indicators"]["interest_rate"][0]["value"] == "3.75%"
```

### 2. Date Format Mismatches
**Problem**: Inconsistent date formats between test data and expectations
**Solution**: Use helper functions for date conversion and stick to ISO format

### 3. Chronological Ordering
**Problem**: Tests failing due to unexpected data ordering
**Solution**: Sort test data or use specific index access rather than assuming order

### 4. Metadata Fields
**Problem**: Missing `created_at` or `updated_at` fields in test data
**Solution**: Include both metadata fields in test structures

## Test Maintenance

### Regular Maintenance Tasks
1. **Run full test suite** before any commits
2. **Update test data** when adding new economic indicators
3. **Review test coverage** periodically with `--cov` flag
4. **Validate test performance** - tests should complete in under 10 seconds

### Adding New Tests
When adding functionality:
1. Write unit tests first (TDD approach)
2. Add integration tests for end-to-end scenarios
3. Include error handling and edge case tests
4. Update this documentation with new test patterns

### Test Environment
- Tests use temporary directories for file operations
- Mock external API calls to ensure test reliability
- Use pytest fixtures for common test data setup
- Maintain test isolation - no shared state between tests

## Debugging Test Failures

### Common Debug Commands
```bash
# Run with detailed output
uv run pytest -v -s

# Stop on first failure
uv run pytest -x

# Run last failed tests only
uv run pytest --lf

# Show local variables on failure
uv run pytest -l
```

### Investigation Steps
1. Check if JSON structure matches expected format
2. Verify date formats and chronological ordering
3. Confirm file paths and permissions
4. Validate test data consistency
5. Review recent changes to related components