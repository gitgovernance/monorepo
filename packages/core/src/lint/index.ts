/**
 * Lint Module - Structural Validation for GitGovernance Records
 *
 * This module provides comprehensive validation capabilities for GitGovernance records,
 * implementing Quality Model Layer 1 (Structural + Referential Integrity).
 *
 * ## Architecture (Store Backends Epic)
 *
 * The lint module is split into two parts:
 * - **LintModule** (pure): Core validation logic without I/O. Works with GitGovRecord objects.
 * - **FsLintModule** (filesystem): Wrapper with I/O for directory scanning, file reading, backups.
 *
 * @module lint
 * @example
 * ```typescript
 * // Pure LintModule (no I/O)
 * import { LintModule, type ILintModule } from '@gitgov/core/lint';
 *
 * const lintModule: ILintModule = new LintModule({ stores });
 * const results = lintModule.lintRecord(record, { recordId, entityType });
 *
 * // FsLintModule (with I/O)
 * import { FsLintModule, type IFsLintModule } from '@gitgov/core/lint';
 *
 * const fsLintModule: IFsLintModule = new FsLintModule({ lintModule, stores });
 * const report = await fsLintModule.lint({ path: '.gitgov/' });
 * ```
 */

export { LintModule } from "./lint";
export { FsLintModule } from "./fs";

export type {
  // Pure LintModule interfaces
  ILintModule,
  LintModuleDependencies,
  RecordEntry,
  LintRecordContext,
  RecordStores,
  FixRecordOptions,

  // FsLintModule interfaces
  IFsLintModule,
  FsLintModuleDependencies,
  FsLintOptions,
  FsFixOptions,
  FileSystem,

  // Shared types
  LintOptions,
  LintReport,
  LintSummary,
  LintResult,
  ValidatorType,
  ValidationContext,
  FixReport,
  FixResult
} from "./lint.types";
