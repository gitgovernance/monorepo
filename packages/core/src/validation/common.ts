/**
 * @deprecated Use specific error modules instead:
 * - Schema errors: import from '../schemas/errors'
 * - Validation errors: import from './errors'
 * 
 * This file re-exports all errors for backward compatibility.
 */

// Schema-specific errors
export {
  GitGovError,
  SchemaValidationError,
  DetailedValidationError
} from '../schemas/errors';

// Validation and common errors
export {
  ChecksumMismatchError,
  SignatureVerificationError,
  RequiredFieldError,
  RecordNotFoundError,
  ProjectRootError,
  RecordCreationError,
  NotImplementedError,
  ProtocolViolationError
} from './errors';
