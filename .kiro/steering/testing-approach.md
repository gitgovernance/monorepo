---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.spec.ts", "**/test/**/*.ts"]
---

# Testing Standards & Requirements

Mandatory testing conventions for GitGovernance development. All tests must follow these patterns for consistency and traceability.

## Requirement Traceability (MANDATORY)

**Rule**: Every test **must** link to a unique functional requirement. The test description should clearly state the requirement it is verifying.

```typescript
// ✅ Correct - Clear link to a specific requirement
it("should create a TaskRecord with a valid signature when the actor has the correct permissions", async () => {
  // Test implementation
});

// ❌ Wrong - Vague description with no clear link to a requirement
it("should create a task", async () => {
  // Test implementation
});
```

**Implementation**:

- The test description must be specific and unambiguous.
- This creates an auditable link between the specification (what the system should do) and its verification (the test).

## Manual Mocking Strategy (MANDATORY)

**Rule**: Use explicit manual mocks, never `jest.mock()` auto-mocking.

```typescript
// ✅ Correct - Manual mock with explicit interface
const mockTaskStore: IRecordStore<TaskRecord> = {
  read: jest.fn().mockResolvedValue(mockTask),
  write: jest.fn().mockResolvedValue(undefined),
  list: jest.fn().mockResolvedValue([]),
  exists: jest.fn().mockResolvedValue(true),
};

// ❌ Wrong - Auto-mocking hides dependencies
jest.mock("../store/record_store");
```

**Benefits**:

- Explicit dependency contracts
- Clear test assumptions
- Better refactoring safety

## Test Organization & Naming

**File Structure**:

- Unit tests: `{filename}.test.ts` (co-located with source)
- Integration tests: `{filename}.integration.test.ts`
- E2E tests: `{filename}.e2e.test.ts`

**Test Categories**:

- **Unit**: Single class/function, all dependencies mocked
- **Integration**: Multiple components, external systems mocked
- **E2E**: Full user workflows via CLI, real filesystem

## Coverage Requirements

**Mandatory Coverage**:

- All adapter public methods (success + error paths)
- All factory functions with invalid inputs
- All validation functions with edge cases
- All cryptographic operations (signature verification)

**Test Structure Pattern**:

```typescript
describe("BacklogAdapter", () => {
  describe("createTask", () => {
    it("should create a valid TaskRecord with the proper signature", async () => {
      // Success path
    });

    it("should return a ValidationError for invalid input", async () => {
      // Error path
    });

    it("should publish a TaskCreatedEvent after successful creation", async () => {
      // Side effect verification
    });
  });
});
```

## Testing Error Paths (Typed Exceptions)

**Rule**: Tests for fallible operations must verify that the correct typed error is thrown.

```typescript
// ✅ Test that a specific typed error is thrown
it("should throw a ValidationError for invalid actor input", async () => {
  await expect(adapter.createTask(invalidInput)).rejects.toThrow(
    DetailedValidationError
  );
});

it("should throw a RecordNotFoundError for a non-existent dependency", async () => {
  // Setup mocks to simulate the missing record
  mockDependentStore.read.mockResolvedValue(null);

  await expect(adapter.createTask(validInput)).rejects.toThrow(
    RecordNotFoundError
  );
});
```

## Security Testing Requirements

**Cryptographic Verification**:

- Test signature verification with valid/invalid signatures
- Test digest reconstruction accuracy
- Test key rotation scenarios
- Mock crypto operations for unit tests only

**Example**:

```typescript
it("should reject a record with an invalid signature", async () => {
  const recordWithBadSig = { ...validRecord };
  recordWithBadSig.header.signatures[0].signature = "invalid";

  await expect(adapter.verifyRecord(recordWithBadSig)).rejects.toThrow(
    SignatureVerificationError
  );
});
```

## TypeScript Testing Standards

**Strict Requirements**:

- No `any` types in test code
- Use proper type assertions with `as` only when necessary
- Mock interfaces must match actual interfaces exactly
- Test data factories for consistent test objects

**Example Factory Pattern**:

```typescript
// Test data factory
function createMockTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task:123',
    title: 'Test Task',
    status: 'pending',
    ...overrides
  };

```
