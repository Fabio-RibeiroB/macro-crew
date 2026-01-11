"""
Tests for utility functions.
Tests file operations, JSON loading/saving, and error handling.
"""

import json
import os
import tempfile
import pytest
from unittest.mock import patch, mock_open
from uk_macro_crew.utils import (
    load_json_report, 
    save_json_hook, 
    get_json_filename, 
    get_empty_json_structure
)


class TestUtils:
    """Test cases for utility functions."""

    def test_get_json_filename(self):
        """Test JSON filename generation."""
        filename = get_json_filename()
        assert filename == "research_report.json"

    def test_get_empty_json_structure(self):
        """Test empty JSON structure generation."""
        empty_json = get_empty_json_structure()
        parsed = json.loads(empty_json)
        
        assert "metadata" in parsed
        assert "economic_indicators" in parsed
        assert "report_summaries" in parsed
        assert parsed["metadata"]["updated_at"] == ""
        assert parsed["metadata"]["created_at"] == ""
        assert parsed["economic_indicators"]["interest_rate"] == []
        assert parsed["economic_indicators"]["cpih_mom"] == []
        assert parsed["economic_indicators"]["gdp_mom"] == []
        assert parsed["report_summaries"]["monetary_policy_report"] == []
        assert parsed["report_summaries"]["financial_stability_report"] == []

    def test_load_json_report_existing_file(self):
        """Test loading existing JSON report file."""
        test_data = {
            "metadata": {"updated_at": "2024-01-01"},
            "economic_indicators": {"interest_rate": {"name": "Interest Rate", "value": "5.25%", "date_published": "2024-01-01"}},
            "report_summaries": {}
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(test_data, f)
            temp_filename = f.name
        
        try:
            with patch('uk_macro_crew.utils.get_json_filename', return_value=temp_filename):
                result = load_json_report()
                parsed_result = json.loads(result)
                
                assert parsed_result["metadata"]["updated_at"] == "2024-01-01"
                assert "interest_rate" in parsed_result["economic_indicators"]
        finally:
            os.unlink(temp_filename)

    def test_load_json_report_missing_file(self):
        """Test loading JSON report when file doesn't exist."""
        with patch('uk_macro_crew.utils.get_json_filename', return_value='nonexistent.json'):
            result = load_json_report()
            parsed_result = json.loads(result)
            
            # Should return empty structure
            assert "metadata" in parsed_result
            assert "economic_indicators" in parsed_result
            assert "report_summaries" in parsed_result

    def test_load_json_report_corrupted_file(self):
        """Test loading corrupted JSON file."""
        corrupted_content = "{ invalid json content"
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write(corrupted_content)
            temp_filename = f.name
        
        try:
            with patch('uk_macro_crew.utils.get_json_filename', return_value=temp_filename):
                result = load_json_report()
                parsed_result = json.loads(result)
                
                # Should return empty structure when JSON is corrupted
                assert "metadata" in parsed_result
                assert "economic_indicators" in parsed_result
                assert "report_summaries" in parsed_result
        finally:
            # Clean up both original and backup files
            if os.path.exists(temp_filename):
                os.unlink(temp_filename)
            # Check for backup file and clean up
            backup_files = [f for f in os.listdir(os.path.dirname(temp_filename)) 
                          if f.startswith(os.path.basename(temp_filename) + '.backup_')]
            for backup_file in backup_files:
                os.unlink(os.path.join(os.path.dirname(temp_filename), backup_file))

    def test_save_json_hook_with_raw_attribute(self):
        """Test saving JSON with result object that has raw attribute."""
        test_json = {
            "metadata": {"updated_at": ""},
            "economic_indicators": {"interest_rate": {"name": "Interest Rate", "value": "5.25%", "date_published": "2024-01-01"}},
            "report_summaries": {}
        }
        
        class MockResult:
            def __init__(self, raw_content):
                self.raw = raw_content
        
        result = MockResult(json.dumps(test_json))
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_filename = f.name
        
        try:
            with patch('uk_macro_crew.utils.get_json_filename', return_value=temp_filename):
                save_json_hook(result)
                
                # Verify file was saved correctly
                with open(temp_filename, 'r') as f:
                    saved_data = json.load(f)
                    assert "interest_rate" in saved_data["economic_indicators"]
                    # Verify timestamp was added
                    assert saved_data["metadata"]["updated_at"] != ""
        finally:
            os.unlink(temp_filename)

    def test_save_json_hook_with_output_attribute(self):
        """Test saving JSON with result object that has output attribute."""
        test_json = {
            "metadata": {"updated_at": ""},
            "economic_indicators": {},
            "report_summaries": {}
        }
        
        class MockResult:
            def __init__(self, output_content):
                self.output = output_content
        
        result = MockResult(json.dumps(test_json))
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_filename = f.name
        
        try:
            with patch('uk_macro_crew.utils.get_json_filename', return_value=temp_filename):
                save_json_hook(result)
                
                # Verify file was saved
                assert os.path.exists(temp_filename)
                with open(temp_filename, 'r') as f:
                    saved_data = json.load(f)
                    assert "metadata" in saved_data
        finally:
            os.unlink(temp_filename)

    def test_save_json_hook_with_string_result(self):
        """Test saving JSON with string result."""
        test_json_str = json.dumps({
            "metadata": {"updated_at": ""},
            "economic_indicators": {},
            "report_summaries": {}
        })
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_filename = f.name
        
        try:
            with patch('uk_macro_crew.utils.get_json_filename', return_value=temp_filename):
                save_json_hook(test_json_str)
                
                # Verify file was saved
                assert os.path.exists(temp_filename)
        finally:
            os.unlink(temp_filename)

    def test_save_json_hook_invalid_json(self):
        """Test saving invalid JSON content."""
        invalid_json = "{ invalid json content"
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_filename = f.name
        
        try:
            with patch('uk_macro_crew.utils.get_json_filename', return_value=temp_filename):
                save_json_hook(invalid_json)
                
                # Should still save the content even if it's invalid JSON
                assert os.path.exists(temp_filename)
                with open(temp_filename, 'r') as f:
                    content = f.read()
                    assert "invalid json content" in content
        finally:
            os.unlink(temp_filename)

    def test_save_json_hook_file_permission_error(self):
        """Test handling of file permission errors during save."""
        test_json = json.dumps({"test": "data"})
        
        with patch('uk_macro_crew.utils.get_json_filename', return_value='/root/readonly.json'):
            with pytest.raises(Exception) as exc_info:
                save_json_hook(test_json)
            
            assert "Failed to save JSON report" in str(exc_info.value)