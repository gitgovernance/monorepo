/**
 * Error codes for FileLister operations.
 */
export type FileListerErrorCode =
  | 'FILE_NOT_FOUND'
  | 'READ_ERROR'
  | 'PERMISSION_DENIED'
  | 'INVALID_PATH'
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED';

/**
 * Optional structured metadata attached to FileListerError.
 * Used by RATE_LIMITED to surface partial results and reset time
 * (paths-not-fetched and x-ratelimit-reset header).
 */
export type FileListerErrorDetails = {
  /** Paths not fetched before the stop (RATE_LIMITED) */
  pathsNotFetched?: string[];
  /** Unix timestamp from x-ratelimit-reset header (RATE_LIMITED) */
  resetTime?: number;
  /** Map of path → content fetched before the stop (RATE_LIMITED) */
  partialResults?: Map<string, string>;
};

/**
 * Error thrown when file operations fail.
 */
export class FileListerError extends Error {
  constructor(
    message: string,
    public readonly code: FileListerErrorCode,
    public readonly filePath?: string,
    public readonly details?: FileListerErrorDetails,
  ) {
    super(message);
    this.name = 'FileListerError';
  }
}
