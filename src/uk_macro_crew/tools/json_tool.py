import json
import re
from datetime import datetime
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Type, Dict, Any

class JSONToolInput(BaseModel):
    """Input schema for JSONTool."""
    existing_json: str = Field(..., description="The existing JSON report as a string.")
    new_data: str = Field(..., description="The new economic data and summaries to add to the report.")

class JSONTool(BaseTool):
    name: str = "JSON Update Tool"
    description: str = "Updates a JSON report with economic data and AI summaries. Stores indicators and summaries directly without date grouping."
    args_schema: Type[BaseModel] = JSONToolInput

    def _run(self, existing_json: str, new_data: str) -> str:
        try:
            # Parse existing JSON or create empty structure
            if existing_json.strip():
                try:
                    report_data = json.loads(existing_json)
                    # Migrate legacy data structure if needed
                    report_data = self._migrate_legacy_structure(report_data)
                except json.JSONDecodeError as e:
                    print(f"Error parsing existing JSON: {e}")
                    print(f"Existing JSON around error: {existing_json[max(0, e.pos-50):e.pos+50]}")
                    report_data = self._create_empty_structure()
            else:
                report_data = self._create_empty_structure()

            # Preserve original created_at date if it exists
            if "metadata" in report_data and "created_at" in report_data["metadata"]:
                original_created_at = report_data["metadata"]["created_at"]
            else:
                original_created_at = datetime.now().strftime("%Y-%m-%d")

            # Try to parse new_data as JSON first, then fall back to text parsing
            try:
                new_data_json = json.loads(new_data)
                self._merge_json_data(report_data, new_data_json)
            except json.JSONDecodeError as e:
                print(f"Error parsing new data JSON: {e}")
                print(f"New data around error: {new_data[max(0, e.pos-50):e.pos+50]}")
                # Fall back to text parsing for bullet-point format
                self._parse_text_data(report_data, new_data)

            # Update metadata with preserved created_at
            report_data["metadata"]["updated_at"] = datetime.now().strftime("%Y-%m-%d")
            report_data["metadata"]["created_at"] = original_created_at

            return json.dumps(report_data, indent=2)

        except Exception as e:
            print(f"General error in JSON tool: {e}")
            # Return the existing JSON if we can't process the new data
            try:
                if existing_json.strip():
                    existing_data = json.loads(existing_json)
                    existing_data["metadata"]["updated_at"] = datetime.now().strftime("%Y-%m-%d")
                    return json.dumps(existing_data, indent=2)
            except:
                pass
            
            # Last resort: return a basic structure
            basic_structure = self._create_empty_structure()
            return json.dumps(basic_structure, indent=2)

    def _migrate_legacy_structure(self, report_data: Dict[str, Any]) -> Dict[str, Any]:
        """Migrate legacy data structures to current format with proper date fields."""
        # Migrate economic indicators
        if "economic_indicators" in report_data:
            for indicator_key, indicator_array in report_data["economic_indicators"].items():
                if isinstance(indicator_array, list):
                    for entry in indicator_array:
                        # Add missing date_published field if not present
                        if "date_published" not in entry and "month_period" in entry:
                            entry["date_published"] = self._format_date_from_month(entry["month_period"])
        
        # Migrate report summaries
        if "report_summaries" in report_data:
            for report_key, report_array in report_data["report_summaries"].items():
                if isinstance(report_array, list):
                    for entry in report_array:
                        # Add missing report_date and month_period fields if not present
                        if "report_date" not in entry:
                            # Try to extract date from summary text (look for patterns like (MM-YY))
                            summary_text = entry.get("summary", "")
                            month_match = re.search(r'\((\w{3}-\d{2})\)', summary_text)
                            if month_match:
                                month_period = month_match.group(1)
                                entry["month_period"] = month_period
                                entry["report_date"] = self._format_date_from_month(month_period)
                                # Clean the summary text by removing the month reference
                                entry["summary"] = re.sub(r'\s*\(\w{3}-\d{2}\)', '', summary_text).strip()
                            else:
                                # Default to current month if no date found
                                current_month = datetime.now().strftime("%b-%y")
                                entry["month_period"] = current_month
                                entry["report_date"] = self._format_date_from_month(current_month)
                        elif "month_period" not in entry and "report_date" in entry:
                            # Generate month_period from report_date
                            entry["month_period"] = self._extract_month_from_date(entry["report_date"])
        
        return report_data

    def _merge_json_data(self, report_data: Dict[str, Any], new_data_json: Dict[str, Any]) -> None:
        """Merge JSON data into the time-series report structure."""
        # Merge economic indicators as time-series data
        if "economic_indicators" in new_data_json:
            for indicator_key, indicator_data in new_data_json["economic_indicators"].items():
                # Ensure the indicator array exists
                if indicator_key not in report_data["economic_indicators"]:
                    report_data["economic_indicators"][indicator_key] = []
                
                # Handle both single objects and arrays
                if isinstance(indicator_data, list):
                    # New data is already an array
                    for entry in indicator_data:
                        self._merge_time_series_entry(
                            report_data["economic_indicators"][indicator_key], 
                            entry, 
                            "month_period"
                        )
                else:
                    # New data is a single object, convert to time-series format
                    entry = {
                        "value": indicator_data.get("value"),
                        "date_published": indicator_data.get("date_published"),
                        "month_period": indicator_data.get("month_period", 
                            self._extract_month_from_date(indicator_data.get("date_published", "")))
                    }
                    self._merge_time_series_entry(
                        report_data["economic_indicators"][indicator_key], 
                        entry, 
                        "month_period"
                    )
        
        # Merge report summaries as time-series data
        if "report_summaries" in new_data_json:
            for report_key, report_data_item in new_data_json["report_summaries"].items():
                # Ensure the report summary array exists
                if report_key not in report_data["report_summaries"]:
                    report_data["report_summaries"][report_key] = []
                
                # Handle both single objects and arrays
                if isinstance(report_data_item, list):
                    # New data is already an array
                    for entry in report_data_item:
                        self._merge_time_series_entry(
                            report_data["report_summaries"][report_key], 
                            entry, 
                            "month_period"
                        )
                else:
                    # New data is a single object, convert to time-series format
                    entry = {
                        "summary": report_data_item.get("summary"),
                        "report_date": report_data_item.get("report_date"),
                        "month_period": report_data_item.get("month_period", 
                            self._extract_month_from_date(report_data_item.get("report_date", "")))
                    }
                    self._merge_time_series_entry(
                        report_data["report_summaries"][report_key], 
                        entry, 
                        "month_period"
                    )

    def _merge_time_series_entry(self, existing_array: list, new_entry: Dict[str, Any], period_key: str) -> None:
        """Merge a new entry into a time-series array, updating existing or appending new."""
        period_value = new_entry.get(period_key)
        
        # Find existing entry for the same period
        for i, existing_entry in enumerate(existing_array):
            if existing_entry.get(period_key) == period_value:
                existing_array[i] = new_entry
                return
        
        # No existing entry found, append new one
        existing_array.append(new_entry)
        
        # Sort by date to maintain chronological order
        date_key = "date_published" if "date_published" in new_entry else "report_date"
        existing_array.sort(key=lambda x: datetime.strptime(x.get(date_key, "1900-01-01"), "%Y-%m-%d"))

    def _extract_month_from_date(self, date_str: str) -> str:
        """Extract MM-YY format from ISO date string."""
        try:
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            return date_obj.strftime("%b-%y")
        except ValueError:
            return ""

    def _parse_text_data(self, report_data: Dict[str, Any], new_data: str) -> None:
        """Parse bullet-point formatted text data."""
        for line in new_data.split('\n'):
            line = line.strip()
            if not line:
                continue

            # Parse economic indicators (Interest Rate, CPIH +/- MoM, GDP +/- MoM)
            economic_match = re.match(r'-\s*(Interest Rate|CPIH \+/- MoM|GDP \+/- MoM):\s*(.*?)\s*\((\w{3}-\d{2})\)', line)
            if economic_match:
                indicator, value, month = economic_match.groups()
                self._add_economic_indicator(report_data, indicator.strip(), value.strip(), month.strip())
                continue

            # Parse report summaries (Monetary Policy Report, Financial Stability Report)
            summary_match = re.match(r'-\s*(Monetary Policy Report|Financial Stability Report)\s*Summary:\s*(.*?)\s*\((\w{3}-\d{2})\)', line)
            if summary_match:
                report_type, summary, month = summary_match.groups()
                # Only add if it's not "Data not found"
                if summary.strip().lower() not in ["data not found", "data not found."]:
                    self._add_report_summary(report_data, report_type.strip(), summary.strip(), month.strip())
                continue

    def _create_empty_structure(self) -> Dict[str, Any]:
        """Create empty JSON structure for new reports."""
        return {
            "metadata": {
                "updated_at": "",
                "created_at": datetime.now().strftime("%Y-%m-%d")
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

    def _add_economic_indicator(self, report_data: Dict[str, Any], indicator: str, value: str, month: str) -> None:
        """Add economic indicator data to the report as a time-series entry."""
        # Map indicator names to JSON keys
        indicator_map = {
            "Interest Rate": "interest_rate",
            "CPIH +/- MoM": "cpih_mom",
            "GDP +/- MoM": "gdp_mom"
        }

        indicator_key = indicator_map.get(indicator, indicator.lower().replace(" ", "_"))
        
        # Ensure the indicator array exists
        if indicator_key not in report_data["economic_indicators"]:
            report_data["economic_indicators"][indicator_key] = []
        
        # Create new data point
        new_entry = {
            "value": value,
            "date_published": self._format_date_from_month(month),
            "month_period": month
        }
        
        # Check if entry for this month already exists and update, otherwise append
        existing_entries = report_data["economic_indicators"][indicator_key]
        updated = False
        for i, entry in enumerate(existing_entries):
            if entry.get("month_period") == month:
                existing_entries[i] = new_entry
                updated = True
                break
        
        if not updated:
            # If no existing entry found, append new one
            existing_entries.append(new_entry)
        
        # Sort by date to maintain chronological order
        existing_entries.sort(key=lambda x: datetime.strptime(x.get("date_published", "1900-01-01"), "%Y-%m-%d"))

    def _add_report_summary(self, report_data: Dict[str, Any], report_type: str, summary: str, month: str) -> None:
        """Add report summary to the report as a time-series entry."""
        # Skip "Data not found" entries to avoid cluttering the report
        if summary.strip().lower() in ["data not found", "data not found."]:
            return
        
        # Map report types to JSON keys
        report_map = {
            "Monetary Policy Report": "monetary_policy_report",
            "Financial Stability Report": "financial_stability_report"
        }

        report_key = report_map.get(report_type, report_type.lower().replace(" ", "_"))
        
        # Ensure the report summary array exists
        if report_key not in report_data["report_summaries"]:
            report_data["report_summaries"][report_key] = []
        
        # Create new summary entry
        new_entry = {
            "summary": summary,
            "report_date": self._format_date_from_month(month),
            "month_period": month
        }
        
        # Check if entry for this month already exists and update, otherwise append
        existing_summaries = report_data["report_summaries"][report_key]
        updated = False
        for i, entry in enumerate(existing_summaries):
            if entry.get("month_period") == month:
                existing_summaries[i] = new_entry
                updated = True
                break
        
        if not updated:
            # If no existing entry found, append new one
            existing_summaries.append(new_entry)
        
        # Sort by date to maintain chronological order
        existing_summaries.sort(key=lambda x: datetime.strptime(x.get("report_date", "1900-01-01"), "%Y-%m-%d"))

    def _format_date_from_month(self, month: str) -> str:
        """Convert MM-YY format to ISO date format (first day of month)."""
        try:
            # Parse the month format (e.g., "Jan-24")
            date_obj = datetime.strptime(month, "%b-%y")
            return date_obj.strftime("%Y-%m-%d")
        except ValueError:
            # Fallback to current date if parsing fails
            return datetime.now().strftime("%Y-%m-%d")