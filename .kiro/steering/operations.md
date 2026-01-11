# Operations & Error Handling

## Overview

The UK Macro Crew system includes comprehensive error handling and operational controls to ensure reliable execution and prevent common failure modes like infinite loops, timeouts, and API quota exhaustion.

## Error Handling Strategy

### Built-in Safeguards

1. **Iteration Limits**
   - Each agent stops after a maximum number of iterations
   - Prevents infinite loops and runaway processes
   - Configurable via `AGENT_MAX_ITERATIONS` (default: 8)

2. **Execution Timeouts**
   - Individual agents have maximum execution time limits
   - Prevents system hangs and resource exhaustion
   - Configurable via `AGENT_MAX_EXECUTION_TIME` (default: 900 seconds = 15 minutes)

3. **Retry Logic**
   - Failed operations retry with built-in exponential backoff
   - Limited retry attempts prevent endless retry loops
   - Configurable via `AGENT_MAX_RETRIES` (default: 2)

4. **Rate Limiting**
   - Prevents API quota exhaustion and rate limit errors
   - Separate limits for individual agents and crew-wide operations
   - Configurable via `AGENT_MAX_RPM` and `CREW_MAX_RPM`

5. **Fail-Fast Mode**
   - System can stop immediately on first unrecoverable error
   - Alternatively, can continue with partial results
   - Configurable via `CREW_FAIL_FAST` (default: true)

## Configuration Profiles

### Development/Testing Profile
```bash
# Quick feedback, restrictive limits
AGENT_MAX_ITERATIONS=2
AGENT_MAX_RETRIES=1
AGENT_MAX_EXECUTION_TIME=300   # 5 minutes
AGENT_MAX_RPM=50
CREW_FAIL_FAST=true
CREW_MAX_RPM=30
```

### Production Profile
```bash
# Balanced reliability and performance
AGENT_MAX_ITERATIONS=8
AGENT_MAX_RETRIES=2
AGENT_MAX_EXECUTION_TIME=900   # 15 minutes
AGENT_MAX_RPM=150
CREW_FAIL_FAST=true
CREW_MAX_RPM=100
```

### Research Profile
```bash
# Maximum flexibility for comprehensive data collection
AGENT_MAX_ITERATIONS=10
AGENT_MAX_RETRIES=3
AGENT_MAX_EXECUTION_TIME=1800  # 30 minutes
AGENT_MAX_RPM=200
CREW_FAIL_FAST=false
CREW_MAX_RPM=150
```

## Error Scenarios & Responses

### API Rate Limits
**Problem**: Exceeding OpenAI or Exa API rate limits
**Solution**: Built-in rate limiting via `AGENT_MAX_RPM` and `CREW_MAX_RPM`
**Recovery**: Automatic backoff and retry within limits

### Search Failures
**Problem**: Exa search returns no results or fails
**Solution**: Agents provide partial results rather than complete failure
**Recovery**: Continue with available data, mark missing indicators

### Data Parsing Errors
**Problem**: Invalid or malformed economic data
**Solution**: Skip invalid data points, preserve valid ones
**Recovery**: JSON tool handles partial updates gracefully

### Network Timeouts
**Problem**: External API calls hang or timeout
**Solution**: Individual agent timeouts prevent system hangs
**Recovery**: Retry with exponential backoff up to retry limit

### Infinite Loops
**Problem**: Agent gets stuck in repetitive behavior
**Solution**: Iteration limits force termination
**Recovery**: Return best available result within iteration limit

## Monitoring & Debugging

### Execution Monitoring
```bash
# Enable verbose logging for debugging
crewai run --verbose

# Standard execution (always searches for latest data)
crewai run
```

### Log Analysis
- Agent iteration counts logged for loop detection
- Execution times tracked for performance analysis
- Retry attempts logged for reliability assessment
- Rate limit usage monitored for quota management

### Common Debug Scenarios
```bash
# Test with minimal settings
AGENT_MAX_ITERATIONS=1 AGENT_MAX_RETRIES=1 crewai run

# Test timeout behavior
AGENT_MAX_EXECUTION_TIME=60 crewai run

# Test partial failure handling
CREW_FAIL_FAST=false crewai run
```

## Operational Best Practices

### Pre-Execution Checks
1. Verify API keys are valid and have sufficient quota
2. Check network connectivity to external APIs
3. Ensure sufficient disk space for JSON report updates
4. System automatically searches for latest available data

### During Execution
1. Monitor console output for error patterns
2. Watch for repeated retry attempts indicating persistent issues
3. Check execution time against configured limits
4. Observe rate limiting behavior for API usage optimization

### Post-Execution Analysis
1. Review generated JSON report for data completeness
2. Check logs for any partial failures or warnings
3. Validate chronological ordering of time-series data
4. Assess execution time for performance optimization

### Troubleshooting Guide

**Symptom**: Execution stops after exactly 8 iterations
**Cause**: Iteration limit reached
**Solution**: Increase `AGENT_MAX_ITERATIONS` or review agent task complexity

**Symptom**: "Execution timed out" error
**Cause**: Agent exceeded maximum execution time
**Solution**: Increase `AGENT_MAX_EXECUTION_TIME` or optimize search queries

**Symptom**: "Rate limit exceeded" errors
**Cause**: API quota exhaustion
**Solution**: Reduce `AGENT_MAX_RPM` or `CREW_MAX_RPM` values

**Symptom**: Partial or missing data in JSON report
**Cause**: Search failures or data parsing issues
**Solution**: Review search terms, check data source availability

**Symptom**: System stops immediately on minor errors
**Cause**: Fail-fast mode enabled
**Solution**: Set `CREW_FAIL_FAST=false` for more resilient execution

## Performance Optimization

### Rate Limit Tuning
- Start with conservative limits and increase gradually
- Monitor API usage patterns and adjust accordingly
- Balance speed vs. reliability based on use case

### Timeout Optimization
- Shorter timeouts for development and testing
- Longer timeouts for comprehensive research periods
- Consider data source response times when setting limits

### Iteration Tuning
- Lower iterations for simple, recent data queries
- Higher iterations for complex historical research
- Monitor actual iteration usage to optimize limits

## Maintenance

### Regular Tasks
1. Review and update API keys before expiration
2. Monitor API usage patterns and adjust rate limits
3. Analyze execution logs for optimization opportunities
4. Update timeout values based on performance trends

### Configuration Updates
- Test configuration changes in development environment first
- Document configuration rationale for team knowledge
- Maintain configuration profiles for different use cases
- Regular review of error handling effectiveness