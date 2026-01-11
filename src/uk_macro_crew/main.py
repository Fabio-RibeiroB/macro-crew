#!/usr/bin/env python
import sys
import warnings
from datetime import datetime

from uk_macro_crew.crew import UkMacroCrew
from uk_macro_crew.utils import load_json_report

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")

# This main file is intended to be a way for you to run your
# crew locally, so refrain from adding unnecessary logic into this file.
# Replace with inputs you want to test with, it will automatically
# interpolate any tasks and agents information


def run():
    """
    Run the crew with enhanced error handling.
    """
    import os
    import sys

    # Load JSON report using the utility function
    try:
        json_report = load_json_report()
    except Exception as e:
        print(f"ERROR: Failed to load JSON report: {e}")
        sys.exit(1)

    now = datetime.now()
    
    # Hardcode timeframe to always get the latest print
    timeframe = "latest print"
    
    inputs = {
        "topic": "UK Macroeconomic data and reports",
        "timeframe": timeframe,
        "current_date": now.strftime("%B %d, %Y"),
        "json_report": json_report,
    }

    # Get configuration from environment variables
    fail_fast = os.getenv("CREW_FAIL_FAST", "true").lower() == "true"
    max_execution_time = int(os.getenv("AGENT_MAX_EXECUTION_TIME", "900"))
    
    print(f"Starting crew execution with fail_fast: {fail_fast}")
    print(f"Agent max execution time: {max_execution_time}s")
    print(f"Timeframe: {timeframe}")

    try:
        crew_instance = UkMacroCrew()
        result = crew_instance.crew().kickoff(inputs=inputs)
        print("Crew execution completed successfully")
        return result
    except KeyboardInterrupt:
        print("\nERROR: Crew execution interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Crew execution failed: {e}")
        if fail_fast:
            print("Fail-fast mode enabled - stopping execution")
            sys.exit(1)
        else:
            raise Exception(f"An error occurred while running the crew: {e}")


def train():
    """
    Train the crew for a given number of iterations.
    """
    inputs = {"topic": "AI LLMs", "current_year": str(datetime.now().year)}
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
    Test the crew execution and returns the results.
    """
    inputs = {"topic": "AI LLMs", "current_year": str(datetime.now().year)}

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
