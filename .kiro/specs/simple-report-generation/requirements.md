# Requirements Document

## Introduction

The UK Macro Crew system will be simplified from a complex time-series historical tracking system to a streamlined current snapshot generator. The system will focus on retrieving and reporting only the most recent available UK macroeconomic data, eliminating the complexity of chronological data management and historical preservation.

## Glossary

- **System**: The UK Macro Crew multi-agent AI system
- **Researcher_Agent**: The agent responsible for searching and retrieving economic data
- **Reporting_Agent**: The agent responsible for formatting and outputting the final report
- **Current_Data**: The most recently available data point for each economic indicator
- **Report_File**: The JSON output file (research_report.json) that gets overwritten each execution
- **Economic_Indicators**: Interest Rates, CPIH inflation month-over-month, and GDP month-over-month
- **Central_Bank_Reports**: Monetary Policy Report and Financial Stability Report summaries

## Requirements

### Requirement 1: Current Data Retrieval

**User Story:** As a user, I want to get only the most recent available UK economic data, so that I can focus on current conditions without historical complexity.

#### Acceptance Criteria

1. WHEN the System executes, THE Researcher_Agent SHALL search for the most recent Interest Rate data
2. WHEN the System executes, THE Researcher_Agent SHALL search for the most recent CPIH month-over-month inflation data
3. WHEN the System executes, THE Researcher_Agent SHALL search for the most recent GDP month-over-month data
4. WHEN multiple data points are found for the same indicator, THE System SHALL select only the most recent one
5. WHEN no current data is found for an indicator, THE System SHALL mark that indicator as unavailable
6. WHEN economic data is retrieved, THE System SHALL capture the publication date of that data

### Requirement 2: Current Report Summaries

**User Story:** As a user, I want summaries of the most recent central bank reports, so that I can understand current policy context without historical tracking.

#### Acceptance Criteria

1. WHEN the System executes, THE Researcher_Agent SHALL search for the most recent Monetary Policy Report
2. WHEN the System executes, THE Researcher_Agent SHALL search for the most recent Financial Stability Report
3. WHEN a recent report is found, THE System SHALL generate a brief summary of its key points
4. WHEN no recent report is found, THE System SHALL mark that report type as unavailable
5. WHEN a report summary is generated, THE System SHALL capture the report publication date

### Requirement 3: Simple JSON Output Structure

**User Story:** As a user, I want a simple JSON structure with current data only, so that the output is easy to read and process.

#### Acceptance Criteria

1. THE System SHALL create a JSON structure containing only current data points
2. THE System SHALL include metadata with the report generation timestamp
3. THE System SHALL NOT include historical data arrays or time-series structures
4. THE System SHALL include a single value for each economic indicator
5. THE System SHALL include the publication date for each economic indicator
6. THE System SHALL include a single summary for each report type
7. THE System SHALL include the report date for each central bank report summary

### Requirement 4: File Overwrite Behavior

**User Story:** As a user, I want the system to simply overwrite the report file each time, so that I don't need to manage historical data accumulation.

#### Acceptance Criteria

1. WHEN the System completes execution, THE System SHALL overwrite the existing research_report.json file
2. THE System SHALL NOT preserve any previous report data
3. THE System SHALL NOT create backup copies of previous reports
4. THE System SHALL NOT append to existing data structures

### Requirement 5: Simplified Data Processing

**User Story:** As a developer, I want simplified data processing without chronological ordering, so that the system is faster and easier to maintain.

#### Acceptance Criteria

1. THE System SHALL NOT perform chronological sorting of data
2. THE System SHALL NOT validate date sequences or time-series consistency
3. THE System SHALL NOT merge new data with existing historical data
4. THE System SHALL process each indicator independently without cross-temporal validation
5. THE System SHALL complete execution faster than the current time-series approach

### Requirement 6: Error Handling for Current Data

**User Story:** As a user, I want graceful handling when current data is unavailable, so that the system provides useful output even with partial data.

#### Acceptance Criteria

1. WHEN an economic indicator cannot be found, THE System SHALL include a "not available" status in the output
2. WHEN a report summary cannot be generated, THE System SHALL include a "not available" status for that report
3. WHEN partial data is retrieved, THE System SHALL complete execution with available data
4. THE System SHALL NOT fail completely due to missing individual indicators
5. THE System SHALL log which indicators were successfully retrieved and which were not

### Requirement 7: Maintained Search Capabilities

**User Story:** As a user, I want the system to maintain its current search effectiveness, so that data quality remains high despite the simplified approach.

#### Acceptance Criteria

1. THE System SHALL continue using the EXA search API for data retrieval
2. THE System SHALL maintain current search query strategies for finding authoritative sources
3. THE System SHALL continue to prioritize official UK government and Bank of England sources
4. THE System SHALL validate that retrieved data represents genuine current values
5. THE System SHALL maintain current error handling and reliability features during search operations

### Requirement 8: Preserved Agent Architecture

**User Story:** As a developer, I want to maintain the current CrewAI agent structure, so that the system architecture remains familiar while simplifying data handling.

#### Acceptance Criteria

1. THE System SHALL continue using the Researcher_Agent and Reporting_Agent structure
2. THE System SHALL maintain current agent roles and responsibilities
3. THE System SHALL preserve current tool integration patterns
4. THE System SHALL maintain current configuration-driven design with YAML files
5. THE System SHALL continue using current environment variable configuration