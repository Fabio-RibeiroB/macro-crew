#!/usr/bin/env python
"""
UK Macro Crew - Simplified Current Data Snapshot Generator

This main entry point has been updated for simplified execution that focuses on
generating current data snapshots rather than maintaining time-series historical data.

Key simplifications:
- No complex JSON report loading (removed load_json_report dependency)
- Direct file overwrite behavior (no historical data preservation)
- Faster execution focused on latest available data only
- Maintained comprehensive error handling and reliability features
- Preserved all environment variable configuration options

The system generates a fresh current snapshot on each execution, overwriting
the previous report file. This approach eliminates time-series complexity
while maintaining robust search capabilities and error handling.
"""
import sys
import warnings
from datetime import datetime

from uk_macro_crew.crew import UkMacroCrew

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")


def get_configuration_profile():
    """
    Determine and display the current configuration profile based on environment variables.
    Helps users understand which operational profile is active.
    """
    import os
    
    max_iterations = int(os.getenv("AGENT_MAX_ITERATIONS", "8"))
    max_execution_time = int(os.getenv("AGENT_MAX_EXECUTION_TIME", "900"))
    max_retries = int(os.getenv("AGENT_MAX_RETRIES", "2"))
    
    # Determine profile based on configuration values
    if max_iterations <= 2 and max_execution_time <= 300:
        return "Development/Testing (Quick feedback, restrictive limits)"
    elif max_iterations >= 10 and max_execution_time >= 1800:
        return "Research (Maximum flexibility for comprehensive data collection)"
    else:
        return "Production (Balanced reliability and performance)"


# This main file is intended to be a way for you to run your
# crew locally, so refrain from adding unnecessary logic into this file.
# Replace with inputs you want to test with, it will automatically
# interpolate any tasks and agents information


def run():
    """
    Run the crew with simplified execution for current data snapshot generation.
    
    This simplified version focuses on retrieving only the most recent UK macroeconomic
    data without time-series complexity. The system generates a current snapshot that
    overwrites the previous report file on each execution.
    """
    import os
    import sys

    # Simplified input preparation - no complex JSON report loading needed
    # The system will generate a fresh current snapshot on each execution
    now = datetime.now()
    
    # Focus on current/latest data only - simplified timeframe
    timeframe = "current data"
    
    # Simplified inputs for current snapshot generation
    inputs = {
        "topic": "Current UK Macroeconomic indicators and latest reports",
        "timeframe": timeframe,
        "current_date": now.strftime("%B %d, %Y"),
        "current_timestamp": now.isoformat() + "Z",  # Add ISO timestamp for metadata
        "execution_mode": "current_snapshot",  # New mode for simplified execution
    }

    # Get comprehensive configuration from environment variables (maintain reliability features)
    fail_fast = os.getenv("CREW_FAIL_FAST", "true").lower() == "true"
    max_execution_time = int(os.getenv("AGENT_MAX_EXECUTION_TIME", "900"))
    max_iterations = int(os.getenv("AGENT_MAX_ITERATIONS", "8"))  # Updated to match operations.md default
    max_retries = int(os.getenv("AGENT_MAX_RETRIES", "2"))
    max_rpm_agent = int(os.getenv("AGENT_MAX_RPM", "150"))
    max_rpm_crew = int(os.getenv("CREW_MAX_RPM", "100"))
    
    print(f"Starting simplified crew execution for current data snapshot")
    print(f"Configuration Profile: {get_configuration_profile()}")
    print(f"Error handling: fail_fast={fail_fast}, max_time={max_execution_time}s")
    print(f"Agent limits: max_iterations={max_iterations}, max_retries={max_retries}")
    print(f"Rate limits: agent_rpm={max_rpm_agent}, crew_rpm={max_rpm_crew}")
    print(f"Mode: {inputs['execution_mode']} - focusing on latest available data")
    print("Simplified execution: No time-series complexity, direct file overwrite")

    try:
        crew_instance = UkMacroCrew()
        result = crew_instance.crew().kickoff(inputs=inputs)
        print("Simplified crew execution completed successfully")
        print("Current data snapshot generated and saved to research_report.json")
        return result
    except KeyboardInterrupt:
        print("\nERROR: Crew execution interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Simplified crew execution failed: {e}")
        if fail_fast:
            print("Fail-fast mode enabled - stopping execution")
            sys.exit(1)
        else:
            raise Exception(f"An error occurred while running the simplified crew: {e}")


def train():
    """
    Train the crew for a given number of iterations with simplified inputs.
    """
    inputs = {
        "topic": "Current UK Macroeconomic indicators", 
        "current_date": datetime.now().strftime("%B %d, %Y"),
        "execution_mode": "current_snapshot"
    }
    try:
        UkMacroCrew().crew().train(
            n_iterations=int(sys.argv[1]), filename=sys.argv[2], inputs=inputs
        )

    except Exception as e:
        raise Exception(f"An error occurred while training the crew: {e}")


def replay():
    """
    Replay the crew execution from a specific task.
    """
    try:
        UkMacroCrew().crew().replay(task_id=sys.argv[1])

    except Exception as e:
        raise Exception(f"An error occurred while replaying the crew: {e}")


def test():
    """
    Test the crew execution with simplified inputs and returns the results.
    """
    inputs = {
        "topic": "Current UK Macroeconomic indicators", 
        "current_date": datetime.now().strftime("%B %d, %Y"),
        "execution_mode": "current_snapshot"
    }

    try:
        UkMacroCrew().crew().test(
            n_iterations=int(sys.argv[1]), eval_llm=sys.argv[2], inputs=inputs
        )

    except Exception as e:
        raise Exception(f"An error occurred while testing the crew: {e}")


def run_with_trigger():
    """
    Run the crew with trigger payload.
    """
    import json

    if len(sys.argv) < 2:
        raise Exception(
            "No trigger payload provided. Please provide JSON payload as argument."
        )

    try:
        trigger_payload = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        raise Exception("Invalid JSON payload provided as argument")

    inputs = {
        "crewai_trigger_payload": trigger_payload,
        "topic": "",
        "current_year": "",
    }

    try:
        result = UkMacroCrew().crew().kickoff(inputs=inputs)
        return result
    except Exception as e:
        raise Exception(f"An error occurred while running the crew with trigger: {e}")
