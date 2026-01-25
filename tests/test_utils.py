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
            "metadata": {
                "generated_at": "2026-01-11T10:30:00Z",
                "last_updated": "2026-01-11T10:30:00Z"
            },
            "current_economic_indicators": {
                "interest_rate": {"value": "3.75%"}
            }
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
                
                # Verify content
                with open("research_report.json", "r") as f:
                    saved_data = json.load(f)
                    assert saved_data["metadata"]["generated_at"] == "2026-01-11T10:30:00Z"
                    assert saved_data["metadata"]["last_updated"] == "2026-01-11T10:30:00Z"
                    
            finally:
                os.chdir(original_cwd)

    def test_save_json_hook_with_markdown_wrapped_json(self):
        """Test saving JSON wrapped in markdown code blocks."""
        test_data = {
            "metadata": {
                "generated_at": "2026-01-11T10:30:00Z",
                "last_updated": "2026-01-11T10:30:00Z"
            }
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
                    assert saved_data["metadata"]["generated_at"] == "2026-01-11T10:30:00Z"
                    
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
                
                # Should not raise an exception, but should save content as-is
                save_json_hook(result)
                
                # Verify file was created
                assert os.path.exists("research_report.json")
                
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