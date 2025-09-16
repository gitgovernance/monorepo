---
inclusion: always
---

# Technology & Architecture Guidelines

Core technologies, patterns, and conventions for GitGovernance development.

## Mandatory Principles

1. **Protocol-First Development**: Create `.md` specification files before writing code. All APIs must have corresponding protocol documentation.
2. **Git as Source of Truth**: All persistence uses `.gitgov/` directory structure. Records are immutable, append-only JSON files.
3. **Domain-Driven Architecture**: Use `Adapter` pattern for business domains, `Module` pattern for technical capabilities.
4. **Strict Type Safety**: TypeScript strict mode, no `any` types. Use AJV for runtime validation with JSON schemas.
5. **Local-First Design**: CLI must work offline. Use `.gitgov/index.json` for cached reads.

## Architecture Patterns

### Adapter Pattern (Business Logic)

- **Purpose**: Implement domain-specific business logic (e.g., `BacklogAdapter`, `IdentityAdapter`)
- **Location**: `packages/core/src/adapters/`
- **Rules**:
  - Must use `RecordStore<T>` for persistence, never direct `fs` operations
  - Must communicate via `EventBus`, never direct adapter method calls
  - Must validate inputs using JSON schemas with AJV

### Module Pattern (Technical Capabilities)

- **Purpose**: Provide reusable technical capabilities (e.g., `CryptoModule`, `EventBusModule`)
- **Location**: `packages/core/src/modules/`
- **Rules**: Pure functions, no side effects, stateless where possible

### EventBus Communication

- **Rule**: All cross-adapter communication MUST use EventBus pub/sub
- **Implementation**: Strongly typed events (e.g., `TaskCreatedEvent`, `ExecutionCompletedEvent`)
- **Pattern**: Adapters publish domain events, subscribe to events they need to react to

## Technology Stack

### Required Dependencies

- **Runtime**: Node.js v18+
- **Package Manager**: `pnpm` (use `pnpm --filter <package>` for workspace operations)
- **Language**: TypeScript 5.x with strict mode enabled
- **Testing**: Jest with `ts-jest`, manual mocks only
- **Validation**: AJV for JSON Schema validation
- **Cryptography**: Node.js native `crypto` module (Ed25519 + SHA-256)

### CLI-Specific Stack

- **Commands**: Commander.js for CLI structure
- **UI**: Ink (React for CLIs) for interactive interfaces
- **File Watching**: Chokidar for real-time monitoring

## Coding Conventions

### File Naming & Structure

- Use kebab-case for files: `backlog-adapter.ts`, `task-record.json`
- Use PascalCase for types: `TaskRecord`, `ActorRecord`, `ExecutionRecord`
- Prefix record IDs with type: `task:`, `actor:`, `execution:`
- Store records in `.gitgov/<type>/` directories

### TypeScript Rules

- Enable strict mode, no `any` types allowed
- Throw typed exceptions for operations that can fail.
- Implement interfaces for all public APIs
- Export types alongside implementations

### Error Handling

- Throw typed exceptions from business logic; use `try/catch` in consumers.
- Provide actionable error messages with resolution guidance
- Validate all inputs at adapter boundaries using JSON schemas

### Security Requirements

- All records use `EmbeddedMetadata` wrapper with cryptographic signatures
- Sign digest strings: `<payloadChecksum>:<keyId>:<role>:<timestamp>`
- Never store private keys in Git (use `git config --local` for key paths)
- Verify both payload integrity (SHA-256) and signature authenticity (Ed25519)

## Development Commands

### Package Operations

```bash
# Run tests for specific package
pnpm --filter @gitgov/core test

# Run CLI in development
pnpm --filter @gitgov/cli dev

# Generate types from schemas
pnpm --filter @gitgov/core compile:types
```

### Testing Requirements

- All tests must map to formal requirements (EARS format)
- Use manual mocks for explicit dependency management
- Achieve 100% coverage for core business logic
- Test both success and error paths for all adapters

## Implementation Checklist

When creating new adapters or modules:

### For New Adapters

- [ ] Create protocol specification in `.md` file first
- [ ] Implement using `RecordStore<T>` for persistence
- [ ] Add JSON schema validation for all inputs
- [ ] Use `EventBus` for cross-adapter communication
- [ ] Return `Result<T, Error>` types for fallible operations
- [ ] Add comprehensive tests with EARS requirement mapping
- [ ] Update adapter index and exports

### For New Record Types

- [ ] Define JSON schema in `packages/protocol/*/*.yaml`
- [ ] Create TypeScript interface
- [ ] Implement factory function in `packages/core/src/factories/`
- [ ] Add to `EmbeddedMetadata` wrapper system
- [ ] Create corresponding adapter methods
- [ ] Add validation tests

### For New Modules

- [ ] Keep stateless and pure where possible
- [ ] Export clear, typed interfaces
- [ ] Add unit tests for all public methods
- [ ] Document usage examples in README
