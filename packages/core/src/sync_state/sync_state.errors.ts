/**
 * Base error class for all sync-related errors
 */
export class SyncStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncStateError";
    Object.setPrototypeOf(this, SyncStateError.prototype);
  }
}

/**
 * Error thrown when attempting to push from gitgov-state branch
 */
export class PushFromStateBranchError extends SyncStateError {
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
export class IntegrityViolationError extends SyncStateError {
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
export class ConflictMarkersPresentError extends SyncStateError {
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
export class NoRebaseInProgressError extends SyncStateError {
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
export class CryptoModuleRequiredError extends SyncStateError {
  constructor(operation: string) {
    super(
      `CryptoModule is required for ${operation} operation. ` +
      `Please provide crypto_module in SyncStateModuleDependencies.`
    );
    this.name = "CryptoModuleRequiredError";
    Object.setPrototypeOf(this, CryptoModuleRequiredError.prototype);
  }
}

/**
 * Error thrown when state branch cannot be created or configured
 */
export class StateBranchSetupError extends SyncStateError {
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
 * Error thrown when the provided actorId doesn't match the authenticated identity.
 *
 * This prevents impersonation: you can only push/resolve as the actor whose
 * private key you hold.
 */
export class ActorIdentityMismatchError extends SyncStateError {
  public requestedActorId: string;
  public authenticatedActorId: string;

  constructor(requestedActorId: string, authenticatedActorId: string) {
    super(
      `Actor identity mismatch: requested '${requestedActorId}' but authenticated as '${authenticatedActorId}'. ` +
      `You can only operate as the actor whose private key you hold.`
    );
    this.name = "ActorIdentityMismatchError";
    this.requestedActorId = requestedActorId;
    this.authenticatedActorId = authenticatedActorId;
    Object.setPrototypeOf(this, ActorIdentityMismatchError.prototype);
  }
}

/**
 * Error thrown when worktree cannot be created or repaired.
 * Used by FsWorktreeSyncStateModule for worktree lifecycle failures.
 */
export class WorktreeSetupError extends SyncStateError {
  constructor(
    public reason: string,
    public worktreePath: string,
    public underlyingError?: Error,
  ) {
    super(`Failed to setup worktree at ${worktreePath}: ${reason}`);
    this.name = 'WorktreeSetupError';
    Object.setPrototypeOf(this, WorktreeSetupError.prototype);
  }
}

/**
 * Error thrown when uncommitted changes exist in state branch
 */
export class UncommittedChangesError extends SyncStateError {
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

/**
 * Type guards for error handling
 * 
 * These functions enable type-safe error handling by narrowing the error type.
 * They are additive and don't break any existing code.
 * 
 * Example usage:
 * ```typescript
 * try {
 *   await syncModule.pushState(options);
 * } catch (error) {
 *   if (isPushFromStateBranchError(error)) {
 *     // TypeScript knows error.branch exists here
 *     console.log(`Cannot push from ${error.branch}`);
 *   }
 * }
 * ```
 */

export function isSyncStateError(error: unknown): error is SyncStateError {
  return error instanceof SyncStateError;
}

export function isPushFromStateBranchError(
  error: unknown
): error is PushFromStateBranchError {
  return error instanceof PushFromStateBranchError;
}

export function isIntegrityViolationError(
  error: unknown
): error is IntegrityViolationError {
  return error instanceof IntegrityViolationError;
}

export function isConflictMarkersPresentError(
  error: unknown
): error is ConflictMarkersPresentError {
  return error instanceof ConflictMarkersPresentError;
}

export function isUncommittedChangesError(
  error: unknown
): error is UncommittedChangesError {
  return error instanceof UncommittedChangesError;
}

export function isNoRebaseInProgressError(
  error: unknown
): error is NoRebaseInProgressError {
  return error instanceof NoRebaseInProgressError;
}

export function isStateBranchSetupError(
  error: unknown
): error is StateBranchSetupError {
  return error instanceof StateBranchSetupError;
}

export function isCryptoModuleRequiredError(
  error: unknown
): error is CryptoModuleRequiredError {
  return error instanceof CryptoModuleRequiredError;
}

export function isActorIdentityMismatchError(
  error: unknown
): error is ActorIdentityMismatchError {
  return error instanceof ActorIdentityMismatchError;
}

export function isWorktreeSetupError(
  error: unknown
): error is WorktreeSetupError {
  return error instanceof WorktreeSetupError;
}

