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
 * Custom Error type for failures when a payload's checksum does not match
 * the one specified in the header.
 */
export class ChecksumMismatchError extends Error {
  constructor(message: string = "Payload checksum does not match the header.") {
    super(message);
    this.name = "ChecksumMismatchError";
  }
}

/**
 * Custom Error type for failures during cryptographic signature verification.
 */
export class SignatureVerificationError extends Error {
  constructor(message: string = "Signature verification failed.") {
    super(message);
    this.name = "SignatureVerificationError";
  }
}

/**
 * Base class for all GitGovernance-specific errors.
 */
export class GitGovError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error for when required fields are missing during record creation.
 */
export class RequiredFieldError extends GitGovError {
  constructor(recordType: string, missingFields: string[]) {
    super(
      `${recordType} requires ${missingFields.join(', ')}`,
      'REQUIRED_FIELD_ERROR'
    );
  }
}

/**
 * Error for when a record is not found during operations.
 */
export class RecordNotFoundError extends GitGovError {
  constructor(recordType: string, recordId: string) {
    super(
      `${recordType} with id ${recordId} not found`,
      'RECORD_NOT_FOUND_ERROR'
    );
  }
}

/**
 * Error for when project root cannot be determined.
 */
export class ProjectRootError extends GitGovError {
  constructor() {
    super(
      'Could not find project root. Are you in a git repository?',
      'PROJECT_ROOT_ERROR'
    );
  }
}

/**
 * Error for when record creation validation fails.
 */
export class RecordCreationError extends GitGovError {
  constructor(recordType: string, details: string) {
    super(
      `Invalid ${recordType} created: ${details}`,
      'RECORD_CREATION_ERROR'
    );
  }
}

/**
 * Error for when operations are not implemented or require external components.
 */
export class NotImplementedError extends GitGovError {
  constructor(operation: string, reason: string) {
    super(
      `${operation} not implemented yet - ${reason}`,
      'NOT_IMPLEMENTED_ERROR'
    );
  }
}

/**
 * Error for detailed AJV validation failures with multiple field errors.
 */
export class DetailedValidationError extends GitGovError {
  constructor(
    recordType: string,
    public readonly ajvErrors: Array<{
      field: string;
      message: string;
      value: unknown;
    }>
  ) {
    const errorSummary = ajvErrors
      .map(err => `${err.field}: ${err.message}`)
      .join(', ');

    super(
      `${recordType} validation failed: ${errorSummary}`,
      'DETAILED_VALIDATION_ERROR'
    );
  }
}

/**
 * Error for protocol violations in workflow operations.
 */
export class ProtocolViolationError extends GitGovError {
  constructor(message: string, violationType?: string) {
    super(
      `Protocol violation: ${message}`,
      'PROTOCOL_VIOLATION_ERROR'
    );
    if (violationType) {
      this.message += ` (Type: ${violationType})`;
    }
  }
}
