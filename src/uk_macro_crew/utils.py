# Add your utilities or helper functions to this file.

import os
import json
import logging
from datetime import datetime
from dotenv import load_dotenv, find_dotenv

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
    """Generate JSON filename"""
    return "research_report.json"


def save_json_hook(result) -> None:
    """
    Save JSON output after crew execution with system-generated metadata.
    
    The reporting analyst agent outputs JSON with business data, and this hook
    adds reliable system-generated metadata fields using Python.
    
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
        
        # Strip markdown code blocks if present (just in case)
        json_content = json_content.strip()
        if json_content.startswith('```json'):
            json_content = json_content[7:]  # Remove ```json
        elif json_content.startswith('```'):
            json_content = json_content[3:]   # Remove ```
        
        if json_content.endswith('```'):
            json_content = json_content[:-3]  # Remove trailing ```
        
        json_content = json_content.strip()
        
        # Parse JSON and add system-generated metadata
        try:
            parsed_json = json.loads(json_content)
            
            # Ensure metadata exists and add system-generated fields
            if "metadata" not in parsed_json:
                parsed_json["metadata"] = {}
            
            # Add reliable system-generated metadata (Python handles this, not the LLM)
            current_time = datetime.now().isoformat() + "Z"
            parsed_json["metadata"]["generated_at"] = current_time
            parsed_json["metadata"]["last_updated"] = current_time
            
            # Format the JSON with proper indentation
            json_content = json.dumps(parsed_json, indent=2)
            
        except json.JSONDecodeError as e:
            logger.error(f"Result content is not valid JSON: {e}")
            logger.warning("Saving content as-is despite JSON validation error")
        
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