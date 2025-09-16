# Requirements Document

## Introduction

The IndexerAdapter is a critical performance optimization component for GitGovernance that transforms distributed Records into aggregated, optimized views for fast CLI queries. It acts as a local cache engine that converts O(n) operations into O(1) lookups while maintaining data integrity and supporting graceful degradation when cache is unavailable.

The adapter serves as the bridge between raw distributed Records and the high-performance queries needed by CLI commands, implementing a three-phase evolution strategy to scale from small projects (500 records) to enterprise deployments (50,000+ records).

## Requirements

### Requirement 1

**User Story:** As a CLI user, I want fast command responses, so that I can work efficiently without waiting for data processing

#### Acceptance Criteria

1. WHEN I execute `gitgov status` with valid cache THEN the system SHALL respond in under 10ms
2. WHEN I execute `gitgov task list` with valid cache THEN the system SHALL return results in under 10ms
3. WHEN cache is available and up-to-date THEN CLI commands SHALL use cached data instead of scanning all Records
4. WHEN cache is missing or invalid THEN CLI commands SHALL fall back to direct Record scanning with graceful degradation

### Requirement 2

**User Story:** As a system administrator, I want reliable cache generation, so that the index accurately reflects the current state of all Records

#### Acceptance Criteria

1. WHEN `generateIndex()` is called THEN the system SHALL read all Records from all RecordStore instances (Task, Cycle, Feedback, Execution, Changelog, Actor)
2. WHEN generating index THEN the system SHALL delegate all mathematical calculations to MetricsAdapter
3. WHEN generating index THEN the system SHALL apply derived states according to DerivedDataProtocol
4. WHEN index generation completes THEN the system SHALL write cache to appropriate format (JSON for Phase 1, SQLite for Phase 2+)
5. WHEN index generation fails THEN the system SHALL preserve previous cache and report specific errors

### Requirement 3

**User Story:** As a developer, I want intelligent task insights, so that I can identify problematic tasks automatically

#### Acceptance Criteria

1. WHEN calculating derived states THEN the system SHALL identify stalled tasks (7+ days without activity)
2. WHEN calculating derived states THEN the system SHALL identify at-risk tasks (health score < 50)
3. WHEN calculating derived states THEN the system SHALL identify tasks needing clarification (open question feedback)
4. WHEN calculating derived states THEN the system SHALL identify blocked tasks (waiting on incomplete dependencies)
5. WHEN derived states are calculated THEN the system SHALL use MetricsAdapter for all time and health calculations

### Requirement 4

**User Story:** As a quality assurance engineer, I want data integrity validation, so that I can trust the cached information

#### Acceptance Criteria

1. WHEN `validateIntegrity()` is called THEN the system SHALL validate all Record schemas using JSON Schema validation with AJV
2. WHEN validating integrity THEN the system SHALL verify checksums for all Record payloads
3. WHEN validating integrity THEN the system SHALL verify Ed25519 cryptographic signatures for all Records using CryptoModule
4. WHEN cache exists THEN integrity validation SHALL compare cache consistency with source Records
5. WHEN integrity issues are found THEN the system SHALL report detailed errors and warnings

### Requirement 5

**User Story:** As a system user, I want automatic cache freshness detection, so that I always get current data without manual intervention

#### Acceptance Criteria

1. WHEN `isIndexUpToDate()` is called THEN the system SHALL compare cache timestamp with latest Record modification
2. WHEN checking freshness THEN the system SHALL validate git HEAD hash against cached version
3. WHEN cache is detected as stale THEN CLI commands SHALL automatically suggest regeneration
4. WHEN cache file is corrupted THEN the system SHALL detect corruption and trigger auto-regeneration
5. WHEN no cache exists THEN freshness check SHALL return false and suggest initial generation

### Requirement 6

**User Story:** As a developer, I want cache management controls, so that I can troubleshoot and maintain the indexing system

#### Acceptance Criteria

1. WHEN `invalidateCache()` is called THEN the system SHALL remove all cache files (index.json/index.db)
2. WHEN cache is invalidated THEN the system SHALL reset all timestamps and memory caches
3. WHEN cache invalidation fails THEN the system SHALL report specific cleanup errors
4. WHEN cache is manually invalidated THEN next CLI command SHALL trigger automatic regeneration

### Requirement 7

**User Story:** As a system architect, I want evolutionary scalability, so that the system can grow from small projects to enterprise scale

#### Acceptance Criteria

1. WHEN project has < 500 records THEN the system SHALL use file-based cache (Phase 1) with < 1s generation time
2. WHEN project has 500-5000 records THEN the system SHALL support SQLite cache (Phase 2) with < 2s generation time
3. WHEN project has 5000+ records THEN the system SHALL support dual index system (Phase 3) with < 5s generation time
4. WHEN migrating between phases THEN the system SHALL preserve data integrity and provide migration utilities
5. WHEN using any phase THEN the interface SHALL remain consistent through IIndexerAdapter

### Requirement 8

**User Story:** As a CLI user, I want the system to work without cache, so that I'm never blocked by indexing issues

#### Acceptance Criteria

1. WHEN cache is unavailable THEN CLI commands SHALL function by reading Records directly
2. WHEN operating without cache THEN the system SHALL display performance warnings to user
3. WHEN graceful degradation is active THEN response times MAY be slower but functionality SHALL remain complete
4. WHEN cache becomes available again THEN the system SHALL automatically resume optimized operations

### Requirement 9

**User Story:** As a system integrator, I want clean dependency injection, so that I can test and configure the adapter properly

#### Acceptance Criteria

1. WHEN creating IndexerAdapter THEN the system SHALL require MetricsAdapter as mandatory dependency via dependency injection
2. WHEN creating IndexerAdapter THEN the system SHALL require all RecordStore instances as dependencies via dependency injection
3. WHEN MetricsAdapter is unavailable THEN constructor SHALL throw descriptive error
4. WHEN dependencies are provided THEN the system SHALL validate their interfaces before proceeding
5. WHEN configuration options are provided THEN the system SHALL validate and apply cache strategy settings

### Requirement 10

**User Story:** As a performance engineer, I want detailed operation reporting, so that I can monitor and optimize system performance

#### Acceptance Criteria

1. WHEN `generateIndex()` completes THEN the system SHALL return IndexGenerationReport with timing metrics
2. WHEN reporting generation results THEN the system SHALL include records processed, metrics calculated, and cache size
3. WHEN operations have performance issues THEN reports SHALL include breakdown of read/calculation/write times
4. WHEN errors occur during operations THEN reports SHALL include specific error messages and context
5. WHEN validation runs THEN the system SHALL provide IntegrityReport with detailed scan results