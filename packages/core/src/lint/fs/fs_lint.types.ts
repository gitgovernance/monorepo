/**
 * Filesystem-specific types for FsLintModule.
 *
 * These types are exported via @gitgov/core/fs subpath.
 * For pure validation types, use @gitgov/core.
 */

import type {
  ILintModule,
  RecordStores,
  LintOptions,
  LintReport,
  FixRecordOptions,
  FixReport,
} from '../lint.types';
import type { IRecordProjector } from '../../record_projection';

/**
 * Public interface for FsLintModule operations (with I/O).
 *
 * This interface wraps LintModule and adds filesystem operations:
 * - Directory scanning for record discovery
 * - File reading and parsing
 * - Backup creation and restoration
 * - File writing for fixes
 *
 * @example
 * ```typescript
 * const fsLintModule: IFsLintModule = new FsLintModule({
 *   lintModule,
 *   stores
 * });
 *
 * // Scan directory and validate all records
 * const report = await fsLintModule.lint({ path: '.gitgov/' });
 *
 * // Validate specific file
 * const fileReport = await fsLintModule.lintFile(filePath);
 *
 * // Fix with backups
 * const fixReport = await fsLintModule.fix(report, { createBackups: true });
 * ```
 */
export interface IFsLintModule extends ILintModule {
  /**
   * Scans directories and validates all records.
   * Overrides ILintModule.lint() to accept filesystem-specific options.
   */
  lint(options?: Partial<FsLintOptions>): Promise<LintReport>;

  /**
   * Validates a specific file.
   */
  lintFile(filePath: string, options?: Partial<FsLintOptions>): Promise<LintReport>;

  /**
   * Applies automatic repairs to files, creating backups.
   */
  fix(lintReport: LintReport, fixOptions?: Partial<FsFixOptions>): Promise<FixReport>;
}

/**
 * Dependencies for FsLintModule.
 */
export interface FsLintModuleDependencies {
  /** Absolute path to project root (REQUIRED, injected from DI/CLI bootstrap) */
  projectRoot: string;

  /** Core LintModule for pure validation (REQUIRED) */
  lintModule: ILintModule;

  /** Record stores for reference lookups (OPTIONAL) */
  stores?: RecordStores;

  /** Record projector for reference resolution (OPTIONAL) */
  projector?: IRecordProjector;

  /** FileSystem abstraction for I/O (OPTIONAL, default: Node.js fs) */
  fileSystem?: FileSystem;
}

/**
 * Options for FsLintModule operations.
 * Extends LintOptions with filesystem-specific settings.
 */
export interface FsLintOptions extends LintOptions {
  /** Directory or file to validate (default: '.gitgov/') */
  path?: string;

  /** Validate file naming conventions (default: true) */
  validateFileNaming?: boolean;
}

/**
 * Options for FsLintModule fix operation.
 * Extends FixRecordOptions with filesystem-specific settings.
 */
export interface FsFixOptions extends FixRecordOptions {
  /** Create backups before modifying files (default: true) */
  createBackups?: boolean;

  /** Dry-run mode that reports without applying changes (default: false) */
  dryRun?: boolean;
}

/**
 * FileSystem interface for I/O operations.
 * Can be mocked for testing.
 */
export interface FileSystem {
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  unlink(path: string): Promise<void>;
  readdir?(path: string): Promise<string[]>;
}
