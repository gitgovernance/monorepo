---
inclusion: fileMatch
fileMatchPattern:
  ["packages/core/src/adapters/**/*.ts", "packages/cli/src/**/*.ts"]
---

# API Design Standards

Mandatory conventions for all APIs in `@gitgov/core` and `@gitgov/cli`. Follow these patterns for consistency, type safety, and predictable error handling.

## Adapter Pattern - Domain Boundaries

**MANDATORY**: All business logic goes through domain-specific adapters. Never access stores or factories directly from outside `@gitgov/core`.

```typescript
// ✅ Correct - Use adapters
const backlogAdapter = new BacklogAdapter(dependencies);
const newTask = await backlogAdapter.createTask(taskInput);

// ❌ Wrong - Direct store access
const taskStore = new RecordStore<TaskRecord>("tasks");
await taskStore.write(task);
```

**Adapter Responsibilities**:

- `IdentityAdapter`: `ActorRecord`, `AgentRecord` management and authentication
- `BacklogAdapter`: `TaskRecord`, `CycleRecord` lifecycle and status management
- `ProjectAdapter`: Project configuration and metadata
- `ExecutionAdapter`: `ExecutionRecord` tracking and audit trails
- `FeedbackAdapter`: `FeedbackRecord` collection and analysis

## Method Signature Standards

**Return Types**: All fallible operations **must** be `async` and return a `Promise` that resolves to the expected type on success or **throws a typed error** on failure.

```typescript
// ✅ Correct - Throws typed exceptions
async createTask(input: TaskInput): Promise<TaskRecord> {
  // 1. The adapter DOES NOT validate directly. It delegates to the factory.
  // The factory is responsible for validation and applying defaults.
  const validatedPayload = await createTaskRecord(input);

  // 2. The adapter's job is to handle orchestration:
  // signing, persisting, and emitting events.
  const signedRecord = await this.crypto.sign(validatedPayload, this.actorId);
  const task = await this.taskStore.write(signedRecord);

  this.eventBus.publish('task.created', { taskId: task.id });

  return task;
}

// ❌ Wrong - Returning generic results or errors
async createTask(input: TaskInput): Promise<Result<TaskRecord, Error>> {
  // This is not our pattern.
}
```

**Parameter Conventions**:

- Single primitive parameters: `getTask(taskId: string)`
- Multiple parameters: Use object `createTask(input: TaskInput)`
- Optional parameters: Use partial types `updateTask(taskId: string, updates: Partial<TaskInput>)`

**Method Naming**:

- `get{Record}(id)`: Retrieve single record by ID
- `list{Records}(filters?)`: Retrieve multiple records with optional filtering
- `create{Record}(input)`: Create new record with validation
- `update{Record}(id, updates)`: Update existing record
- `delete{Record}(id)`: Soft delete (mark as inactive)
- `validate{Record}Input(data)`: Validate input against schema

## Error Handling - Typed Exceptions

**MANDATORY**: Use typed error classes, never generic `Error`. Consumers should use `try/catch` blocks.

```typescript
// Core error types (import from @gitgov/core)
import {
  DetailedValidationError,
  RecordNotFoundError,
  SignatureVerificationError,
  ChecksumMismatchError,
  DuplicateRecordError,
} from "@gitgov/core";

// Error handling pattern
try {
  const task = await backlogAdapter.createTask(input);
  // Type-safe success value
} catch (error) {
  if (error instanceof DetailedValidationError) {
    // Handle validation errors with field-level details
    console.error("Validation failed:", error.fieldErrors);
  } else if (error instanceof RecordNotFoundError) {
    // Handle missing dependencies
    console.error("Required record not found:", error.recordId);
  }
}
```

**Error Message Standards**:

- Include actionable guidance: "Task title is required. Provide a non-empty string."
- Reference specific fields: "Invalid priority value 'urgent'. Must be one of: low, medium, high."
- Suggest resolution: "Actor 'actor:123' not found. Run 'gitgov actor create' first."

## Validation - Schema-First

**MANDATORY**: All validation uses JSON Schema with AJV. Never duplicate validation logic.

```typescript
// ✅ Correct - Use validator modules
import { validateTaskInput } from '../validation/task_validator';

async createTask(input: unknown): Promise<TaskRecord> {
  // The adapter ITSELF does not call the validator directly for creation.
  // It calls the factory, which USES the validator internally.
  // This example is conceptually correct but the implementation lives in the factory.
  const validation = validateTaskInput(input);
  if (!validation.success) {
    throw new DetailedValidationError(validation.errors);
  }

  // input is now type-safe TaskInput
  const payload = await createTaskRecord(validation.data);
  // ...
}

// ❌ Wrong - Manual validation
if (!input.title || typeof input.title !== 'string') {
  throw new Error('Title required');
}
```

**Validation Rules**:

- Validate at adapter boundaries (public methods only)
- Use compiled schemas from `SchemaValidationCache`
- Throw structured errors with field paths
- Generate TypeScript types from schemas

## Dependency Injection Pattern

**MANDATORY**: Use constructor injection for all adapter dependencies:

```typescript
export class BacklogAdapter {
  constructor(
    private taskStore: RecordStore<TaskRecord>,
    private cycleStore: RecordStore<CycleRecord>,
    private eventBus: EventBusModule,
    private validator: TaskValidator,
    private crypto: CryptoModule
  ) {
    // Subscribe to events in constructor
    this.eventBus.subscribe(
      "execution.completed",
      this.handleExecutionCompleted
    );
  }

  // Public methods use injected dependencies
  async createTask(input: TaskInput): Promise<TaskRecord> {
    // Implementation using this.taskStore, this.validator, etc.
  }
}
```

## Event-Driven Communication

**MANDATORY**: Use EventBus for cross-adapter communication:

```typescript
// ✅ Correct - Publish domain events
async createTask(input: TaskInput): Promise<TaskRecord> {
  const taskRecord = await this.taskStore.write(taskData);
  this.eventBus.publish('task.created', {
    taskId: taskRecord.id,
    projectId: taskRecord.projectId
  });
  return taskRecord;
}

// ✅ Correct - Subscribe to events
private handleExecutionCompleted = (event: ExecutionCompletedEvent) => {
  if (event.taskId) {
    // This will throw if it fails, to be caught by the event bus runner
    await this.updateTaskStatus(event.taskId, 'completed');
  }
};

// ❌ Wrong - Direct adapter calls
await this.executionAdapter.markTaskCompleted(taskId);
```

## Implementation Checklist

When creating or modifying adapter methods:

- [ ] Throw typed, specific errors for fallible operations.
- [ ] Validate inputs using JSON Schema validators at the beginning of public methods.
- [ ] Use typed error classes, never generic `Error`.
- [ ] Inject all dependencies via the constructor.
- [ ] Publish domain events to the `EventBus` after successful state changes.
- [ ] Use `RecordStore<T>` for all persistence.
- [ ] Follow established naming conventions for methods.
- [ ] Provide comprehensive error handling with actionable messages.
