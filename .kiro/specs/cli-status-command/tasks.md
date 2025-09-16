# Implementation Plan

This plan outlines the implementation of the `gitgov status` command, focusing on its role as a multi-adapter data consumer and renderer.

- [x] 1. Set up StatusCommand class structure and dependencies
  - Create `StatusCommand` class in `packages/cli/src/commands/status.ts`
  - Integrate with Commander.js for CLI argument parsing
  - Inject adapter dependencies: `IndexerAdapter`, `BacklogAdapter`, `MetricsAdapter`, `FeedbackAdapter`, `IdentityAdapter`
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 2. Implement cache-first data access pattern
  - Create `ensureCacheUpToDate` method to verify and refresh IndexerAdapter cache
  - Implement fallback logic for direct adapter calls when cache is unavailable
  - Add performance warning display when cache fallback is used
  - _Requirements: 3.1, 3.2_

- [x] 3. Build personal dashboard data aggregation
  - Implement `getPersonalWorkSummary` method to fetch current actor's assigned tasks
  - Integrate with `FeedbackAdapter` to retrieve pending feedback for current actor
  - Create `generateSuggestedActions` logic based on actor's current work state
  - _Requirements: 1.1, 2.1_

- [x] 4. Build global dashboard data aggregation
  - Implement `getSystemOverview` method to fetch project-wide task and cycle data
  - Add conditional logic to include `ProductivityMetrics` and `CollaborationMetrics` based on flags
  - Integrate system health scoring and alert generation
  - _Requirements: 1.2, 2.2, 2.3_

- [x] 5. Create personal dashboard rendering system
  - Implement `renderPersonalDashboard` method with formatted task lists and suggested actions
  - Create helper functions for consistent status icons and color coding
  - Format pending feedback and active cycles in user-friendly display
  - _Requirements: 1.1, 2.1_

- [x] 6. Create global dashboard rendering system
  - Implement `renderGlobalDashboard` method with project-wide statistics
  - Display system health score and critical alerts prominently
  - Format productivity and collaboration metrics when requested via flags
  - _Requirements: 1.2, 2.2, 2.3_

- [x] 7. Implement CLI flag handling and consistency
  - Add support for `--all`, `--health`, `--team`, `--json`, `--verbose` flags
  - Ensure JSON output format for programmatic consumption
  - Implement consistent error messaging and user guidance
  - _Requirements: 3.3_

- [x] 8. Build comprehensive error handling system
  - Handle project not initialized scenario with helpful guidance
  - Manage actor not configured cases with setup instructions
  - Implement graceful degradation when optional adapters fail
  - Add clear error messages for network/IO issues
  - _Requirements: 3.2, 3.3_

- [x] 9. Create comprehensive test suite
  - Write unit tests for all data aggregation methods with mocked adapters
  - Create integration tests for end-to-end command execution
  - Add performance tests to validate <200ms response time requirement
  - Test error handling paths and graceful degradation scenarios
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_
