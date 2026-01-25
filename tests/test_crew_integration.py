"""
Integration tests for the UK Macro Crew system.
Tests the basic crew setup and configuration.
"""

import pytest
from unittest.mock import patch, MagicMock
from uk_macro_crew.crew import UkMacroCrew


class TestCrewIntegration:
    """Integration test cases for the UK Macro Crew system."""

    def test_crew_initialization(self):
        """Test that the crew can be initialized properly."""
        crew_instance = UkMacroCrew()
        
        # Test that agents are created
        researcher = crew_instance.researcher()
        reporting_analyst = crew_instance.reporting_analyst()
        
        assert researcher is not None
        assert reporting_analyst is not None
        assert hasattr(researcher, 'role')
        assert hasattr(reporting_analyst, 'role')

    def test_crew_tasks_initialization(self):
        """Test that tasks are created properly."""
        crew_instance = UkMacroCrew()
        
        research_task = crew_instance.research_task()
        reporting_task = crew_instance.reporting_task()
        
        assert research_task is not None
        assert reporting_task is not None
        assert hasattr(research_task, 'description')
        assert hasattr(reporting_task, 'description')

    def test_crew_creation(self):
        """Test that the crew can be created with agents and tasks."""
        crew_instance = UkMacroCrew()
        crew = crew_instance.crew()
        
        assert crew is not None
        assert hasattr(crew, 'agents')
        assert hasattr(crew, 'tasks')
        assert len(crew.agents) == 2  # researcher and reporting_analyst
        assert len(crew.tasks) == 2   # research_task and reporting_task

    @patch.dict('os.environ', {'EXA_API_KEY': 'test_key', 'OPENAI_API_KEY': 'test_key'})
    def test_crew_with_environment_variables(self):
        """Test crew initialization with environment variables."""
        crew_instance = UkMacroCrew()
        crew = crew_instance.crew()
        
        # Should not raise any exceptions
        assert crew is not None

    def test_save_report_hook(self):
        """Test the save report hook functionality."""
        crew_instance = UkMacroCrew()
        
        # Mock result with JSON content
        mock_result = MagicMock()
        mock_result.raw = '{"metadata": {"generated_at": "2026-01-11T10:30:00Z", "last_updated": "2026-01-11T10:30:00Z"}}'
        
        # Should not raise an exception
        with patch('uk_macro_crew.crew.save_json_hook') as mock_save:
            crew_instance.save_report(mock_result)
            mock_save.assert_called_once_with(mock_result)