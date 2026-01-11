# Add your utilities or helper functions to this file.

import os
import json
import logging
from datetime import datetime
from dotenv import load_dotenv, find_dotenv

# these expect to find a .env file at the directory above the lesson.                                                                                                                     # the format for that file is (without the comment)                                                                                                                                       #API_KEYNAME=AStringThatIsTheLongAPIKeyFromSomeService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def load_env():
    _ = load_dotenv(find_dotenv())


def get_exa_api_key():
    load_env()
    exa_api_key = os.getenv("EXA_API_KEY")
    return exa_api_key


def get_json_filename() -> str:
    """Generate JSON filename (replaces CSV naming)"""
    return "research_report.json"


def load_json_report() -> str:
    """
    Load existing JSON report or return empty structure.
    
    Returns:
        str: JSON string containing existing report data or empty structure
    """
    json_filename = get_json_filename()
    
    try:
        with open(json_filename, "r", encoding="utf-8") as f:
            json_content = f.read()
            # Validate that it's proper JSON
            json.loads(json_content)
            logger.info(f"Successfully loaded existing JSON report from {json_filename}")
            return json_content
    except FileNotFoundError:
        logger.info(f"No existing JSON report found at {json_filename}, returning empty structure")
        return get_empty_json_structure()
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON format in {json_filename}: {e}")
        # Backup corrupted file
        backup_filename = f"{json_filename}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        try:
            os.rename(json_filename, backup_filename)
            logger.info(f"Corrupted JSON file backed up to {backup_filename}")
        except OSError as backup_error:
            logger.error(f"Failed to backup corrupted file: {backup_error}")
        return get_empty_json_structure()
    except OSError as e:
        logger.error(f"Error reading JSON file {json_filename}: {e}")
        return get_empty_json_structure()


def get_empty_json_structure() -> str:
    """
    Return empty JSON structure for new reports.
    
    Returns:
        str: JSON string with empty time-series structure
    """
    empty_structure = {
        "metadata": {
            "updated_at": "",
            "created_at": ""
        },
        "economic_indicators": {
            "interest_rate": [],
            "cpih_mom": [],
            "gdp_mom": []
        },
        "report_summaries": {
            "monetary_policy_report": [],
            "financial_stability_report": []
        }
    }
    return json.dumps(empty_structure, indent=2)


def save_json_hook(result) -> None:
    """
    Save JSON output after crew execution.
    
    Args:
        result: The result object from crew execution containing the JSON output
    """
    json_filename = get_json_filename()
    
    try:
        # Extract the JSON content from the result
        if hasattr(result, 'raw'):
            json_content = result.raw
        elif hasattr(result, 'output'):
            json_content = result.output
        else:
            json_content = str(result)
        
        # Strip markdown code blocks if present
        json_content = json_content.strip()
        if json_content.startswith('```json'):
            json_content = json_content[7:]  # Remove ```json
        elif json_content.startswith('```'):
            json_content = json_content[3:]   # Remove ```
        
        if json_content.endswith('```'):
            json_content = json_content[:-3]  # Remove trailing ```
        
        json_content = json_content.strip()
        
        # Validate JSON format before saving
        try:
            parsed_json = json.loads(json_content)
            # Fix metadata timestamps
            if "metadata" in parsed_json:
                # Always update the updated_at to current date
                parsed_json["metadata"]["updated_at"] = datetime.now().strftime("%Y-%m-%d")
                # Preserve created_at if it exists and is valid, otherwise set to current date
                if not parsed_json["metadata"].get("created_at"):
                    parsed_json["metadata"]["created_at"] = datetime.now().strftime("%Y-%m-%d")
                json_content = json.dumps(parsed_json, indent=2)
        except json.JSONDecodeError:
            logger.error("Result content is not valid JSON, saving as-is")
        
        # Save to file
        with open(json_filename, "w", encoding="utf-8") as f:
            f.write(json_content)
        
        logger.info(f"Successfully saved JSON report to {json_filename}")
        
    except OSError as e:
        logger.error(f"Error saving JSON file {json_filename}: {e}")
        raise Exception(f"Failed to save JSON report: {e}")
    except Exception as e:
        logger.error(f"Unexpected error in save_json_hook: {e}")
        raise Exception(f"Failed to save JSON report: {e}")


# Legacy CSV function - kept for backward compatibility during transition
def save_csv_hook(result):
    """
    Legacy CSV save function - deprecated, use save_json_hook instead.
    This function is kept for backward compatibility during the transition.
    """
    logger.warning("save_csv_hook is deprecated, please use save_json_hook instead")
    # For now, just log the result without saving to maintain compatibility
    logger.info(f"CSV hook called with result: {result}")
    # Could implement CSV to JSON conversion here if needed during transition