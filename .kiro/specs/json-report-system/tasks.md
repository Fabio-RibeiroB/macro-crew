# Implementation Plan: JSON Report System

## Overview

Transform the UK Macro Crew system from CSV output to structured JSON format by replacing the CSV tool with a JSON tool and updating the associated file handling and agent configurations.

## Tasks

- [x] 1. Create JSON Tool and Schema
  - Implement JSONTool class with proper input schema
  - Create JSONToolInput Pydantic model for validation
  - Implement JSON parsing and updating logic for economic indicators and report summaries
  - Handle MM-YY time period organization in JSON structure
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

- [x] 2. Update Utils Module for JSON Operations
  - Implement load_json_report() function to load existing JSON or return empty structure
  - Implement save_json_hook() function to save JSON output after crew execution
  - Remove or replace CSV-related functions with JSON equivalents
  - Add proper error handling for JSON file operations
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Update Agent Configuration
  - Modify reporting_analyst agent in agents.yaml to focus on JSON compilation
  - Update agent goal and backstory to reflect JSON output responsibility
  - Remove references to CSV functionality
  - _Requirements: 1.1, 2.1_

- [x] 4. Update Task Configuration
  - Modify reporting_task in tasks.yaml to specify JSON output requirements
  - Update expected output format to describe JSON structure
  - Ensure task description aligns with JSON processing workflow
  - _Requirements: 1.1, 1.2, 2.2_

- [x] 5. Update Crew Class
  - Replace CSVTool with JSONTool in reporting_analyst agent tools
  - Update @after_kickoff method to use save_json_hook instead of save_csv_hook
  - Remove CSV-related imports and dependencies
  - _Requirements: 1.1, 2.1, 3.3_

- [x] 6. Update Main Entry Point
  - Modify main.py to load JSON report instead of CSV report
  - Update input dictionary to include json_report parameter instead of csv_report
  - Change file handling to work with JSON files (research_report.json)
  - Create blank JSON template file in knowledge directory
  - _Requirements: 3.1, 3.2_

- [ ] 7. Integration and Testing
  - Test complete workflow from research to JSON output
  - Verify JSON structure matches design specification
  - Test file operations (create, read, update)
  - Ensure proper error handling for malformed data
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

## Notes

- Each task builds incrementally on the previous ones
- Focus on replacing CSV functionality completely with JSON
- Maintain existing CrewAI architecture and agent workflow
- Ensure proper JSON schema validation and error handling
- Test with real economic data formats to verify parsing logic