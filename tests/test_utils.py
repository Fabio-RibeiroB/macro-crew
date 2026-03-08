"""
Tests for utility functions.
Tests file operations, JSON loading/saving, and error handling.
"""

import json
import os
import tempfile
import pytest
from unittest.mock import patch
from uk_macro_crew.utils import (
    save_json_hook, 
    get_json_filename, 
    get_exa_api_key,
    load_env
)


class TestUtils:
    """Test cases for utility functions."""

    def test_get_json_filename(self):
        """Test JSON filename generation."""
        filename = get_json_filename()
        assert filename == "research_report.json"
        assert isinstance(filename, str)

    def test_get_exa_api_key(self):
        """Test EXA API key retrieval."""
        with patch.dict(os.environ, {'EXA_API_KEY': 'test_key'}):
            api_key = get_exa_api_key()
            assert api_key == 'test_key'

    def test_load_env(self):
        """Test environment loading."""
        # This should not raise an exception
        load_env()

    def test_save_json_hook_with_valid_json(self):
        """Test saving valid JSON content."""
        test_data = {
            "current_economic_indicators": {
                "interest_rate": {
                    "value": "3.75%",
                    "publication_date": "2026-02-05",
                    "next_publication_date": "2026-03-19",
                    "source": "https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate",
                },
                "cpih": {
                    "value": "-0.3%",
                    "publication_date": "2026-02-18",
                    "next_publication_date": "2026-03-25",
                    "source": "https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/january2026",
                },
                "gdp": {
                    "value": "+0.1%",
                    "publication_date": "2026-02-12",
                    "next_publication_date": "2026-03-31",
                    "source": "https://www.ons.gov.uk/economy/grossdomesticproductgdp",
                },
            },
            "current_report_summaries": {
                "monetary_policy_report": {
                    "summary": "Policy stance remains restrictive while inflation moderates.",
                    "report_date": "2026-02-05",
                    "next_publication_date": "2026-03-19",
                    "source": "https://www.bankofengland.co.uk/monetary-policy-report/2026/february-2026",
                },
                "financial_stability_report": {
                    "summary": "Banking system remains resilient with pockets of stress risk.",
                    "report_date": "2025-12-15",
                    "next_publication_date": "2026-06-15",
                    "source": "https://www.bankofengland.co.uk/financial-stability-report",
                },
            },
        }
        
        # Mock result object
        class MockResult:
            def __init__(self, content):
                self.raw = json.dumps(content)
        
        result = MockResult(test_data)
        
        with tempfile.TemporaryDirectory() as temp_dir:
            original_cwd = os.getcwd()
            try:
                os.chdir(temp_dir)
                
                # Should not raise an exception
                save_json_hook(result)
                
                # Verify file was created
                assert os.path.exists("research_report.json")
                assert os.path.exists("history_report.json")
                
                # Verify content
                with open("research_report.json", "r") as f:
                    saved_data = json.load(f)
                    assert "metadata" in saved_data
                    assert "generated_at" in saved_data["metadata"]
                    assert "last_updated" in saved_data["metadata"]
                    assert saved_data["current_economic_indicators"]["interest_rate"]["value"] == "3.75%"

                with open("history_report.json", "r") as f:
                    history_data = json.load(f)
                    entries = history_data["history"]["economic_indicators"]["interest_rate"]
                    assert len(entries) == 1
                    assert entries[0]["publication_date"] == "2026-02-05"
                    
            finally:
                os.chdir(original_cwd)

    def test_save_json_hook_with_markdown_wrapped_json(self):
        """Test saving JSON wrapped in markdown code blocks."""
        test_data = {
            "current_economic_indicators": {
                "interest_rate": {
                    "value": "3.75%",
                    "publication_date": "2026-02-05",
                    "next_publication_date": "2026-03-19",
                    "source": "https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate",
                },
                "cpih": {
                    "value": "-0.3%",
                    "publication_date": "2026-02-18",
                    "next_publication_date": "2026-03-25",
                    "source": "https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/january2026",
                },
                "gdp": {
                    "value": "+0.1%",
                    "publication_date": "2026-02-12",
                    "next_publication_date": "2026-03-31",
                    "source": "https://www.ons.gov.uk/economy/grossdomesticproductgdp",
                },
            },
            "current_report_summaries": {
                "monetary_policy_report": {
                    "summary": "Policy stance remains restrictive while inflation moderates.",
                    "report_date": "2026-02-05",
                    "next_publication_date": "2026-03-19",
                    "source": "https://www.bankofengland.co.uk/monetary-policy-report/2026/february-2026",
                },
                "financial_stability_report": {
                    "summary": "Banking system remains resilient with pockets of stress risk.",
                    "report_date": "2025-12-15",
                    "next_publication_date": "2026-06-15",
                    "source": "https://www.bankofengland.co.uk/financial-stability-report",
                },
            },
        }
        
        # Mock result object with markdown wrapping
        class MockResult:
            def __init__(self, content):
                self.raw = f"```json\n{json.dumps(content)}\n```"
        
        result = MockResult(test_data)
        
        with tempfile.TemporaryDirectory() as temp_dir:
            original_cwd = os.getcwd()
            try:
                os.chdir(temp_dir)
                
                save_json_hook(result)
                
                # Verify file was created and content is clean JSON
                with open("research_report.json", "r") as f:
                    saved_data = json.load(f)
                    assert "generated_at" in saved_data["metadata"]
                    assert saved_data["current_report_summaries"]["monetary_policy_report"]["report_date"] == "2026-02-05"
                    
            finally:
                os.chdir(original_cwd)

    def test_save_json_hook_with_invalid_json(self):
        """Test saving invalid JSON content."""
        class MockResult:
            def __init__(self, content):
                self.raw = content
        
        result = MockResult("invalid json content")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            original_cwd = os.getcwd()
            try:
                os.chdir(temp_dir)
                
                with pytest.raises(Exception, match="invalid JSON content"):
                    save_json_hook(result)
                
            finally:
                os.chdir(original_cwd)

    def test_save_json_hook_fail_closed_preserves_existing_report(self):
        """Test that invalid output never overwrites an existing valid report."""
        class MockResult:
            def __init__(self, content):
                self.raw = content

        existing_report = {"metadata": {"generated_at": "old", "last_updated": "old"}}
        existing_history = {
            "metadata": {"created_at": "old", "last_updated": "old", "version": "1.0"},
            "history": {
                "economic_indicators": {"interest_rate": [], "cpih": [], "gdp": []},
                "report_summaries": {
                    "monetary_policy_report": [],
                    "financial_stability_report": [],
                },
            },
        }
        invalid_schema_payload = {"wrong_key": {}}
        result = MockResult(json.dumps(invalid_schema_payload))

        with tempfile.TemporaryDirectory() as temp_dir:
            original_cwd = os.getcwd()
            try:
                os.chdir(temp_dir)
                with open("research_report.json", "w", encoding="utf-8") as f:
                    json.dump(existing_report, f)
                with open("history_report.json", "w", encoding="utf-8") as f:
                    json.dump(existing_history, f)

                with pytest.raises(Exception, match="schema validation failed"):
                    save_json_hook(result)

                with open("research_report.json", "r", encoding="utf-8") as f:
                    after_data = json.load(f)
                assert after_data == existing_report

                with open("history_report.json", "r", encoding="utf-8") as f:
                    after_history = json.load(f)
                assert after_history == existing_history
            finally:
                os.chdir(original_cwd)

    def test_save_json_hook_file_error(self):
        """Test save_json_hook with file system error."""
        class MockResult:
            def __init__(self, content):
                self.raw = json.dumps(content)
        
        test_data = {"test": "data"}
        result = MockResult(test_data)
        
        # Mock open to raise OSError
        with patch("builtins.open", side_effect=OSError("Permission denied")):
            with pytest.raises(Exception, match="Failed to save JSON report"):
                save_json_hook(result)

    def test_save_json_hook_normalizes_unsigned_monthly_percentages(self):
        """Test normalization of unsigned monthly percentages for cpih/gdp."""
        payload = {
            "current_economic_indicators": {
                "interest_rate": {
                    "value": "3.75%",
                    "publication_date": "2026-02-05",
                    "next_publication_date": "2026-03-19",
                    "source": "https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate",
                },
                "cpih": {
                    "value": "0.3%",
                    "publication_date": "2026-02-18",
                    "next_publication_date": "2026-03-25",
                    "source": "https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/january2026",
                },
                "gdp": {
                    "value": "0.1%",
                    "publication_date": "2026-02-12",
                    "next_publication_date": "2026-03-31",
                    "source": "https://www.ons.gov.uk/economy/grossdomesticproductgdp",
                },
            },
            "current_report_summaries": {
                "monetary_policy_report": {
                    "summary": "Policy stance remains restrictive while inflation moderates.",
                    "report_date": "2026-02-05",
                    "next_publication_date": "2026-03-19",
                    "source": "https://www.bankofengland.co.uk/monetary-policy-report/2026/february-2026",
                },
                "financial_stability_report": {
                    "summary": "Banking system remains resilient with pockets of stress risk.",
                    "report_date": "2025-12-15",
                    "next_publication_date": "2026-06-15",
                    "source": "https://www.bankofengland.co.uk/financial-stability-report",
                },
            },
        }

        class MockResult:
            def __init__(self, content):
                self.raw = json.dumps(content)

        result = MockResult(payload)

        with tempfile.TemporaryDirectory() as temp_dir:
            original_cwd = os.getcwd()
            try:
                os.chdir(temp_dir)
                save_json_hook(result)
                with open("research_report.json", "r", encoding="utf-8") as f:
                    saved_data = json.load(f)
                assert saved_data["current_economic_indicators"]["cpih"]["value"] == "+0.3%"
                assert saved_data["current_economic_indicators"]["gdp"]["value"] == "+0.1%"
            finally:
                os.chdir(original_cwd)
