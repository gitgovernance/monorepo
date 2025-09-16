# Implementation Plan

Convert the MetricsAdapter design into actionable coding tasks that implement Tier 1 and Tier 2 functionalities as a pure calculation engine.

---

- [x] 1. Set up MetricsAdapter foundation and core interfaces
  - Create `packages/core/src/adapters/metrics_adapter/` directory structure
  - Implement `IMetricsAdapter` interface with method signatures for all Tier 1 & 2 operations
  - Set up dependency injection for required and optional RecordStore instances
  - _Requirements: 1.1, 2.1, 3.1, 4.1_

- [x] 2. Implement Tier 1 core calculation functions
  - Write pure functions: `calculateTimeInCurrentStage`, `calculateStalenessIndex`, `calculateBlockingFeedbackAge`
  - Write pure functions: `calculateHealth`, `calculateBacklogDistribution`, `calculateTasksCreatedToday`
  - Ensure all functions handle edge cases gracefully (division by zero returns 0)
  - _Requirements: 1.2, 3.2, 3.4_

- [x] 3. Implement Tier 1 public API methods
  - Code `getSystemStatus()` method that orchestrates calculation functions to return `SystemStatus` object
  - Code `getTaskHealth(taskId)` method with `RecordNotFoundError` handling for invalid task IDs
  - Implement graceful degradation when optional stores (FeedbackStore, ExecutionStore) are missing
  - _Requirements: 1.1, 1.3, 3.3_

- [x] 4. Implement Tier 2 calculation functions
  - Write pure functions: `calculateThroughput`, `calculateLeadTime`, `calculateCycleTime`
  - Write pure function: `calculateActiveAgents` using ActorRecord and ExecutionRecord data
  - Ensure mathematical robustness and handle missing data gracefully
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 5. Implement Tier 2 public API methods
  - Code `getProductivityMetrics()` method returning throughput, leadTime, and cycleTime
  - Code `getCollaborationMetrics()` method returning activeAgents count
  - Implement graceful degradation for missing optional stores
  - _Requirements: 2.1, 2.2_

- [x] 6. Add error handling and architectural integrity
  - Implement `InvalidDataError` for corrupt input data scenarios
  - Add `NotImplementedError` stubs for all Tier 3 and Tier 4 placeholder methods
  - Ensure all methods behave as pure functions with no side effects
  - _Requirements: 3.2, 3.3, 3.5_

- [x] 7. Create comprehensive test suite
  - Write unit tests for all 10 pure calculation functions with edge cases
  - Write integration tests for all 4 public API methods
  - Test performance requirements: Tier 1 methods <100ms, Tier 2 methods <200ms
  - Test graceful degradation scenarios and error handling paths
  - _Requirements: 3.4, 3.5, 3.6_
