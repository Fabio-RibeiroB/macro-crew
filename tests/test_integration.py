"""
Integration tests for the complete JSON Report System workflow.
Tests end-to-end functionality from data input to JSON output.
"""

import json
import os
import tempfile
import pytest
from unittest.mock import patch, MagicMock
from uk_macro_crew.crew import UkMacroCrew
from uk_macro_crew.tools.json_tool import JSONTool
from uk_macro_crew.utils import load_json_report, save_json_hook


class TestIntegration:
    """Integration test cases for the complete JSON Report System."""

    def setup_method(self):
        """Set up test fixtures."""
        self.sample_research_output = """
        Based on my research, here are the latest UK macroeconomic indicators:

        - Interest Rate: 5.25% (Jan-24)
        - CPIH +/- MoM: +0.4% (Jan-24)
        - GDP +/- MoM: +0.2% (Jan-24)
        - Monetary Policy Report Summary: The Monetary Policy Committee voted to maintain the Bank Rate at 5.25%. Inflation has continued to fall and is expected to decline further. (Jan-24)
        - Financial Stability Report Summary: The UK banking system remains resilient with strong capital and liquidity positions. (Jan-24)
        """

    def test_complete_workflow_new_file(self):
        """Test complete workflow starting with no existing JSON file."""
        with tempfile.TemporaryDirectory() as temp_dir:
            json_file = os.path.join(temp_dir, "research_report.json")
            
            with patch('uk_macro_crew.utils.get_json_filename', return_value=json_file):
                # Step 1: Load JSON report (should create empty structure)
                initial_json = load_json_report()
                parsed_initial = json.loads(initial_json)
                
                assert "metadata" in parsed_initial
                assert "economic_indicators" in parsed_initial
                assert "report_summaries" in parsed_initial
                assert parsed_initial["economic_indicators"]["interest_rate"] == []
                assert parsed_initial["economic_indicators"]["cpih_mom"] == []
                assert parsed_initial["economic_indicators"]["gdp_mom"] == []
                
                # Step 2: Process data with JSON tool
                json_tool = JSONTool()
                result_json = json_tool._run(initial_json, self.sample_research_output)
                
                # Step 3: Verify JSON structure matches design specification
                parsed_result = json.loads(result_json)
                
                # Verify metadata
                assert parsed_result["metadata"]["updated_at"] != ""
                
                # Verify economic indicators (time-series structure)
                assert "interest_rate" in parsed_result["economic_indicators"]
                assert "cpih_mom" in parsed_result["economic_indicators"]
                assert "gdp_mom" in parsed_result["economic_indicators"]
                
                # Verify time-series arrays have data
                assert len(parsed_result["economic_indicators"]["interest_rate"]) == 1
                assert len(parsed_result["economic_indicators"]["cpih_mom"]) == 1
                assert len(parsed_result["economic_indicators"]["gdp_mom"]) == 1
                
                # Verify values in time-series entries
                interest_entry = parsed_result["economic_indicators"]["interest_rate"][0]
                cpih_entry = parsed_result["economic_indicators"]["cpih_mom"][0]
                gdp_entry = parsed_result["economic_indicators"]["gdp_mom"][0]
                
                assert interest_entry["value"] == "5.25%"
                assert interest_entry["month_period"] == "Jan-24"
                assert interest_entry["date_published"] == "2024-01-01"
                assert cpih_entry["value"] == "+0.4%"
                assert cpih_entry["month_period"] == "Jan-24"
                assert gdp_entry["value"] == "+0.2%"
                assert gdp_entry["month_period"] == "Jan-24"
                
                # Verify report summaries (time-series structure)
                assert "monetary_policy_report" in parsed_result["report_summaries"]
                assert "financial_stability_report" in parsed_result["report_summaries"]
                
                # Verify time-series arrays have data
                assert len(parsed_result["report_summaries"]["monetary_policy_report"]) == 1
                assert len(parsed_result["report_summaries"]["financial_stability_report"]) == 1
                
                # Verify summary content
                mpr_entry = parsed_result["report_summaries"]["monetary_policy_report"][0]
                fsr_entry = parsed_result["report_summaries"]["financial_stability_report"][0]
                
                assert "Committee voted" in mpr_entry["summary"]
                assert mpr_entry["month_period"] == "Jan-24"
                assert "banking system remains resilient" in fsr_entry["summary"]
                assert fsr_entry["month_period"] == "Jan-24"
                
                # Step 4: Save the result
                class MockResult:
                    def __init__(self, content):
                        self.raw = content
                
                save_json_hook(MockResult(result_json))
                
                # Step 5: Verify file was saved correctly
                assert os.path.exists(json_file)
                with open(json_file, 'r') as f:
                    saved_data = json.load(f)
                    assert len(saved_data["economic_indicators"]["interest_rate"]) == 1
                    assert saved_data["economic_indicators"]["interest_rate"][0]["value"] == "5.25%"

    def test_complete_workflow_existing_file(self):
        """Test complete workflow with existing JSON file."""
        existing_data = {
            "metadata": {"updated_at": "2023-12-01", "created_at": "2023-01-01"},
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
        
        with tempfile.TemporaryDirectory() as temp_dir:
            json_file = os.path.join(temp_dir, "research_report.json")
            
            # Create existing file
            with open(json_file, 'w') as f:
                json.dump(existing_data, f)
            
            with patch('uk_macro_crew.utils.get_json_filename', return_value=json_file):
                # Step 1: Load existing JSON report
                loaded_json = load_json_report()
                parsed_loaded = json.loads(loaded_json)
                
                # Verify existing data is loaded
                assert "interest_rate" in parsed_loaded["economic_indicators"]
                assert len(parsed_loaded["economic_indicators"]["interest_rate"]) == 1
                assert parsed_loaded["economic_indicators"]["interest_rate"][0]["value"] == "5.00%"
                
                # Step 2: Process new data (will add to time-series arrays)
                json_tool = JSONTool()
                result_json = json_tool._run(loaded_json, self.sample_research_output)
                parsed_result = json.loads(result_json)
                
                # Step 3: Verify new data is added to time-series
                # Should have both Dec-23 (5.00%) and Jan-24 (5.25%) entries
                assert len(parsed_result["economic_indicators"]["interest_rate"]) == 2
                
                # Find the Jan-24 entry (new data)
                jan_entry = next(entry for entry in parsed_result["economic_indicators"]["interest_rate"] 
                               if entry["month_period"] == "Jan-24")
                assert jan_entry["value"] == "5.25%"
                
                # Verify old data is preserved
                dec_entry = next(entry for entry in parsed_result["economic_indicators"]["interest_rate"] 
                               if entry["month_period"] == "Dec-23")
                assert dec_entry["value"] == "5.00%"
                
                # Verify new indicators were added
                assert len(parsed_result["economic_indicators"]["cpih_mom"]) == 1  # New indicator added
                assert len(parsed_result["economic_indicators"]["gdp_mom"]) == 1   # New indicator added

    def test_json_structure_validation(self):
        """Test that JSON output matches the design specification exactly."""
        json_tool = JSONTool()
        result_json = json_tool._run("", self.sample_research_output)
        parsed_result = json.loads(result_json)
        
        # Verify top-level structure
        required_keys = ["metadata", "economic_indicators", "report_summaries"]
        for key in required_keys:
            assert key in parsed_result, f"Missing required key: {key}"
        
        # Verify metadata structure
        assert "updated_at" in parsed_result["metadata"]
        assert isinstance(parsed_result["metadata"]["updated_at"], str)
        
        # Verify economic indicators structure (time-series arrays)
        assert "interest_rate" in parsed_result["economic_indicators"]
        assert "cpih_mom" in parsed_result["economic_indicators"]
        assert "gdp_mom" in parsed_result["economic_indicators"]
        
        # Check each indicator is an array with entries
        for indicator in ["interest_rate", "cpih_mom", "gdp_mom"]:
            assert indicator in parsed_result["economic_indicators"]
            assert isinstance(parsed_result["economic_indicators"][indicator], list)
            assert len(parsed_result["economic_indicators"][indicator]) > 0
            
            # Check each entry has required fields
            entry = parsed_result["economic_indicators"][indicator][0]
            assert "value" in entry
            assert "date_published" in entry
            assert "month_period" in entry
        
        # Verify report summaries structure (time-series arrays)
        assert "monetary_policy_report" in parsed_result["report_summaries"]
        assert "financial_stability_report" in parsed_result["report_summaries"]
        
        # Check each report type is an array with entries
        for report_type in ["monetary_policy_report", "financial_stability_report"]:
            assert report_type in parsed_result["report_summaries"]
            assert isinstance(parsed_result["report_summaries"][report_type], list)
            assert len(parsed_result["report_summaries"][report_type]) > 0
            
            # Check each entry has required fields
            entry = parsed_result["report_summaries"][report_type][0]
            assert "summary" in entry
            assert "report_date" in entry
            assert "month_period" in entry

    def test_file_operations_create_read_update(self):
        """Test file operations: create, read, update cycle."""
        with tempfile.TemporaryDirectory() as temp_dir:
            json_file = os.path.join(temp_dir, "test_report.json")
            
            with patch('uk_macro_crew.utils.get_json_filename', return_value=json_file):
                # Test CREATE: Load when file doesn't exist
                assert not os.path.exists(json_file)
                initial_json = load_json_report()
                parsed_initial = json.loads(initial_json)
                assert parsed_initial["economic_indicators"]["interest_rate"] == []
                
                # Test UPDATE: Add data and save
                json_tool = JSONTool()
                updated_json = json_tool._run(initial_json, "- Interest Rate: 5.25% (Jan-24)")
                
                class MockResult:
                    def __init__(self, content):
                        self.raw = content
                
                save_json_hook(MockResult(updated_json))
                
                # Test READ: Load the saved file
                assert os.path.exists(json_file)
                loaded_json = load_json_report()
                parsed_loaded = json.loads(loaded_json)
                
                assert "interest_rate" in parsed_loaded["economic_indicators"]
                assert len(parsed_loaded["economic_indicators"]["interest_rate"]) == 1
                assert parsed_loaded["economic_indicators"]["interest_rate"][0]["value"] == "5.25%"
                
                # Test UPDATE: Add more data
                more_data = "- CPIH +/- MoM: +0.4% (Jan-24)"
                final_json = json_tool._run(loaded_json, more_data)
                save_json_hook(MockResult(final_json))
                
                # Verify final state
                final_loaded = load_json_report()
                parsed_final = json.loads(final_loaded)
                
                assert "interest_rate" in parsed_final["economic_indicators"]
                assert "cpih_mom" in parsed_final["economic_indicators"]
                assert len(parsed_final["economic_indicators"]["interest_rate"]) == 1
                assert len(parsed_final["economic_indicators"]["cpih_mom"]) == 1

    def test_error_handling_malformed_data(self):
        """Test error handling for various malformed data scenarios."""
        json_tool = JSONTool()
        
        # Test with completely invalid input
        result1 = json_tool._run("", "completely invalid data format")
        parsed1 = json.loads(result1)
        assert "metadata" in parsed1  # Should still create valid structure
        
        # Test with partially valid data
        mixed_data = """
        - Interest Rate: 5.25% (Jan-24)
        - Invalid line without proper format
        - CPIH +/- MoM: +0.4% (Jan-24)
        """
        result2 = json_tool._run("", mixed_data)
        parsed2 = json.loads(result2)
        
        # Valid data should be processed, invalid data should be ignored
        assert "interest_rate" in parsed2["economic_indicators"]
        assert "cpih_mom" in parsed2["economic_indicators"]
        assert len(parsed2["economic_indicators"]["interest_rate"]) == 1
        assert len(parsed2["economic_indicators"]["cpih_mom"]) == 1
        
        # Test with corrupted JSON input
        corrupted_json = "{ invalid json structure"
        result3 = json_tool._run(corrupted_json, "- Interest Rate: 5.25% (Jan-24)")
        parsed3 = json.loads(result3)
        # Should still create valid structure and process the valid data
        assert "metadata" in parsed3
        assert "economic_indicators" in parsed3
        assert len(parsed3["economic_indicators"]["interest_rate"]) == 1
        assert parsed3["economic_indicators"]["interest_rate"][0]["value"] == "5.25%"

    def test_crew_configuration_integration(self):
        """Test that the crew is properly configured with JSON tools."""
        crew_instance = UkMacroCrew()
        
        # Test that reporting analyst has JSON tool
        reporting_agent = crew_instance.reporting_analyst()
        tool_names = [tool.name for tool in reporting_agent.tools]
        assert "JSON Update Tool" in tool_names
        
        # Test that crew can be created without errors
        crew = crew_instance.crew()
        assert crew is not None
        assert len(crew.agents) == 2  # researcher and reporting_analyst
        assert len(crew.tasks) == 2   # research_task and reporting_task

    def test_multiple_time_periods_integration(self):
        """Test handling of data with multiple time periods preserves historical data."""
        multi_period_data = """
        - Interest Rate: 5.00% (Dec-23)
        - Interest Rate: 5.25% (Jan-24)
        - Interest Rate: 5.50% (Feb-24)
        - CPIH +/- MoM: +0.3% (Dec-23)
        - CPIH +/- MoM: +0.4% (Jan-24)
        - CPIH +/- MoM: +0.2% (Feb-24)
        - Monetary Policy Report Summary: December report summary (Dec-23)
        - Monetary Policy Report Summary: February report summary (Feb-24)
        """
        
        json_tool = JSONTool()
        result_json = json_tool._run("", multi_period_data)
        parsed_result = json.loads(result_json)
        
        # Verify all time periods are preserved in chronological order
        assert len(parsed_result["economic_indicators"]["interest_rate"]) == 3
        assert len(parsed_result["economic_indicators"]["cpih_mom"]) == 3
        assert len(parsed_result["report_summaries"]["monetary_policy_report"]) == 2
        
        # Verify chronological ordering
        interest_rates = parsed_result["economic_indicators"]["interest_rate"]
        assert interest_rates[0]["month_period"] == "Dec-23"
        assert interest_rates[0]["value"] == "5.00%"
        assert interest_rates[1]["month_period"] == "Jan-24"
        assert interest_rates[1]["value"] == "5.25%"
        assert interest_rates[2]["month_period"] == "Feb-24"
        assert interest_rates[2]["value"] == "5.50%"
        
        # Verify report summaries are preserved
        reports = parsed_result["report_summaries"]["monetary_policy_report"]
        assert reports[0]["month_period"] == "Dec-23"
        assert "December report summary" in reports[0]["summary"]
        assert reports[1]["month_period"] == "Feb-24"
        assert "February report summary" in reports[1]["summary"]