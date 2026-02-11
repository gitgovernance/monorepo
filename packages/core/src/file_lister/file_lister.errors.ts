/**
 * Error codes for FileLister operations.
 */
export type FileListerErrorCode =
  | 'FILE_NOT_FOUND'
  | 'READ_ERROR'
  | 'PERMISSION_DENIED'
  | 'INVALID_PATH'
  | 'NETWORK_ERROR';

/**
 * Error thrown when file operations fail.
 */
export class FileListerError extends Error {
  constructor(
    message: string,
    public readonly code: FileListerErrorCode,
    public readonly filePath?: string
  ) {
    super(message);
    this.name = 'FileListerError';
  }
}
