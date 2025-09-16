# Implementation Plan

Convert the IndexerAdapter design into a series of actionable coding tasks that implement Phase 1 (File-Based Cache) functionality following our architectural patterns.

---

- [x] **1. Set up IndexerAdapter foundation and interfaces**
  - Create `packages/core/src/adapters/indexer_adapter/` directory structure
  - Implement `IIndexerAdapter` interface with all required methods
  - Set up dependency injection for MetricsAdapter, RecordStore instances, CryptoModule, and EventBus
  - Create typed exception classes: `IndexGenerationError`, `CacheCorruptionError`, `IntegrityValidationError`
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] **2. Implement core data models and TypeScript interfaces**
  - Create `IndexData`, `EnrichedTaskRecord`, `IndexGenerationReport`, and `IntegrityReport` interfaces
  - Implement factory functions for creating data structures with proper defaults
  - Add JSON schema definitions for all data models using AJV validation
  - Create utility functions for data transformation and serialization
  - _Requirements: 2.4, 4.1_

- [x] **3. Implement `generateIndex` method with RecordStore integration**
  - Write logic to read all records from RecordStore instances (Task, Cycle, Feedback, Execution, Changelog, Actor)
  - Integrate with MetricsAdapter to delegate all mathematical calculations
  - Implement error handling with preservation of previous cache on failure
  - Write enriched `IndexData` object to `index.json` cache file in `.gitgov/` directory
  - Return detailed `IndexGenerationReport` with timing metrics and record counts
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 10.1, 10.2_

- [x] **4. Implement derived state calculation engine**
  - Create `calculateDerivedStates` method that processes TaskRecords
  - Implement logic to identify stalled tasks (7+ days without activity)
  - Implement logic to identify at-risk tasks (health score < 50 from MetricsAdapter)
  - Implement logic to identify tasks needing clarification (open question feedback)
  - Implement logic to identify blocked tasks (waiting on incomplete dependencies)
  - Ensure all time and health calculations delegate to MetricsAdapter
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] **5. Implement `getIndexData` method with performance optimization**
  - Write logic to read and parse `index.json` cache file
  - Implement automatic freshness check before returning cached data
  - Return `null` if cache is missing, invalid, or stale to trigger graceful degradation
  - Ensure response times under 10ms for valid cache hits
  - Add error handling for corrupted cache files
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] **6. Implement cache freshness detection and management**
  - Create `isIndexUpToDate` method comparing cache timestamp with latest Record modifications
  - Implement Git HEAD hash validation against cached version
  - Create `invalidateCache` method to remove cache files and reset timestamps
  - Add automatic stale cache detection with regeneration suggestions
  - Handle cache corruption detection and auto-regeneration triggers
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

- [x] **7. Implement `validateIntegrity` method with cryptographic verification**
  - Write logic to scan all raw records from RecordStore instances
  - Implement JSON schema validation using AJV for all Record types
  - Implement SHA-256 checksum verification for all Record payloads
  - Implement Ed25519 signature verification using CryptoModule
  - Compare cache consistency with source Records when cache exists
  - Return detailed `IntegrityReport` with specific errors and warnings
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.5_

- [x] **8. Implement EventBus integration for cache invalidation**
  - Subscribe to relevant domain events (task.created, task.updated, execution.completed, etc.)
  - Implement event handlers that trigger cache invalidation when records are modified
  - Ensure event handlers are idempotent and handle errors gracefully
  - Add logging for cache invalidation events for debugging
  - _Requirements: 6.4_

- [x] **9. Implement graceful degradation support**
  - Ensure all CLI integration points handle `null` return from `getIndexData`
  - Add performance warning displays when operating without cache
  - Verify complete functionality preservation when cache is unavailable
  - Implement automatic resume of optimized operations when cache becomes available
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] **10. Implement evolutionary scalability foundation**
  - Design interface to support multiple cache strategies (file-based for Phase 1)
  - Implement configuration system for cache strategy selection
  - Ensure consistent interface through `IIndexerAdapter` regardless of backend
  - Add performance monitoring to track generation times against phase targets (<1s for Phase 1)
  - Prepare architecture for future SQLite (Phase 2) and dual index (Phase 3) implementations
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] **11. Create comprehensive test suite**
  - Write unit tests for all public methods with mocked dependencies
  - Create integration tests for complete generation → consumption → validation cycles
  - Implement performance tests validating <10ms cache hits and <1s generation times
  - Add error scenario tests for all failure modes (corrupt cache, missing dependencies, invalid records)
  - Test EventBus integration and cache invalidation flows
  - Verify cryptographic signature validation with real Ed25519 keys
  - Map all tests to specific EARS requirements for traceability
  - _Requirements: All requirements validation_

- [x] **12. Add operational monitoring and reporting**
  - Implement detailed timing breakdowns for read/calculation/write operations
  - Add memory usage monitoring during large dataset processing
  - Create performance reports with specific error messages and context
  - Add debug logging for troubleshooting cache generation and validation issues
  - Implement metrics collection for monitoring system performance in production
  - _Requirements: 10.3, 10.4_
