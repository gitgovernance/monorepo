/**
 * Base error class for all sync-related errors
 */
export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncError";
    Object.setPrototypeOf(this, SyncError.prototype);
  }
}

/**
 * Error thrown when attempting to push from gitgov-state branch
 */
export class PushFromStateBranchError extends SyncError {
  public branch: string;

  constructor(branchName: string) {
    super(
      `Cannot push from ${branchName} branch. ` +
      `Please switch to a working branch before pushing state.`
    );
    this.name = "PushFromStateBranchError";
    this.branch = branchName;
    Object.setPrototypeOf(this, PushFromStateBranchError.prototype);
  }
}

/**
 * Error thrown when integrity violations are detected during audit
 */
export class IntegrityViolationError extends SyncError {
  constructor(
    public violations: Array<{
      type: "resolution" | "signature" | "checksum" | "missing_file";
      details: string;
    }>
  ) {
    const violationSummary = violations
      .map((v) => `${v.type}: ${v.details}`)
      .join("; ");
    super(`Integrity violations detected: ${violationSummary}`);
    this.name = "IntegrityViolationError";
    Object.setPrototypeOf(this, IntegrityViolationError.prototype);
  }
}

/**
 * Error thrown when conflict markers are still present in files
 */
export class ConflictMarkersPresentError extends SyncError {
  constructor(public filesWithMarkers: string[]) {
    super(
      `Conflict markers still present in ${filesWithMarkers.length} file(s). ` +
      `Please resolve all conflicts before continuing.`
    );
    this.name = "ConflictMarkersPresentError";
    Object.setPrototypeOf(this, ConflictMarkersPresentError.prototype);
  }
}

/**
 * Error thrown when attempting to resolve conflict without rebase in progress
 */
export class NoRebaseInProgressError extends SyncError {
  constructor() {
    super(
      `No rebase in progress. Cannot resolve conflict without an active rebase. ` +
      `Use 'pullState' or 'pushState' to trigger synchronization first.`
    );
    this.name = "NoRebaseInProgressError";
    Object.setPrototypeOf(this, NoRebaseInProgressError.prototype);
  }
}

/**
 * Error thrown when CryptoModule is required but not available
 */
export class CryptoModuleRequiredError extends SyncError {
  constructor(operation: string) {
    super(
      `CryptoModule is required for ${operation} operation. ` +
      `Please provide crypto_module in SyncModuleDependencies.`
    );
    this.name = "CryptoModuleRequiredError";
    Object.setPrototypeOf(this, CryptoModuleRequiredError.prototype);
  }
}

/**
 * Error thrown when state branch cannot be created or configured
 */
export class StateBranchSetupError extends SyncError {
  constructor(
    public reason: string,
    public underlyingError?: Error
  ) {
    super(`Failed to setup state branch: ${reason}`);
    this.name = "StateBranchSetupError";
    Object.setPrototypeOf(this, StateBranchSetupError.prototype);
  }
}

/**
 * Error thrown when uncommitted changes exist in state branch
 */
export class UncommittedChangesError extends SyncError {
  public branch: string;

  constructor(branchName: string) {
    super(
      `Uncommitted changes detected in ${branchName}. ` +
      `Please commit or stash changes before synchronizing.`
    );
    this.name = "UncommittedChangesError";
    this.branch = branchName;
    Object.setPrototypeOf(this, UncommittedChangesError.prototype);
  }
}

