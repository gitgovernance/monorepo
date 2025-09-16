---
inclusion: always
---

# Project Structure & Development Rules

Monorepo organization, package responsibilities, and mandatory conventions for GitGovernance development.

## Package Architecture: Three-Layer Open Core

```
packages/
├── protocol/     # Open Source: JSON schemas
├── core/         # Open Source: Business logic SDK with adapters
└── cli/          # Free: Local-first command interface
```

## Core Package Structure & Rules

### `packages/core/` - Business Logic Engine

**Directory Structure (MANDATORY)**:

```
src/
├── adapters/     # Domain logic: BacklogAdapter, IdentityAdapter, ProjectAdapter
├── modules/      # Technical capabilities: CryptoModule, EventBusModule
├── store/        # Generic persistence: RecordStore<T>
├── validation/   # JSON Schema validators with AJV
├── types/        # TypeScript interfaces
├── factories/    # Record creation functions
└── index.ts      # Barrel exports
```

**Adapter Rules**:

- Use `RecordStore<T>` for ALL persistence - never direct `fs` operations.
- Cross-adapter communication ONLY via `EventBus` - no direct method calls.
- **Throw typed exceptions** for fallible operations (e.g., `DetailedValidationError`).
- Validate inputs using JSON schemas with AJV.

### `packages/cli/` - Command Interface

**Directory Structure**:

```
src/
├── commands/     # CLI command implementations
├── components/   # Reusable Ink (React CLI) components
├── services/     # Shared logic and dependency injection
└── index.ts
```

**CLI Rules**:

- Must work offline-first with local `.gitgov/` directory
- Use Commander.js for command structure
- Use Ink for interactive interfaces

## File Organization Rules

### `.gitgov/` Directory Structure

```
.gitgov/
├── records/
│   ├── tasks/        # TaskRecord JSON files
│   ├── actors/       # ActorRecord JSON files
│   ├── executions/   # ExecutionRecord JSON files
│   ├── projects/     # ProjectRecord JSON files
│   └── feedback/     # FeedbackRecord JSON files
├── index.json        # Cached aggregated view for performance
└── config.json       # Local configuration
```

### Naming Conventions (MANDATORY)

- **Record Types**: PascalCase (`TaskRecord`, `ActorRecord`, `ProjectRecord`)
- **Record IDs**: Type-prefixed (`task:123`, `actor:user-456`, `project:my-app`)
- **File Names**: kebab-case (`task-123.json`, `backlog-adapter.ts`)
- **Directories**: snake_case (`event_bus_module/`, `record_store/`)
- **Adapters**: `{domain}_adapter` (`backlog_adapter`, `identity_adapter`)

### Import/Export Rules

- Use barrel exports in `index.ts` files
- Package imports: `import { BacklogAdapter } from '@gitgov/core'`
- Internal imports: `import { RecordStore } from '../store'`
- No circular dependencies between packages

## Development Commands

### Package Operations

```bash
# Run tests
pnpm --filter @gitgov/core test

# Build package
pnpm --filter @gitgov/core build

# Generate types from schemas
pnpm --filter @gitgov/core compile:types
```

### Cross-Package Dependencies (ALLOWED)

- `core` → `protocol` ✅
- `cli` → `core`, `protocol` ✅
- `platform`, `saas` → any open source package ✅
- Circular dependencies ❌

## Implementation Checklist

### New Adapter Creation

- [ ] Create protocol specification `.md` file first
- [ ] Implement using `RecordStore<T>` for persistence
- [ ] Add JSON schema validation for inputs
- [ ] Use `EventBus` for cross-adapter communication
- [ ] Return `Result<T, Error>` for fallible operations
- [ ] Add comprehensive tests
- [ ] Update adapter index exports

### New Record Type

- [ ] Define JSON schema in `packages/protocol/`
- [ ] Create TypeScript interface
- [ ] Implement factory function in `packages/core/src/factories/`
- [ ] Add to `EmbeddedMetadata` wrapper system
- [ ] Create corresponding adapter methods

### File Modification Rules

- **Protocol changes**: Require architectural review
- **Core adapters**: Maintain backward compatibility
- **CLI commands**: Preserve existing signatures
- **Commercial packages**: Version breaking changes properly
