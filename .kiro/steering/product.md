---
inclusion: always
---

# Product Vision & Development Guidelines

GitGovernance is an AI-first operating system designed to orchestrate high-impact collaboration between humans and AI agents. It provides a universal language and a trusted infrastructure for the new AI-driven economy, built on the timeless principles of Git.

## Core Product Principles

When developing features or writing code, always align with these foundational principles:

### 1. AI-First = Protocol + Code

- **Rule**: Every component must be defined as a formal, LLM-readable protocol before implementation
- **Implementation**: Create `.md` specification files before writing code
- **Validation**: All APIs and adapters must have corresponding protocol documentation

### 2. Immutable by Design

- **Rule**: All records are append-only and cryptographically signed
- **Implementation**: Use `EmbeddedMetadata` wrapper for all `GitGovRecord` types
- **Validation**: Never modify existing records; create new versions with references to predecessors

### 3. Git as Source of Truth

- **Rule**: The `.gitgov/` directory contains the complete governance ledger
- **Implementation**: All persistence goes through `RecordStore<T>` abstraction
- **Validation**: Records must be committable to Git and human-readable as JSON

## Architecture Layers & Licensing

### Open Source Foundation (MPL-2.0)

- `packages/protocol/`: Immutable schemas and governance rules
- `packages/core/`: Business logic SDK with domain adapters
- `packages/blueprints/`: Strategic documentation and specifications

### Free Adoption Layer (Apache 2.0)

- `packages/cli/`: Local-first command-line interface

### Commercial Layer (BSL 1.1)

- `packages/platform/`: Agent orchestration backend
- `packages/saas/`: Collaborative web dashboard and APIs

## Development Conventions

### Record Types & Naming

- Use PascalCase for record types: `TaskRecord`, `ActorRecord`, `ExecutionRecord`
- Prefix IDs with type: `task:`, `actor:`, `execution:`
- File names use kebab-case: `task-123.json`, `actor-user-456.json`

### Adapter Pattern

- Each business domain has one adapter: `BacklogAdapter`, `IdentityAdapter`
- Adapters orchestrate modules and handle cross-cutting concerns
- Use `EventBus` for inter-adapter communication, never direct method calls

### Error Handling

- Throw typed exceptions for operations that can fail (e.g., `DetailedValidationError`).
- Validate all inputs using JSON Schema with AJV.
- Provide meaningful error messages that guide users toward resolution.

### Security Requirements

- All signatures use Ed25519 cryptography
- Sign digest strings, not raw payloads: `<payloadChecksum>:<keyId>:<role>:<timestamp>`
- Private keys never stored in Git; use `git config --local` for key paths
- Verify both payload integrity (SHA-256) and signature authenticity

## Target User Context

Primary user "Alex" - AI-first tech lead who needs:

- **Governance over productivity**: Audit trails matter more than task completion
- **Hybrid team coordination**: Seamless human-AI collaboration
- **Cryptographic trust**: Verifiable accountability for all actions
- **Local-first workflow**: Works offline, syncs when connected

## Quality Standards

### Code Quality

- TypeScript strict mode with no `any` types
- 100% test coverage for core business logic
- All tests mapped to formal requirements (EARS format)
- Use manual mocks for explicit dependency management

### Documentation

- Every adapter needs a README with usage examples
- Protocol changes require blueprint updates
- API documentation generated from TypeScript interfaces
- Include migration guides for breaking changes

### Performance

- Local operations must work offline
- Use `.gitgov/index.json` cache for read operations
- Lazy load modules and validate schemas once at startup
- Optimize for developer workflow speed over absolute performance
