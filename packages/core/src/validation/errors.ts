/**
 * Validation and common error types for GitGovernance core.
 * These errors are thrown during record validation, checksum verification, and general operations.
 */

// Import GitGovError from models (common types)
export { GitGovError } from '../types/common.types';

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
 * Error for when required fields are missing during record creation.
 */
export class RequiredFieldError extends Error {
  constructor(recordType: string, missingFields: string[]) {
    super(`${recordType} requires ${missingFields.join(', ')}`);
    this.name = "RequiredFieldError";
  }
}

/**
 * Error for when a record is not found during operations.
 */
export class RecordNotFoundError extends Error {
  constructor(recordType: string, recordId: string) {
    super(`${recordType} with id ${recordId} not found`);
    this.name = "RecordNotFoundError";
  }
}

/**
 * Error for when project root cannot be determined.
 */
export class ProjectRootError extends Error {
  constructor() {
    super('Could not find project root. Are you in a git repository?');
    this.name = "ProjectRootError";
  }
}

/**
 * Error for when record creation validation fails.
 */
export class RecordCreationError extends Error {
  constructor(recordType: string, details: string) {
    super(`Invalid ${recordType} created: ${details}`);
    this.name = "RecordCreationError";
  }
}

/**
 * Error for when operations are not implemented or require external components.
 */
export class NotImplementedError extends Error {
  constructor(operation: string, reason: string) {
    super(`${operation} not implemented yet - ${reason}`);
    this.name = "NotImplementedError";
  }
}

/**
 * Error for protocol violations in workflow operations.
 */
export class ProtocolViolationError extends Error {
  constructor(message: string, violationType?: string) {
    super(`Protocol violation: ${message}`);
    this.name = "ProtocolViolationError";
    if (violationType) {
      this.message += ` (Type: ${violationType})`;
    }
  }
}

/**
 * Standard validation result interface for all validators.
 * Ensures consistency across all validateXDetailed functions.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value: unknown;
  }>;
}
