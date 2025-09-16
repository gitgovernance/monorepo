# Requirements Document

## Introduction

The changelog adapter is the **enterprise historian** of the GitGovernance system. It manages `ChangelogRecords` that document significant changes across any entity (tasks, cycles, agents, etc.) with complete context, conditional validation, and cross-entity traceability.

## Requirements

### Initiative 1: Record Creation & Validation

**User Story:** As a system administrator, I want to create comprehensive changelog records for any entity, so that I can maintain a complete and validated audit trail.

#### Acceptance Criteria

1.  WHEN `create()` is called with a valid payload, THEN the system SHALL construct, sign, persist a `ChangelogRecord` and emit a `changelog.created` event.
2.  WHEN `create()` is called with an invalid payload (e.g., missing required fields, invalid `entityType`, `changeType`, or short `title`), THEN the system SHALL throw a `DetailedValidationError`.
3.  WHEN `create()` is called for a high/critical risk change without `rollbackInstructions`, THEN the system SHALL throw a `DetailedValidationError`.
4.  WHEN `create()` is called for a `completion` change without `references.tasks`, THEN the system SHALL throw a `DetailedValidationError`.
5.  WHEN `create()` is called and an optional `entityStore` is provided, THEN the system SHALL validate the existence of the `entityId` and throw `RecordNotFoundError` if it's missing.
6.  WHEN `create()` is called with valid input, THEN the system SHALL use the `RecordStore<ChangelogRecord>` for persistence following the established patterns.

### Initiative 2: Record Query & Retrieval

**User Story:** As a system user, I want to retrieve changelog records by various criteria, so that I can analyze change history.

#### Acceptance Criteria

1.  WHEN `getChangelog()` is called with an existing ID, THEN the system SHALL return the corresponding `ChangelogRecord`.
2.  WHEN `getChangelog()` is called with a non-existent ID, THEN the system SHALL return `null`.
3.  WHEN `getChangelogsByEntity()` is called, THEN the system SHALL return a filtered array of `ChangelogRecords` for that entity.
4.  WHEN `getAllChangelogs()` is called, THEN the system SHALL return an array of all `ChangelogRecords`.
5.  WHEN `getRecentChangelogs()` is called with a limit, THEN the system SHALL return a timestamp-ordered array of the most recent records.

### Initiative 3: System Integration & Performance

**User Story:** As a developer, I want the adapter to integrate seamlessly with the ecosystem and perform efficiently.

#### Acceptance Criteria

1.  WHEN a record is created, THEN the `changelog.created` event SHALL be emitted for other adapters to consume.
2.  WHEN instantiated without optional entity stores, THEN the adapter SHALL operate gracefully without performing entity validation.
3.  WHEN any method is called, THEN it SHALL execute in under 40ms for typical datasets.

### Initiative 4: Security & Cryptographic Integrity

**User Story:** As a system administrator, I want all changelog records to be cryptographically signed and verifiable, so that I can ensure the integrity and authenticity of the audit trail.

#### Acceptance Criteria

1.  WHEN `create()` is called, THEN the system SHALL sign the record using the actor's Ed25519 private key.
2.  WHEN a record is retrieved, THEN the system SHALL verify both payload integrity (SHA-256) and signature authenticity (Ed25519).
3.  WHEN signature verification fails, THEN the system SHALL throw a `SignatureVerificationError`.
4.  WHEN the signing actor's key is not found, THEN the system SHALL throw a `ActorNotFoundError`.
