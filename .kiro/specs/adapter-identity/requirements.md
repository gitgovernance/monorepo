# Requirements Document

## Introduction

The Identity Adapter is a core component of the GitGovernance system that provides orchestration of business logic for the Identity Domain. It serves as the single public facade that exposes `ActorRecord` and `AgentRecord` operations to clients, implementing the canonical representation of the rules defined in `actor_protocol.md` and `agent_protocol.md`.

The adapter follows key design principles: domain orchestration (coordinating crypto, factory, validator, and store modules), stateless operation (pure methods or state management through RecordStore), separation of responsibilities (handling business logic while delegating specific operations to specialized modules), and cryptographic accountability (all records are immutable and cryptographically signed for audit trails).

This adapter enables the foundational trust model of GitGovernance by managing the complete lifecycle of actors (humans and agents) and their associated agent records, ensuring cryptographic accountability and succession chain integrity throughout the system.

## Requirements

### Requirement 1

**User Story:** As a CLI user, I want to create new actors in the system, so that I can establish identities for humans and agents.

#### Acceptance Criteria

1. WHEN `createActor` is called with valid payload and signer ID THEN the system SHALL generate Ed25519 key pairs automatically
2. WHEN `createActor` is called with valid data THEN the system SHALL create a complete `ActorRecord` with proper validation using JSON schema
3. WHEN `createActor` is called without required fields THEN the system SHALL throw a DetailedValidationError with specific field-level feedback
4. WHEN `createActor` is called THEN the system SHALL calculate payload checksum and add cryptographic signature for immutable audit trail

### Requirement 2

**User Story:** As a system component, I want to retrieve actor information, so that I can verify identities and permissions.

#### Acceptance Criteria

1. WHEN `getActor` is called with an existing actor ID THEN the system SHALL return the corresponding `ActorRecord`
2. WHEN `getActor` is called with a non-existent actor ID THEN the system SHALL return null
3. WHEN `listActors` is called THEN the system SHALL return an array of all existing `ActorRecords`
4. WHEN `listActors` is called and no actors exist THEN the system SHALL return an empty array

### Requirement 3

**User Story:** As an administrator, I want to revoke actors when they are compromised or no longer needed, so that I can maintain system security.

#### Acceptance Criteria

1. WHEN `revokeActor` is called with an existing actor THEN the system SHALL change the status to 'revoked'
2. WHEN `revokeActor` is called with a non-existent actor THEN the system SHALL throw an error indicating the actor was not found
3. WHEN an actor is revoked THEN the system SHALL update the payload checksum and persist the changes

### Requirement 4

**User Story:** As a system component, I want to resolve actor succession chains, so that I can find the current active actor when dealing with key rotation.

#### Acceptance Criteria

1. WHEN `resolveCurrentActorId` is called with an active actor THEN the system SHALL return the same ID
2. WHEN `resolveCurrentActorId` is called with a revoked actor that has a successor THEN the system SHALL follow the chain to the active actor
3. WHEN `resolveCurrentActorId` is called with a long succession chain THEN the system SHALL resolve the entire chain to the final active actor
4. WHEN `getEffectiveActorForAgent` is called with an agent ID THEN the system SHALL return the effective ActorRecord for that agent

### Requirement 5

**User Story:** As a platform component, I want to manage agent records, so that I can track AI agents and their capabilities in the system.

#### Acceptance Criteria

1. WHEN `createAgentRecord` is called with valid data and existing ActorRecord of type 'agent' THEN the system SHALL create a complete `AgentRecord`
2. WHEN `createAgentRecord` is called without required fields THEN the system SHALL throw a DetailedValidationError with specific field-level feedback
3. WHEN `createAgentRecord` is called without corresponding ActorRecord THEN the system SHALL throw an error indicating missing ActorRecord
4. WHEN `createAgentRecord` is called with ActorRecord of type 'human' THEN the system SHALL throw an error indicating incorrect actor type

### Requirement 6

**User Story:** As a system component, I want to retrieve agent information, so that I can understand agent capabilities and status.

#### Acceptance Criteria

1. WHEN `getAgentRecord` is called with an existing agent ID THEN the system SHALL return the corresponding `AgentRecord`
2. WHEN `getAgentRecord` is called with a non-existent agent ID THEN the system SHALL return null
3. WHEN `listAgentRecords` is called THEN the system SHALL return an array of all existing `AgentRecords`
4. WHEN `listAgentRecords` is called and no agents exist THEN the system SHALL return an empty array

### Requirement 7

**User Story:** As a future enhancement, I want advanced cryptographic operations, so that I can sign records and rotate keys securely.

#### Acceptance Criteria

1. WHEN `signRecord` is called THEN the system SHALL indicate that private key access is required
2. WHEN `rotateActorKey` is called THEN the system SHALL indicate that the operation is not yet implemented
3. WHEN `authenticate` is called THEN the system SHALL show a warning that the method is not implemented

### Requirement 8

**User Story:** As a CLI or adapter, I want to retrieve the current system actor, so that I can perform operations on behalf of the active user or agent.

#### Acceptance Criteria

1. WHEN `getCurrentActor` is called with a valid active session THEN the system SHALL return the ActorRecord from the last session after resolving any succession chain
2. WHEN `getCurrentActor` is called without a valid session THEN the system SHALL return the first active ActorRecord found in the system
3. WHEN `getCurrentActor` is called and no active actors exist THEN the system SHALL throw an error suggesting to initialize the project with `gitgov init`
