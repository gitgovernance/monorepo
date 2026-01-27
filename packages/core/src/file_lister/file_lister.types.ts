/**
 * Options for file listing.
 */
export type FileListOptions = {
  /** Glob patterns to ignore (e.g., ['node_modules/**']) */
  ignore?: string[];
  /** Only return files (not directories). Default: true */
  onlyFiles?: boolean;
  /** Return absolute paths instead of relative. Default: false */
  absolute?: boolean;
  /** Maximum depth to traverse. Default: unlimited */
  maxDepth?: number;
}

/**
 * File statistics returned by stat().
 */
export type FileStats = {
  /** File size in bytes */
  size: number;
  /** Last modification time as timestamp (ms since epoch) */
  mtime: number;
  /** Whether it's a file (not directory) */
  isFile: boolean;
}

/**
 * Options for FsFileLister.
 */
export type FsFileListerOptions = {
  /** Base directory for all operations */
  cwd: string;
}

/**
 * Options for MemoryFileLister.
 */
export type MemoryFileListerOptions = {
  /** Map of filePath -> content */
  files?: Map<string, string> | Record<string, string>;
  /** Map of filePath -> stats (optional, generated if not provided) */
  stats?: Map<string, FileStats>;
}
