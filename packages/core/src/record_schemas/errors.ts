/**
 * Schema-specific error types for GitGovernance core.
 * These errors are thrown during JSON Schema validation and compilation.
 */

// Import GitGovError from models (common types) - no circular dependencies
import { GitGovError } from '../types/common.types';

// Re-export for backward compatibility
export { GitGovError };

/**
 * Custom Error type for failures related to JSON Schema validation.
 */
export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

/**
 * Error for detailed AJV validation failures with multiple field errors.
 */
export class DetailedValidationError extends GitGovError {
  constructor(
    recordType: string,
    public readonly errors: Array<{
      field: string;
      message: string;
      value: unknown;
    }>
  ) {
    const errorSummary = errors
      .map(err => `${err.field}: ${err.message}`)
      .join(', ');

    super(
      `${recordType} validation failed: ${errorSummary}`,
      'DETAILED_VALIDATION_ERROR'
    );
  }
}
