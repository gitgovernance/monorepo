---
inclusion: always
---

# Core Architectural Patterns

Mandatory patterns for `@gitgov/core` development. All new code must follow these patterns.

## 1. RecordStore Pattern - Persistence Layer

**MANDATORY**: Use `RecordStore<T>` for ALL file operations. Never use `fs` directly in adapters.

```typescript
// ✅ Correct - Use RecordStore
const taskStore = new RecordStore<TaskRecord>("tasks");
const task = await taskStore.read("task:123");
await taskStore.write(newTask);

// ❌ Wrong - Direct fs usage
import fs from "fs";
fs.writeFileSync(".gitgov/tasks/task-123.json", data);
```

**Implementation Rules**:

- Location: `packages/core/src/store/record_store.ts`
- Each adapter gets its own typed store instance.
- Store handles the `.gitgov/{type}/` directory structure.
- Automatic JSON serialization/deserialization and error handling.

## 2. EventBus Pattern - Inter-Adapter Communication

**MANDATORY**: Use `EventBus` for cross-adapter communication. No direct method calls between adapters.

```typescript
// ✅ Correct - EventBus communication
eventBus.publish("task.created", { taskId: "task:123" });
eventBus.subscribe("execution.completed", this.handleExecutionCompleted);

// ❌ Wrong - Direct adapter calls
await backlogAdapter.updateTaskStatus(taskId, "active");
```

**Implementation Rules**:

- Location: `packages/core/src/modules/event_bus_module/`
- All events are strongly typed (e.g., `TaskCreatedEvent`).
- Publish domain events after successful operations.
- Subscribe to events in adapter constructors.
- Event handlers must be idempotent.

## 3. Factory Pattern - Record Creation

**MANDATORY**: Use factory functions for all record creation. Ensures consistent defaults and validation.

```typescript
// ✅ Correct - Use factory
import { createTaskRecord } from "../factories";
const payload = await createTaskRecord({
  title: "New Task",
  priority: "high",
});

// ❌ Wrong - Manual record construction
const payload = {
  id: generateId(),
  title: "New Task",
  // Missing required fields, no validation
};
```

**Implementation Rules**:

- Location: `packages/core/src/factories/`
- One factory per record type: `createTaskRecord`, `createActorRecord`.
- Factories create the `payload` only (no cryptographic wrapper).
- Handle ID generation, defaults, and initial validation.

## 4. Adapter Pattern - Domain Boundaries

**Structure**: Each business domain gets exactly one adapter with specific responsibilities.

```typescript
// Adapter naming: {Domain}Adapter
class BacklogAdapter {
  // ✅ Domain-specific operations
  async createTask(input: TaskInput): Promise<TaskRecord>; // Throws on error
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>; // Throws on error

  // ✅ Event handling
  private handleExecutionCompleted = (event: ExecutionCompletedEvent) => {
    // React to cross-domain events
  };
}
```

**Adapter Rules**:

- Location: `packages/core/src/adapters/{domain}_adapter/`
- One adapter per domain: `BacklogAdapter`, `IdentityAdapter`, `ProjectAdapter`.
- Use dependency injection for stores and modules.
- Public methods throw typed exceptions on failure.

## 5. Validation Pattern - Input Safety

**MANDATORY**: Validate all inputs using JSON Schema with AJV. No runtime type assumptions.

```typescript
// ✅ Correct - Schema validation
import { validateTaskInput } from '../validation';

async createTask(input: unknown): Promise<TaskRecord> {
  // The adapter's primary responsibility is to orchestrate.
  // It delegates the creation and validation logic to the factory.
  const payload = await createTaskRecord(input); // createTaskRecord uses the validator internally.

  // After the factory returns a valid payload, the adapter proceeds.
  const signedRecord = await this.crypto.sign(payload, this.actorId);
  // ... persist and emit events ...
  return signedRecord.payload;
}
```

**Validation Rules**:

- Location: `packages/core/src/validation/`
- Use AJV with JSON Schema definitions.
- Validate at adapter boundaries (public methods).
- Throw `DetailedValidationError` on failure.

## Implementation Checklist

When creating new adapters or extending existing ones:

- [ ] Use `RecordStore<T>` for all persistence operations.
- [ ] Communicate via `EventBus`, never direct adapter calls.
- [ ] Create records using factory functions.
- [ ] Throw typed exceptions for fallible operations.
- [ ] Validate inputs with JSON Schema at adapter boundaries.
- [ ] Follow domain-driven adapter structure.
- [ ] Add comprehensive tests for all patterns.
