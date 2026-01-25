# Implementation Plan: Simple Report Generation

## Overview

This implementation plan transforms the UK Macro Crew from a complex time-series system to a streamlined current snapshot generator. The approach focuses on simplifying data structures, removing chronological processing, and implementing direct file overwrite behavior while maintaining robust search capabilities and error handling.

## Tasks

- [x] 1. Create simplified JSON tool for current data only
  - Replace the complex time-series JSONTool with SimpleJSONTool
  - Implement simple key-value data structure without arrays
  - Add direct data replacement logic (no merging)
  - Include metadata generation with timestamps
  - _Requirements: 3.1, 3.2, 3.4, 3.6, 4.1, 4.2, 4.4_

- [ ]* 1.1 Write property test for simple JSON structure
  - **Property 5: Simple structure enforcement**
  - **Validates: Requirements 3.1, 3.3, 4.2, 4.4, 5.1, 5.3**

- [ ]* 1.2 Write property test for single value per indicator
  - **Property 7: Single value per indicator**
  - **Validates: Requirements 3.4, 3.6**

- [ ]* 1.3 Write property test for metadata inclusion
  - **Property 6: Metadata inclusion**
  - **Validates: Requirements 3.2**

- [ ] 2. Update agent configurations for simplified workflow
  - [x] 2.1 Update researcher agent configuration
    - Modify agents.yaml to focus on current data only
    - Remove time-series references from backstory
    - Update goal to emphasize latest data retrieval
    - _Requirements: 8.1, 8.2, 8.4_
  
  - [x] 2.2 Update reporting analyst agent configuration
    - Modify agents.yaml to focus on current snapshot generation
    - Remove time-series compilation references
    - Update tool assignment to use SimpleJSONTool
    - _Requirements: 8.1, 8.2, 8.4_

- [ ] 3. Update task configurations for current data focus
  - [x] 3.1 Update research task configuration
    - Modify tasks.yaml to focus on single latest data point per indicator
    - Simplify expected output format (remove month-year formatting)
    - Maintain current search strategies and source prioritization
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 7.1, 7.2, 7.3_
  
  - [x] 3.2 Update reporting task configuration
    - Remove existing JSON report loading from task description
    - Implement direct overwrite approach in task definition
    - Simplify output structure requirements
    - Update expected output to match new simple JSON format
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ]* 3.3 Write property test for official source prioritization
  - **Property 10: Official source prioritization**
  - **Validates: Requirements 7.3**

- [x] 4. Implement current data extraction logic
  - Create CurrentDataExtractor class for processing search results
  - Implement logic to select most recent data when multiple points found
  - Add publication date capture for all economic indicators
  - Add report date capture for all report summaries
  - Implement graceful handling of missing data with "not available" status
  - _Requirements: 1.4, 1.5, 1.6, 2.3, 2.4, 2.5, 6.1, 6.2_

- [ ]* 4.1 Write property test for most recent data selection
  - **Property 1: Most recent data selection**
  - **Validates: Requirements 1.4**

- [ ]* 4.2 Write property test for unavailable data handling
  - **Property 2: Unavailable data handling**
  - **Validates: Requirements 1.5, 2.4, 6.1, 6.2**

- [ ]* 4.3 Write property test for publication date inclusion
  - **Property 3: Publication date inclusion**
  - **Validates: Requirements 1.6, 2.5, 3.5, 3.7**

- [ ]* 4.4 Write property test for report summary generation
  - **Property 4: Report summary generation**
  - **Validates: Requirements 2.3**

- [ ] 5. Update utility functions for simplified workflow
  - [x] 5.1 Modify load_json_report function
    - Remove complex JSON loading logic
    - Implement simple current report loading or empty structure
    - Remove time-series structure validation
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x] 5.2 Update save_json_hook function
    - Implement direct file overwrite behavior
    - Remove backup file creation logic
    - Simplify JSON validation for new structure
    - Add metadata timestamp updates
    - _Requirements: 4.1, 4.2, 4.3_

- [ ]* 5.3 Write property test for file overwrite behavior
  - **Property 8: File overwrite behavior**
  - **Validates: Requirements 4.1, 4.3**

- [x] 6. Update blank report template
  - Replace knowledge/blank_report.json with simplified structure
  - Remove time-series arrays from template
  - Add new simple current data structure
  - Include proper metadata fields
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [x] 7. Checkpoint - Test core functionality
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement error handling for simplified system
  - [x] 8.1 Add error handling for missing indicators
    - Implement graceful degradation when indicators not found
    - Ensure system continues with partial data
    - Add appropriate "not available" status in output
    - _Requirements: 6.1, 6.3, 6.4_
  
  - [x] 8.2 Add error handling for missing reports
    - Implement graceful handling when reports not found
    - Ensure system continues with available data
    - Add appropriate "not available" status for reports
    - _Requirements: 6.2, 6.3, 6.4_
  
  - [x] 8.3 Simplify JSON processing error handling
    - Remove time-series validation error handling
    - Add simple JSON structure validation
    - Implement fallback to empty structure on errors
    - _Requirements: 5.1, 5.2, 5.3_

- [ ]* 8.4 Write property test for partial data resilience
  - **Property 9: Partial data resilience**
  - **Validates: Requirements 6.3, 6.4**

- [x] 9. Update main entry point for simplified execution
  - Modify main.py to remove time-series complexity
  - Update input preparation for simplified workflow
  - Maintain current error handling and reliability features
  - Ensure faster execution compared to time-series approach
  - _Requirements: 5.5, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 10. Integration and final testing
  - [x] 10.1 Wire all components together
    - Connect SimpleJSONTool to reporting agent
    - Integrate CurrentDataExtractor with research workflow
    - Connect updated utility functions to main execution flow
    - _Requirements: 8.3_
  
  - [x]* 10.2 Write integration tests for end-to-end workflow
    - Test complete execution from search to file output
    - Verify simplified data flow works correctly
    - Test error scenarios and partial data handling
    - _Requirements: 6.3, 6.4, 7.5_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The simplified approach should result in significantly faster execution times
- All existing error handling and reliability features are preserved
- The system maintains compatibility with current environment variable configuration