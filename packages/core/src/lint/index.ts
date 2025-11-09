/**
 * Lint Module - Structural Validation for GitGovernance Records
 * 
 * This module provides comprehensive validation capabilities for GitGovernance records,
 * implementing Quality Model Layer 1 (Structural + Referential Integrity).
 * 
 * Follows the same architectural pattern as all other adapters with public interface
 * (ILintModule) for dependency injection and testability.
 * 
 * @module lint
 * @example
 * ```typescript
 * import { LintModule, type ILintModule } from '@gitgov/core/lint';
 * 
 * const lintModule: ILintModule = new LintModule({
 *   recordStore: taskStore,
 *   indexerAdapter: indexerAdapter // optional
 * });
 * 
 * // Validate all records
 * const report = await lintModule.lint({ validateReferences: true });
 * console.log(`Errors: ${report.summary.errors}`);
 * 
 * // Auto-fix problems
 * if (report.summary.fixable > 0) {
 *   const fixReport = await lintModule.fix(report, { createBackups: true });
 *   console.log(`Fixed: ${fixReport.summary.fixed}`);
 * }
 * ```
 */

export { LintModule } from "./lint";
export type {
  ILintModule,
  LintModuleDependencies,
  LintOptions,
  LintReport,
  LintSummary,
  LintResult,
  ValidatorType,
  ValidationContext,
  FixOptions,
  FixReport,
  FixResult,
  FileSystem
} from "./lint.types";
