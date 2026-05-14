import { vi, beforeEach } from 'vitest';

// Prevent process.exit from killing the test runner in ALL test files
// vitest runs each file in isolation — this setup runs before each file
beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});
