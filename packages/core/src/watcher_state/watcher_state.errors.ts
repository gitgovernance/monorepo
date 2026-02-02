export class WatcherStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatcherStateError";
    Object.setPrototypeOf(this, WatcherStateError.prototype);
  }
}

export class ProjectNotInitializedError extends WatcherStateError {
  constructor(gitgovPath: string) {
    super(`Directory ${gitgovPath} not found. Run 'gitgov init' first.`);
    this.name = "ProjectNotInitializedError";
    Object.setPrototypeOf(this, ProjectNotInitializedError.prototype);
  }
}

export class WatcherSetupError extends WatcherStateError {
  constructor(directory: string, cause: Error) {
    super(`Failed to create watcher for ${directory}: ${cause.message}`);
    this.name = "WatcherSetupError";
    this.cause = cause;
    Object.setPrototypeOf(this, WatcherSetupError.prototype);
  }
}

export class ChecksumMismatchError extends WatcherStateError {
  public expected: string;
  public actual: string;

  constructor(filePath: string, expected: string, actual: string) {
    super(
      `Checksum mismatch in ${filePath}: expected ${expected}, got ${actual}`
    );
    this.name = "ChecksumMismatchError";
    this.expected = expected;
    this.actual = actual;
    Object.setPrototypeOf(this, ChecksumMismatchError.prototype);
  }
}

// Type guards
export function isWatcherStateError(
  error: unknown
): error is WatcherStateError {
  return error instanceof WatcherStateError;
}

export function isProjectNotInitializedError(
  error: unknown
): error is ProjectNotInitializedError {
  return error instanceof ProjectNotInitializedError;
}

export function isWatcherSetupError(
  error: unknown
): error is WatcherSetupError {
  return error instanceof WatcherSetupError;
}

export function isChecksumMismatchError(
  error: unknown
): error is ChecksumMismatchError {
  return error instanceof ChecksumMismatchError;
}
