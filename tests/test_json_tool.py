"""
Tests for JSONTool functionality.
Tests JSON structure validation, data parsing, and error handling.
"""

import json
import pytest
from uk_macro_crew.tools.json_tool import JSONTool, JSONToolInput


class TestJSONTool:
    """Test cases for JSONTool class."""

    def setup_method(self):
        """Set up test fixtures."""
        self.json_tool = JSONTool()
        self.empty_json = json.dumps({
            "metadata": {"updated_at": "", "created_at": ""},
            "economic_indicators": {
                "interest_rate": [],
                "cpih_mom": [],
                "gdp_mom": []
            },
            "report_summaries": {
                "monetary_policy_report": [],
                "financial_stability_report": []
            }
        })

    def test_empty_json_structure_creation(self):
        """Test that empty JSON structure is created correctly."""
        result = self.json_tool._run("", "")
        parsed_result = json.loads(result)
        
        assert "metadata" in parsed_result
        assert "economic_indicators" in parsed_result
        assert "report_summaries" in parsed_result
        assert parsed_result["metadata"]["updated_at"] != ""
        assert parsed_result["metadata"]["created_at"] != ""
        
        # Verify time-series structure
        assert isinstance(parsed_result["economic_indicators"]["interest_rate"], list)
        assert isinstance(parsed_result["economic_indicators"]["cpih_mom"], list)
        assert isinstance(parsed_result["economic_indicators"]["gdp_mom"], list)
        assert isinstance(parsed_result["report_summaries"]["monetary_policy_report"], list)
        assert isinstance(parsed_result["report_summaries"]["financial_stability_report"], list)

    def test_economic_indicator_parsing(self):
        """Test parsing of economic indicators into time-series format."""
        new_data = """
        - Interest Rate: 5.25% (Jan-24)
        - CPIH +/- MoM: +0.4% (Jan-24)
        - GDP +/- MoM: +0.2% (Jan-24)
        """
        
        result = self.json_tool._run(self.empty_json, new_data)
        parsed_result = json.loads(result)
        
        # Verify time-series structure
        assert isinstance(parsed_result["economic_indicators"]["interest_rate"], list)
        assert isinstance(parsed_result["economic_indicators"]["cpih_mom"], list)
        assert isinstance(parsed_result["economic_indicators"]["gdp_mom"], list)
        
        # Verify data was added to arrays
        assert len(parsed_result["economic_indicators"]["interest_rate"]) == 1
        assert len(parsed_result["economic_indicators"]["cpih_mom"]) == 1
        assert len(parsed_result["economic_indicators"]["gdp_mom"]) == 1
        
        # Verify values and structure
        interest_entry = parsed_result["economic_indicators"]["interest_rate"][0]
        assert interest_entry["value"] == "5.25%"
        assert interest_entry["month_period"] == "Jan-24"
        assert interest_entry["date_published"] == "2024-01-01"
        
        cpih_entry = parsed_result["economic_indicators"]["cpih_mom"][0]
        assert cpih_entry["value"] == "+0.4%"
        assert cpih_entry["month_period"] == "Jan-24"
        
        gdp_entry = parsed_result["economic_indicators"]["gdp_mom"][0]
        assert gdp_entry["value"] == "+0.2%"
        assert gdp_entry["month_period"] == "Jan-24"

    def test_report_summary_parsing(self):
        """Test parsing of report summaries into time-series format."""
        new_data = """
        - Monetary Policy Report Summary: The committee voted to maintain rates (Jan-24)
        - Financial Stability Report Summary: Banking sector remains resilient (Jan-24)
        """
        
        result = self.json_tool._run(self.empty_json, new_data)
        parsed_result = json.loads(result)
        
        # Verify time-series structure
        assert isinstance(parsed_result["report_summaries"]["monetary_policy_report"], list)
        assert isinstance(parsed_result["report_summaries"]["financial_stability_report"], list)
        
        # Verify data was added to arrays
        assert len(parsed_result["report_summaries"]["monetary_policy_report"]) == 1
        assert len(parsed_result["report_summaries"]["financial_stability_report"]) == 1
        
        # Verify content
        mpr_entry = parsed_result["report_summaries"]["monetary_policy_report"][0]
        assert "committee voted" in mpr_entry["summary"]
        assert mpr_entry["month_period"] == "Jan-24"
        assert mpr_entry["report_date"] == "2024-01-01"
        
        fsr_entry = parsed_result["report_summaries"]["financial_stability_report"][0]
        assert "Banking sector" in fsr_entry["summary"]
        assert fsr_entry["month_period"] == "Jan-24"

    def test_multiple_time_periods(self):
        """Test handling of multiple indicators preserves historical data."""
        new_data = """
        - Interest Rate: 5.25% (Jan-24)
        - Interest Rate: 5.50% (Feb-24)
        - CPIH +/- MoM: +0.4% (Jan-24)
        - CPIH +/- MoM: +0.3% (Feb-24)
        """
        
        result = self.json_tool._run(self.empty_json, new_data)
        parsed_result = json.loads(result)
        
        # Verify both time periods are preserved
        assert len(parsed_result["economic_indicators"]["interest_rate"]) == 2
        assert len(parsed_result["economic_indicators"]["cpih_mom"]) == 2
        
        # Verify chronological ordering (Jan before Feb)
        interest_rates = parsed_result["economic_indicators"]["interest_rate"]
        assert interest_rates[0]["month_period"] == "Jan-24"
        assert interest_rates[0]["value"] == "5.25%"
        assert interest_rates[1]["month_period"] == "Feb-24"
        assert interest_rates[1]["value"] == "5.50%"
        
        cpih_values = parsed_result["economic_indicators"]["cpih_mom"]
        assert cpih_values[0]["month_period"] == "Jan-24"
        assert cpih_values[0]["value"] == "+0.4%"
        assert cpih_values[1]["month_period"] == "Feb-24"
        assert cpih_values[1]["value"] == "+0.3%"

    def test_existing_data_preservation(self):
        """Test that existing data is preserved when adding new data."""
        existing_data = {
            "metadata": {"updated_at": "2024-01-01", "created_at": "2023-01-01"},
            "economic_indicators": {
                "interest_rate": [
                    {"value": "5.00%", "date_published": "2023-12-01", "month_period": "Dec-23"}
                ],
                "cpih_mom": [],
                "gdp_mom": []
            },
            "report_summaries": {
                "monetary_policy_report": [],
                "financial_stability_report": []
            }
        }
        
        new_data = "- CPIH +/- MoM: +0.4% (Jan-24)"
        
        result = self.json_tool._run(json.dumps(existing_data), new_data)
        parsed_result = json.loads(result)
        
        # Verify old data is preserved
        assert len(parsed_result["economic_indicators"]["interest_rate"]) == 1
        assert parsed_result["economic_indicators"]["interest_rate"][0]["value"] == "5.00%"
        assert parsed_result["economic_indicators"]["interest_rate"][0]["month_period"] == "Dec-23"
        
        # Verify new data is added
        assert len(parsed_result["economic_indicators"]["cpih_mom"]) == 1
        assert parsed_result["economic_indicators"]["cpih_mom"][0]["value"] == "+0.4%"
        assert parsed_result["economic_indicators"]["cpih_mom"][0]["month_period"] == "Jan-24"

    def test_malformed_data_handling(self):
        """Test handling of malformed input data."""
        malformed_data = """
        - Invalid line without proper format
        - Interest Rate: (missing value)
        - : 5.25% (missing indicator name)
        - Interest Rate: 5.25% (missing date)
        """
        
        # Should not raise exception, should handle gracefully
        result = self.json_tool._run(self.empty_json, malformed_data)
        parsed_result = json.loads(result)
        
        # Should still have valid structure
        assert "metadata" in parsed_result
        assert "economic_indicators" in parsed_result
        assert "report_summaries" in parsed_result

    def test_invalid_json_input(self):
        """Test handling of invalid JSON input."""
        invalid_json = "{ invalid json structure"
        new_data = "- Interest Rate: 5.25% (Jan-24)"
        
        result = self.json_tool._run(invalid_json, new_data)
        
        # Should return valid JSON structure even with invalid input
        parsed_result = json.loads(result)
        assert "metadata" in parsed_result
        assert "economic_indicators" in parsed_result
        assert len(parsed_result["economic_indicators"]["interest_rate"]) == 1
        assert parsed_result["economic_indicators"]["interest_rate"][0]["value"] == "5.25%"

    def test_date_format_conversion(self):
        """Test date format conversion from MM-YY to ISO format."""
        test_cases = [
            ("Jan-24", "2024-01-01"),
            ("Dec-23", "2023-12-01"),
            ("Jun-25", "2025-06-01")
        ]
        
        for month_input, expected_date in test_cases:
            result_date = self.json_tool._format_date_from_month(month_input)
            assert result_date == expected_date

    def test_metadata_timestamp_update(self):
        """Test that metadata timestamp is updated on each run."""
        new_data = "- Interest Rate: 5.25% (Jan-24)"
        
        result = self.json_tool._run(self.empty_json, new_data)
        parsed_result = json.loads(result)
        
        # Verify timestamp is set and in correct format (YYYY-MM-DD)
        timestamp = parsed_result["metadata"]["updated_at"]
        assert timestamp != ""
        assert len(timestamp) == 10  # YYYY-MM-DD format
        assert timestamp.count("-") == 2  # Two dashes in date format

    def test_same_month_data_update(self):
        """Test that data for the same month gets updated rather than duplicated."""
        # Add initial data for Jan-24
        initial_data = "- Interest Rate: 5.25% (Jan-24)"
        result1 = self.json_tool._run(self.empty_json, initial_data)
        
        # Add updated data for the same month
        updated_data = "- Interest Rate: 5.50% (Jan-24)"
        result2 = self.json_tool._run(result1, updated_data)
        parsed_result = json.loads(result2)
        
        # Verify only one entry exists for Jan-24 with updated value
        interest_rates = parsed_result["economic_indicators"]["interest_rate"]
        assert len(interest_rates) == 1
        assert interest_rates[0]["month_period"] == "Jan-24"
        assert interest_rates[0]["value"] == "5.50%"  # Updated value

    def test_chronological_ordering(self):
        """Test that entries are sorted chronologically."""
        # Add data in reverse chronological order
        new_data = """
        - Interest Rate: 5.50% (Mar-24)
        - Interest Rate: 5.25% (Jan-24)
        - Interest Rate: 5.35% (Feb-24)
        """
        
        result = self.json_tool._run(self.empty_json, new_data)
        parsed_result = json.loads(result)
        
        # Verify chronological ordering
        interest_rates = parsed_result["economic_indicators"]["interest_rate"]
        assert len(interest_rates) == 3
        assert interest_rates[0]["month_period"] == "Jan-24"
        assert interest_rates[1]["month_period"] == "Feb-24"
        assert interest_rates[2]["month_period"] == "Mar-24"
    def test_data_not_found_filtering(self):
        """Test that 'Data not found' entries are filtered out to avoid clutter."""
        existing_json = json.dumps({
            "metadata": {"updated_at": "2025-01-01", "created_at": "2025-01-01"},
            "economic_indicators": {"interest_rate": []},
            "report_summaries": {
                "financial_stability_report": [
                    {
                        "summary": "Previous valid report content",
                        "report_date": "2025-06-15",
                        "month_period": "Jun-25"
                    }
                ]
            }
        })
        
        # New data with "Data not found" - should be filtered out
        new_data = """
        - Interest Rate: 4.0% (Jan-26)
        - Financial Stability Report Summary: Data not found (Jan-26)
        """
        
        result = self.json_tool._run(existing_json, new_data)
        result_data = json.loads(result)
        
        # Check that interest rate was added
        assert len(result_data["economic_indicators"]["interest_rate"]) == 1
        assert result_data["economic_indicators"]["interest_rate"][0]["value"] == "4.0%"
        
        # Check that "Data not found" was NOT added to financial stability report
        fsr_entries = result_data["report_summaries"]["financial_stability_report"]
        assert len(fsr_entries) == 1  # Should still only have the original entry
        assert fsr_entries[0]["summary"] == "Previous valid report content"
        assert fsr_entries[0]["month_period"] == "Jun-25"

    def test_legacy_data_migration(self):
        """Test migration of legacy data structures to current format."""
        # Legacy data without proper date fields
        legacy_json = json.dumps({
            "metadata": {"updated_at": "2025-01-01", "created_at": "2025-01-01"},
            "economic_indicators": {
                "interest_rate": [{"month_period": "Dec-25", "value": "3.75%"}],
                "cpih_mom": [{"month_period": "Nov-25", "value": "-0.1%"}]
            },
            "report_summaries": {
                "monetary_policy_report": [
                    {"summary": "Rate cut to 3.75% (Dec-25)"},
                    {"summary": "Previous policy decision"}
                ]
            }
        })
        
        # New data to merge
        new_data = """
        - Interest Rate: 4.0% (Jan-26)
        - Monetary Policy Report Summary: New policy update (Jan-26)
        """
        
        result = self.json_tool._run(legacy_json, new_data)
        result_data = json.loads(result)
        
        # Check that legacy data was migrated with date_published
        interest_rate_entries = result_data["economic_indicators"]["interest_rate"]
        assert any(entry.get("date_published") == "2025-12-01" for entry in interest_rate_entries)
        
        # Check that legacy summaries were migrated with proper fields
        mpr_entries = result_data["report_summaries"]["monetary_policy_report"]
        assert any(entry.get("month_period") == "Dec-25" for entry in mpr_entries)
        assert any(entry.get("summary") == "Rate cut to 3.75%" for entry in mpr_entries)
        
        # Check that new data was added
        assert any(entry.get("value") == "4.0%" for entry in interest_rate_entries)

    def test_json_input_format(self):
        """Test that the tool can handle JSON input format (not just bullet points)."""
        # JSON format input (updated for new time-series structure)
        new_data_json = {
            "economic_indicators": {
                "interest_rate": [
                    {"value": "3.75%", "date_published": "2025-12-01", "month_period": "Dec-25"}
                ],
                "cpih_mom": [
                    {"value": "-0.1%", "date_published": "2025-12-01", "month_period": "Dec-25"}
                ],
                "gdp_mom": [
                    {"value": "-0.1%", "date_published": "2025-12-01", "month_period": "Dec-25"}
                ]
            },
            "report_summaries": {
                "monetary_policy_report": [
                    {
                        "summary": "The Monetary Policy Committee voted unanimously to maintain the Bank Rate at 3.75%",
                        "report_date": "2025-12-01",
                        "month_period": "Dec-25"
                    }
                ]
            }
        }
        
        result = self.json_tool._run(self.empty_json, json.dumps(new_data_json))
        parsed_result = json.loads(result)
        
        # Verify the data was merged correctly
        assert len(parsed_result["economic_indicators"]["interest_rate"]) == 1
        assert parsed_result["economic_indicators"]["interest_rate"][0]["value"] == "3.75%"
        assert parsed_result["economic_indicators"]["interest_rate"][0]["month_period"] == "Dec-25"
        
        assert len(parsed_result["economic_indicators"]["cpih_mom"]) == 1
        assert parsed_result["economic_indicators"]["cpih_mom"][0]["value"] == "-0.1%"
        
        assert len(parsed_result["economic_indicators"]["gdp_mom"]) == 1
        assert parsed_result["economic_indicators"]["gdp_mom"][0]["value"] == "-0.1%"
        
        assert len(parsed_result["report_summaries"]["monetary_policy_report"]) == 1
        assert "Committee voted unanimously" in parsed_result["report_summaries"]["monetary_policy_report"][0]["summary"]