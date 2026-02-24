/**
 * FsLintModule - Filesystem-aware Validation
 *
 * This module wraps the pure LintModule and adds filesystem operations:
 * - Directory scanning for record discovery (EARS-A1)
 * - File naming validation (EARS-B1, EARS-B2)
 * - Backup creation and restoration (EARS-C1, EARS-C2)
 * - Delegation to LintModule core (EARS-D1)
 * - Schema version detection (EARS-E1)
 * - Error filtering (EARS-F1)
 *
 * @see fs_lint_module.md for EARS specifications
 * @module lint/fs
 */

/**
 * [EARS-F1] Ajv error message patterns for oneOf/if-then-else schema validation.
 * These are standard messages from Ajv when validating JSON Schema with oneOf + if/then/else.
 *
 * When a record has additionalProperties errors, Ajv also generates redundant errors
 * from all the oneOf branches that don't match. These should be filtered out.
 *
 * @see https://ajv.js.org/api.html#validation-errors
 */
const AJV_ONEOF_ERROR_PATTERNS = {
  /** Message from "else: false" in if/then/else schema */
  BOOLEAN_SCHEMA_FALSE: 'boolean schema is false',
  /** Message when if condition doesn't match "else" */
  MUST_MATCH_ELSE: 'must match "else" schema',
  /** Message when if condition doesn't match "then" */
  MUST_MATCH_THEN: 'must match "then" schema',
  /** Path prefix for oneOf errors */
  ONEOF_PATH: '#/oneOf/',
} as const;

/**
 * [EARS-F1] Checks if an error message is a redundant oneOf/if-then-else error from Ajv.
 * These errors are noise when the root cause is additionalProperties.
 */
function isRedundantOneOfError(message: string): boolean {
  return (
    message.includes(AJV_ONEOF_ERROR_PATTERNS.BOOLEAN_SCHEMA_FALSE) ||
    message.includes(AJV_ONEOF_ERROR_PATTERNS.MUST_MATCH_ELSE) ||
    message.includes(AJV_ONEOF_ERROR_PATTERNS.MUST_MATCH_THEN) ||
    message.includes(AJV_ONEOF_ERROR_PATTERNS.ONEOF_PATH)
  );
}

import { promises as fs } from "fs";
import { join, dirname, basename } from "path";
import { readdir } from "fs/promises";
import type {
  IFsLintModule,
  FsLintModuleDependencies,
  FsLintOptions,
  FsFixOptions,
  FileSystem,
} from "./fs_lint.types";
import type {
  LintReport,
  LintResult,
  FixReport,
  FixResult,
  ValidatorType,
  ILintModule,
  LintRecordContext,
  FixRecordOptions,
} from "../lint.types";
// Note: IRecordProjector is in FsLintModuleDependencies but passed to LintModule, not used directly
import type {
  GitGovRecord,
  TaskRecord,
  CycleRecord,
  GitGovRecordType
} from "../../record_types";
import { isTaskPayload, isCyclePayload } from "../../record_types/type_guards";
import { extractRecordIdFromPath, getEntityTypeFromPath, inferEntityTypeFromId } from "../../utils/id_parser";
import { chunkArray } from "../../utils/array_utils";
import { createLogger } from "../../logger";
import { calculatePayloadChecksum } from "../../crypto/checksum";
import {
  loadTaskRecord,
  loadActorRecord,
  loadAgentRecord,
  loadCycleRecord,
  loadExecutionRecord,
  loadChangelogRecord,
  loadFeedbackRecord
} from "../../record_factories";
import { DetailedValidationError } from "../../record_validations/common";

const logger = createLogger("[FsLint] ");

/**
 * Filesystem-aware lint module.
 * Wraps LintModule (pure) and adds I/O operations.
 *
 * @implements {IFsLintModule}
 */
export class FsLintModule implements IFsLintModule {
  private readonly projectRoot: string;
  private readonly lintModule: ILintModule;
  private readonly fileSystem: FileSystem;
  private lastBackupPath: string | null = null;

  /**
   * Constructor for FsLintModule.
   *
   * @param dependencies - Module dependencies
   */
  constructor(dependencies: FsLintModuleDependencies) {
    if (!dependencies.projectRoot) {
      throw new Error("projectRoot is required for FsLintModule");
    }
    if (!dependencies.lintModule) {
      throw new Error("lintModule is required for FsLintModule");
    }
    this.projectRoot = dependencies.projectRoot;
    this.lintModule = dependencies.lintModule;
    // Note: projector is passed to LintModule, not used directly here

    // FileSystem with fallback to Node.js fs
    this.fileSystem = dependencies.fileSystem ?? {
      readFile: async (path: string, encoding: string) => {
        return fs.readFile(path, encoding as BufferEncoding);
      },
      writeFile: async (path: string, content: string) => {
        await fs.writeFile(path, content, "utf-8");
      },
      exists: async (path: string) => {
        try {
          await fs.access(path);
          return true;
        } catch {
          return false;
        }
      },
      unlink: async (path: string) => {
        await fs.unlink(path);
      },
      readdir: async (path: string) => {
        return readdir(path);
      }
    };
  }

  // ==================== ILintModule Delegation ====================

  /**
   * Delegates to LintModule.lintRecord() for pure validation.
   */
  lintRecord(record: GitGovRecord, context: LintRecordContext): LintResult[] {
    return this.lintModule.lintRecord(record, context);
  }

  /**
   * Delegates to LintModule.lintRecordReferences() for prefix validation.
   */
  lintRecordReferences(record: GitGovRecord, context: LintRecordContext): LintResult[] {
    return this.lintModule.lintRecordReferences(record, context);
  }

  /**
   * Delegates to LintModule.fixRecord() for pure fix.
   */
  fixRecord(record: GitGovRecord, results: LintResult[], options: FixRecordOptions): GitGovRecord {
    return this.lintModule.fixRecord(record, results, options);
  }

  // ==================== IFsLintModule Methods ====================

  /**
   * [EARS-A1] Scans directories and validates all records.
   *
   * @param options - Configuration options
   * @returns Consolidated lint report
   */
  async lint(options?: Partial<FsLintOptions>): Promise<LintReport> {
    const startTime = Date.now();

    const opts: FsLintOptions = {
      path: options?.path ?? ".gitgov/",
      validateReferences: options?.validateReferences ?? false,
      validateActors: options?.validateActors ?? false,
      validateChecksums: options?.validateChecksums ?? true,
      validateSignatures: options?.validateSignatures ?? true,
      validateTimestamps: options?.validateTimestamps ?? true,
      validateFileNaming: options?.validateFileNaming ?? true,
      failFast: options?.failFast ?? false,
      concurrent: options?.concurrent ?? true,
      concurrencyLimit: options?.concurrencyLimit ?? 10
    };

    const results: LintResult[] = [];

    // Suppress console.warn during lint
    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      // 1. Discovery: Find all records
      const recordsWithTypes = await this.discoverAllRecordsWithTypes(opts.path);
      logger.info(`Starting lint validation for ${recordsWithTypes.length} records`);

      // 2. Validation Loop
      if (opts.concurrent) {
        const batches = chunkArray(recordsWithTypes, opts.concurrencyLimit!);
        for (const batch of batches) {
          const batchResults = await Promise.all(
            batch.map(({ id, type }) => this.lintSingleRecord(id, opts, type))
          );
          for (const batchResult of batchResults) {
            results.push(...batchResult);
            if (opts.failFast && batchResult.some(r => r.level === "error")) {
              break;
            }
          }
          if (opts.failFast && results.some(r => r.level === "error")) {
            break;
          }
        }
      } else {
        for (const { id, type } of recordsWithTypes) {
          const recordResults = await this.lintSingleRecord(id, opts, type);
          results.push(...recordResults);
          if (opts.failFast && recordResults.some(r => r.level === "error")) {
            break;
          }
        }
      }

      const executionTime = Date.now() - startTime;
      const errors = results.filter(r => r.level === "error").length;
      const warnings = results.filter(r => r.level === "warning").length;
      const fixable = results.filter(r => r.fixable).length;

      logger.info(`Lint completed in ${executionTime}ms: ${recordsWithTypes.length} files, ${errors} errors, ${warnings} warnings`);

      return {
        summary: { filesChecked: recordsWithTypes.length, errors, warnings, fixable, executionTime },
        results,
        metadata: { timestamp: new Date().toISOString(), options: opts, version: "1.0.0" }
      };
    } finally {
      console.warn = originalWarn;
    }
  }

  /**
   * Validates a specific file.
   *
   * @param filePath - Path to the file to validate
   * @param options - Configuration options
   * @returns Lint report for this single file
   */
  async lintFile(filePath: string, options?: Partial<FsLintOptions>): Promise<LintReport> {
    const startTime = Date.now();
    const recordId = extractRecordIdFromPath(filePath);
    const entityType = getEntityTypeFromPath(filePath) || inferEntityTypeFromId(recordId);

    const opts: FsLintOptions = {
      path: filePath,
      validateReferences: options?.validateReferences ?? false,
      validateActors: options?.validateActors ?? false,
      validateChecksums: options?.validateChecksums ?? true,
      validateSignatures: options?.validateSignatures ?? true,
      validateTimestamps: options?.validateTimestamps ?? true,
      validateFileNaming: options?.validateFileNaming ?? true,
      failFast: options?.failFast ?? false,
      concurrent: false,
      concurrencyLimit: 1
    };

    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      const results = await this.lintSingleRecord(recordId, opts, entityType);

      const executionTime = Date.now() - startTime;
      const errors = results.filter(r => r.level === "error").length;
      const warnings = results.filter(r => r.level === "warning").length;
      const fixable = results.filter(r => r.fixable).length;

      return {
        summary: { filesChecked: 1, errors, warnings, fixable, executionTime },
        results,
        metadata: { timestamp: new Date().toISOString(), options: opts, version: "1.0.0" }
      };
    } finally {
      console.warn = originalWarn;
    }
  }

  /**
   * Applies automatic repairs to files, creating backups.
   *
   * @param lintReport - Lint report with detected problems
   * @param fixOptions - Options for the fix operation
   * @returns Report of applied repairs
   */
  async fix(lintReport: LintReport, fixOptions?: Partial<FsFixOptions>): Promise<FixReport> {
    const opts: FsFixOptions = {
      ...(fixOptions?.fixTypes && { fixTypes: fixOptions.fixTypes }),
      createBackups: fixOptions?.createBackups ?? true,
      keyId: fixOptions?.keyId ?? "system:migrator",
      dryRun: fixOptions?.dryRun ?? false,
      ...(fixOptions?.privateKey && { privateKey: fixOptions.privateKey })
    };

    const fixes: FixResult[] = [];

    let fixableResults = lintReport.results.filter(r => r.fixable);
    if (opts.fixTypes && opts.fixTypes.length > 0) {
      fixableResults = fixableResults.filter(r => opts.fixTypes!.includes(r.validator));
    }

    logger.info(`Starting fix operation for ${fixableResults.length} fixable problems`);

    // Group by file and validator
    const resultsByFile = new Map<string, Map<ValidatorType, LintResult[]>>();
    for (const result of fixableResults) {
      if (!resultsByFile.has(result.filePath)) {
        resultsByFile.set(result.filePath, new Map());
      }
      const fileResults = resultsByFile.get(result.filePath)!;
      if (!fileResults.has(result.validator)) {
        fileResults.set(result.validator, []);
      }
      fileResults.get(result.validator)!.push(result);
    }

    for (const [, validatorMap] of resultsByFile) {
      for (const [, results] of validatorMap) {
        const primaryResult = results[0]!;
        let backupPath: string | undefined;

        try {
          if (opts.dryRun) {
            fixes.push({
              filePath: primaryResult.filePath,
              validator: primaryResult.validator,
              action: `Would fix ${primaryResult.validator} (${results.length} error${results.length === 1 ? '' : 's'})`,
              success: true
            });
            continue;
          }

          // Create backup
          if (opts.createBackups && !backupPath) {
            backupPath = await this.createBackup(primaryResult.filePath);
          }

          // Apply fix
          await this.applyFix(primaryResult, opts, results);

          fixes.push({
            filePath: primaryResult.filePath,
            validator: primaryResult.validator,
            action: `Fixed ${primaryResult.validator} (${results.length} error${results.length === 1 ? '' : 's'})`,
            success: true,
            ...(backupPath && { backupPath })
          });

          logger.debug(`Successfully fixed ${primaryResult.filePath}`);

        } catch (error) {
          if (opts.createBackups && backupPath) {
            try {
              await this.restoreBackup(primaryResult.filePath);
              logger.warn(`Restored backup for ${primaryResult.filePath}`);
            } catch {
              logger.error(`Failed to restore backup for ${primaryResult.filePath}`);
            }
          }

          fixes.push({
            filePath: primaryResult.filePath,
            validator: primaryResult.validator,
            action: `Failed to fix ${primaryResult.validator}`,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            ...(backupPath && { backupPath })
          });
        }
      }
    }

    const summary = {
      fixed: fixes.filter(f => f.success).length,
      failed: fixes.filter(f => !f.success).length,
      backupsCreated: opts.createBackups ? fixes.filter(f => f.backupPath).length : 0
    };

    logger.info(`Fix completed: ${summary.fixed} fixed, ${summary.failed} failed`);

    return { summary, fixes };
  }

  // ==================== Private Methods ====================

  /**
   * Validates a single record by reading from filesystem.
   * @private
   */
  private async lintSingleRecord(
    recordId: string,
    options: FsLintOptions,
    entityType: GitGovRecordType
  ): Promise<LintResult[]> {
    const results: LintResult[] = [];
    let filePath: string;

    if (options.path && options.path.endsWith('.json')) {
      // Resolve path: absolute paths used directly, relative paths joined with projectRoot
      filePath = options.path.startsWith('/')
        ? options.path
        : join(this.projectRoot, options.path);
    } else {
      filePath = this.getFilePath(recordId, entityType);
    }

    try {
      // Read and parse file
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      const raw = JSON.parse(content);

      // Load with appropriate loader
      let record: GitGovRecord;
      switch (entityType) {
        case 'task': record = loadTaskRecord(raw); break;
        case 'actor': record = loadActorRecord(raw); break;
        case 'agent': record = loadAgentRecord(raw); break;
        case 'cycle': record = loadCycleRecord(raw); break;
        case 'execution': record = loadExecutionRecord(raw); break;
        case 'changelog': record = loadChangelogRecord(raw); break;
        case 'feedback': record = loadFeedbackRecord(raw); break;
        default: record = raw as GitGovRecord;
      }

      // [EARS-D1] Use pure LintModule for validation
      const lintResults = this.lintModule.lintRecord(record, {
        recordId,
        entityType,
        filePath
      });
      results.push(...lintResults);

      // File naming validation (filesystem-specific)
      if (options.validateFileNaming) {
        const namingResults = this.validateFileNaming(record, recordId, filePath, entityType);
        results.push(...namingResults);
      }

      // [EARS-D2] Reference prefix validation (pure, no stores needed)
      if (options.validateReferences) {
        const refResults = this.lintModule.lintRecordReferences(record, {
          recordId,
          entityType,
          filePath
        });
        results.push(...refResults);
      }

    } catch (error) {
      if (error instanceof DetailedValidationError) {
        const hasAdditionalProperties = error.errors.some(e =>
          e.message.includes("must NOT have additional properties")
        );
        // [EARS-F1] Filter redundant oneOf/if-then-else errors when the root cause is additionalProperties
        const filteredErrors = hasAdditionalProperties
          ? error.errors.filter(e => !isRedundantOneOfError(e.message))
          : error.errors;

        for (const err of filteredErrors) {
          results.push({
            level: "error",
            filePath,
            validator: this.detectValidatorType(err.message, err.field),
            message: `${err.field}: ${err.message}`,
            entity: { type: entityType, id: recordId },
            fixable: this.isFixable(err.message),
            context: {
              ...(err.field && { field: err.field }),
              ...(err.value !== undefined && { actual: err.value })
            }
          });
        }
      } else {
        const fsError = error as NodeJS.ErrnoException;
        let message: string;
        if (fsError.code === 'ENOENT') {
          message = `Record file not found: ${recordId}`;
        } else if (error instanceof SyntaxError) {
          message = `Invalid JSON in record file: ${recordId}`;
        } else {
          message = error instanceof Error ? error.message : String(error);
        }

        results.push({
          level: "error",
          filePath,
          validator: "SCHEMA_VALIDATION",
          message,
          entity: { type: entityType, id: recordId },
          fixable: false
        });
      }
    }

    return results;
  }

  /**
   * [EARS-B1, EARS-B2] Validates file naming conventions.
   * @private
   */
  private validateFileNaming(
    _record: GitGovRecord,
    recordId: string,
    filePath: string,
    entityType: GitGovRecordType
  ): LintResult[] {
    const results: LintResult[] = [];

    const dirNameMap: Record<GitGovRecordType, string> = {
      'task': 'tasks', 'cycle': 'cycles', 'execution': 'executions',
      'changelog': 'changelogs', 'feedback': 'feedbacks',
      'actor': 'actors', 'agent': 'agents'
    };

    // [EARS-B1] Validate correct directory
    const expectedDir = `.gitgov/${dirNameMap[entityType]}`;
    if (!filePath.includes(expectedDir)) {
      results.push({
        level: "error",
        filePath,
        validator: "FILE_NAMING_CONVENTION",
        message: `File should be in ${expectedDir}/ directory`,
        entity: { type: entityType, id: recordId },
        fixable: false,
        context: { field: "directory", actual: dirname(filePath), expected: expectedDir }
      });
    }

    // [EARS-B2] Validate filename matches ID
    const expectedFilename = `${recordId}.json`;
    const actualFilename = basename(filePath);
    if (actualFilename !== expectedFilename) {
      results.push({
        level: "error",
        filePath,
        validator: "FILE_NAMING_CONVENTION",
        message: `Filename '${actualFilename}' does not match entity ID`,
        entity: { type: entityType, id: recordId },
        fixable: false,
        context: { field: "filename", actual: actualFilename, expected: expectedFilename }
      });
    }

    return results;
  }

  /**
   * [EARS-A1] Discovers all records with their types by scanning filesystem.
   * @private
   */
  private async discoverAllRecordsWithTypes(_path?: string): Promise<Array<{ id: string; type: GitGovRecordType }>> {
    // Note: _path parameter is deprecated, projectRoot is now injected via constructor
    const recordTypes: Array<GitGovRecordType> = [
      'actor', 'agent', 'cycle', 'task', 'execution', 'changelog', 'feedback'
    ];
    const allRecords: Array<{ id: string; type: GitGovRecordType }> = [];

    const dirNameMap: Record<GitGovRecordType, string> = {
      'task': 'tasks', 'cycle': 'cycles', 'execution': 'executions',
      'changelog': 'changelogs', 'feedback': 'feedbacks',
      'actor': 'actors', 'agent': 'agents'
    };

    for (const recordType of recordTypes) {
      const dirPath = join(this.projectRoot, '.gitgov', dirNameMap[recordType]);
      try {
        const files = await readdir(dirPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        const records = jsonFiles.map(f => ({ id: f.replace('.json', ''), type: recordType }));
        allRecords.push(...records);
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return allRecords;
  }

  /**
   * Gets file path for a record.
   * @private
   */
  private getFilePath(recordId: string, entityType: GitGovRecordType): string {
    const dirNameMap: Record<GitGovRecordType, string> = {
      'task': 'tasks', 'cycle': 'cycles', 'execution': 'executions',
      'changelog': 'changelogs', 'feedback': 'feedbacks',
      'actor': 'actors', 'agent': 'agents'
    };
    const dirName = dirNameMap[entityType];
    const safeId = recordId.replace(/:/g, '_');

    return join(this.projectRoot, ".gitgov", dirName, `${safeId}.json`);
  }

  /**
   * [EARS-C1] Creates a backup of a file before modification.
   * @private
   */
  private async createBackup(filePath: string): Promise<string> {
    const timestamp = Date.now();
    const backupPath = `${filePath}.backup-${timestamp}`;
    const content = await this.fileSystem.readFile(filePath, "utf-8");
    await this.fileSystem.writeFile(backupPath, content);
    this.lastBackupPath = backupPath;
    return backupPath;
  }

  /**
   * [EARS-C2] Restores file from backup if fix fails.
   * @private
   */
  private async restoreBackup(filePath: string): Promise<void> {
    if (this.lastBackupPath) {
      const exists = await this.fileSystem.exists(this.lastBackupPath);
      if (exists) {
        const content = await this.fileSystem.readFile(this.lastBackupPath, "utf-8");
        await this.fileSystem.writeFile(filePath, content);
        this.lastBackupPath = null;
        return;
      }
    }
    throw new Error(`No backup found for ${filePath}`);
  }

  /**
   * Applies a fix to a file.
   * @private
   */
  private async applyFix(result: LintResult, options: FsFixOptions, allErrors: LintResult[]): Promise<void> {
    switch (result.validator) {
      case "EMBEDDED_METADATA_STRUCTURE":
        await this.fixLegacyRecord(result, options, allErrors);
        break;
      case "BIDIRECTIONAL_CONSISTENCY":
        await this.fixBidirectionalReference(result);
        break;
      case "CHECKSUM_VERIFICATION":
        await this.recalculateChecksum(result);
        break;
      case "SIGNATURE_STRUCTURE":
        await this.fixSignatureStructure(result, options, allErrors);
        break;
      default:
        throw new Error(`Fix not implemented for validator: ${result.validator}`);
    }
  }

  /**
   * Fixes legacy record with embedded metadata issues.
   * @private
   */
  private async fixLegacyRecord(result: LintResult, options: FsFixOptions, allErrors?: LintResult[]): Promise<void> {
    if (!options.privateKey) {
      throw new Error("privateKey is required to fix legacy records");
    }

    const content = await this.fileSystem.readFile(result.filePath, "utf-8");
    const record = JSON.parse(content) as GitGovRecord;

    // Use pure LintModule to fix
    const fixedRecord = this.lintModule.fixRecord(record, allErrors || [result], {
      fixTypes: ['EMBEDDED_METADATA_STRUCTURE'],
      ...(options.keyId !== undefined && { keyId: options.keyId }),
      privateKey: options.privateKey
    });

    await this.fileSystem.writeFile(result.filePath, JSON.stringify(fixedRecord, null, 2));
    logger.info(`Fixed legacy record: ${result.filePath}`);
  }

  /**
   * Fixes bidirectional reference inconsistencies.
   * @private
   */
  private async fixBidirectionalReference(result: LintResult): Promise<void> {
    const entityType = result.entity.type;
    const recordId = result.entity.id;
    const filePath = this.getFilePath(recordId, entityType);

    const content = await this.fileSystem.readFile(filePath, "utf-8");
    const record = JSON.parse(content) as GitGovRecord;

    if (entityType === "task" && isTaskPayload(record.payload)) {
      const taskPayload = record.payload;
      if (taskPayload.cycleIds) {
        for (const cycleId of taskPayload.cycleIds) {
          const cycleFilePath = this.getFilePath(cycleId, "cycle");
          try {
            const cycleContent = await this.fileSystem.readFile(cycleFilePath, "utf-8");
            const cycleRecord = JSON.parse(cycleContent) as GitGovRecord;
            const cyclePayload = cycleRecord.payload as CycleRecord;

            if (!cyclePayload.taskIds) {
              cyclePayload.taskIds = [];
            }
            if (!cyclePayload.taskIds.includes(recordId)) {
              cyclePayload.taskIds.push(recordId);
              await this.fileSystem.writeFile(cycleFilePath, JSON.stringify(cycleRecord, null, 2));
              logger.info(`Added task ${recordId} to cycle ${cycleId}`);
            }
          } catch {
            // Cycle file doesn't exist, skip
          }
        }
      }
    } else if (entityType === "cycle" && isCyclePayload(record.payload)) {
      const cyclePayload = record.payload;
      if (cyclePayload.taskIds) {
        for (const taskId of cyclePayload.taskIds) {
          const taskFilePath = this.getFilePath(taskId, "task");
          try {
            const taskContent = await this.fileSystem.readFile(taskFilePath, "utf-8");
            const taskRecord = JSON.parse(taskContent) as GitGovRecord;
            const taskPayload = taskRecord.payload as TaskRecord;

            if (!taskPayload.cycleIds) {
              taskPayload.cycleIds = [];
            }
            if (!taskPayload.cycleIds.includes(recordId)) {
              taskPayload.cycleIds.push(recordId);
              await this.fileSystem.writeFile(taskFilePath, JSON.stringify(taskRecord, null, 2));
              logger.info(`Added cycle ${recordId} to task ${taskId}`);
            }
          } catch {
            // Task file doesn't exist, skip
          }
        }
      }
    }
  }

  /**
   * Recalculates checksum for a record.
   * @private
   */
  private async recalculateChecksum(result: LintResult): Promise<void> {
    const content = await this.fileSystem.readFile(result.filePath, "utf-8");
    const record = JSON.parse(content) as GitGovRecord;

    if (!record.header || !record.payload) {
      throw new Error("Cannot recalculate checksum: invalid record structure");
    }

    record.header.payloadChecksum = calculatePayloadChecksum(record.payload);
    await this.fileSystem.writeFile(result.filePath, JSON.stringify(record, null, 2));
    logger.info(`Recalculated checksum for: ${result.filePath}`);
  }

  /**
   * Fixes signature structure issues.
   * @private
   */
  private async fixSignatureStructure(result: LintResult, options: FsFixOptions, allErrors: LintResult[]): Promise<void> {
    if (!options.privateKey) {
      throw new Error("privateKey is required to fix signature");
    }

    const content = await this.fileSystem.readFile(result.filePath, "utf-8");
    const record = JSON.parse(content) as GitGovRecord;

    const fixedRecord = this.lintModule.fixRecord(record, allErrors, {
      fixTypes: ['SIGNATURE_STRUCTURE'],
      ...(options.keyId !== undefined && { keyId: options.keyId }),
      privateKey: options.privateKey
    });

    await this.fileSystem.writeFile(result.filePath, JSON.stringify(fixedRecord, null, 2));
    logger.info(`Fixed signature structure: ${result.filePath}`);
  }

  /**
   * [EARS-E1] Detects validator type from error message.
   * Includes detection of SCHEMA_VERSION_MISMATCH for outdated schemas.
   * @private
   */
  private detectValidatorType(message: string, field?: string): ValidatorType {
    const text = `${message} ${field || ''}`.toLowerCase();

    if (text.includes("checksum")) return "CHECKSUM_VERIFICATION";
    if (text.includes("signature") || text.includes("/signatures/")) return "SIGNATURE_STRUCTURE";
    if (text.includes("header") || text.includes("payload") || text.includes("/header/")) return "EMBEDDED_METADATA_STRUCTURE";

    // [EARS-E1] Detect schema version mismatch indicators
    const versionMismatchIndicators = [
      'required in v', 'deprecated', 'obsolete', 'schema version', 'migration'
    ];
    if (versionMismatchIndicators.some(i => text.includes(i)) || /v\d+|version\s+\d+/i.test(text)) {
      return "SCHEMA_VERSION_MISMATCH";
    }

    return "SCHEMA_VALIDATION";
  }

  /**
   * Determines if an error is fixable.
   * @private
   */
  private isFixable(message: string): boolean {
    const text = message.toLowerCase();
    if (text.includes("header") || text.includes("metadata")) return true;
    if (text.includes("additional properties")) return true;
    if (text.includes("checksum")) return true;
    if (text.includes("signature") && text.includes("format")) return true;
    return false;
  }
}
