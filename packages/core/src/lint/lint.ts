import { promises as fs } from "fs";
import { join, dirname, basename } from "path";
import type {
  ILintModule,
  LintModuleDependencies,
  LintOptions,
  LintReport,
  LintResult,
  FixOptions,
  FixReport,
  FixResult,
  ValidatorType,
  FileSystem
} from "./lint.types";
import type { RecordStore } from "../store/record_store";
import type { IIndexerAdapter } from "../adapters/indexer_adapter";
import type {
  GitGovRecord,
  GitGovRecordPayload,
  CustomRecord,
  TaskRecord,
  CycleRecord,
  ExecutionRecord,
  GitGovRecordType
} from "../types";
import type { Signature } from "../types/embedded.types";
import { DetailedValidationError } from "../validation/common";
import { createLogger } from "../logger";
import { calculatePayloadChecksum } from "../crypto/checksum";
import { signPayload } from "../crypto/signatures";
import { ConfigManager } from "../config_manager";
import { readdir } from "fs/promises";
import {
  loadTaskRecord,
  loadActorRecord,
  loadAgentRecord,
  loadCycleRecord,
  loadExecutionRecord,
  loadChangelogRecord,
  loadFeedbackRecord
} from "../factories";

type StorablePayload = Exclude<GitGovRecordPayload, CustomRecord>;

/**
 * Type guard to check if a payload is a TaskRecord
 */
function isTaskRecord(payload: GitGovRecordPayload): payload is TaskRecord {
  return 'title' in payload && 'status' in payload && 'priority' in payload && 'description' in payload;
}

/**
 * Type guard to check if a payload is a CycleRecord
 */
function isCycleRecord(payload: GitGovRecordPayload): payload is CycleRecord {
  return 'title' in payload && 'status' in payload && !('priority' in payload);
}

/**
 * Type guard to check if a payload is an ExecutionRecord
 */
function isExecutionRecord(payload: GitGovRecordPayload): payload is ExecutionRecord {
  return 'taskId' in payload && 'type' in payload && 'result' in payload;
}


const logger = createLogger("[Lint] ");

/**
 * Structural validation module for GitGovernance records.
 * 
 * Implements Quality Model Layer 1 with delegation to recordStore.read()
 * for base validation and adds additional validations for conventions and references.
 * 
 * Implements ILintModule interface following the same pattern as all other adapters
 * (IBacklogAdapter, IFeedbackAdapter, etc.) for consistency and testability.
 * 
 * @class LintModule
 * @implements {ILintModule}
 * @example
 * ```typescript
 * const lintModule: ILintModule = new LintModule({
 *   recordStore: taskStore,
 *   indexerAdapter: indexerAdapter // optional
 * });
 * 
 * const report = await lintModule.lint({ validateReferences: true });
 * ```
 */
export class LintModule implements ILintModule {
  private readonly recordStore: RecordStore<StorablePayload>;
  private readonly indexerAdapter: IIndexerAdapter | null;
  private readonly fileSystem: FileSystem;
  private lastBackupPath: string | null = null;

  /**
   * Constructor for LintModule with graceful degradation.
   * 
   * @param dependencies - Module dependencies (some optional)
   * @throws {Error} If recordStore is not present
   * 
   * @example
   * ```typescript
   * const lintModule = new LintModule({
   *   recordStore: taskStore, // REQUIRED
   *   indexerAdapter: indexerAdapter, // optional
   *   fileSystem: customFileSystem // optional (default: Node.js fs)
   * });
   * ```
   */
  constructor(dependencies: LintModuleDependencies) {
    // Validate required dependencies
    if (!dependencies.recordStore) {
      throw new Error("recordStore is required for file access");
    }

    this.recordStore = dependencies.recordStore;

    // Optional dependencies with graceful degradation
    this.indexerAdapter = dependencies.indexerAdapter ?? null;
    if (!this.indexerAdapter) {
      logger.warn(
        "indexerAdapter not provided, reference validation will be limited"
      );
    }

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
      }
    };
  }

  /**
   * Valida todos los records en el directorio especificado.
   * 
   * Usa delegation pattern: llama a recordStore.read() que internamente usa loaders
   * para validar schema + embedded metadata. Luego agrega validaciones adicionales
   * (convenciones, referencias).
   * 
   * @param options - Opciones de configuración
   * @returns {Promise<LintReport>} Reporte consolidado con todos los resultados
   * 
   * @example
   * ```typescript
   * const report = await lintModule.lint({
   *   path: '.gitgov/',
   *   validateReferences: true,
   *   validateActors: true,
   *   concurrent: true
   * });
   * 
   * console.log(`Errors: ${report.summary.errors}`);
   * console.log(`Warnings: ${report.summary.warnings}`);
   * ```
   */
  async lint(options?: Partial<LintOptions>): Promise<LintReport> {
    const startTime = Date.now();

    // Merge con defaults
    const opts: LintOptions = {
      path: options?.path ?? ".gitgov/",
      validateReferences: options?.validateReferences ?? false,
      validateActors: options?.validateActors ?? false,
      validateChecksums: options?.validateChecksums ?? true,
      validateSignatures: options?.validateSignatures ?? true,
      validateConventions: options?.validateConventions ?? true,
      failFast: options?.failFast ?? false,
      concurrent: options?.concurrent ?? true,
      concurrencyLimit: options?.concurrencyLimit ?? 10
    };

    const results: LintResult[] = [];

    // Temporarily suppress console.warn from RecordStore to avoid cluttering output
    // The detailed errors will be captured and shown in the lint report
    const originalWarn = console.warn;
    console.warn = () => { }; // Suppress warnings during lint execution

    try {
      // 1. Discovery: Get all record IDs from all stores
      // IMPORTANT: Always scan filesystem directly to find ALL .json files,
      // not just the ones that passed indexer validation.
      // The indexer may skip invalid records, but we want to lint ALL records.
      const recordsWithTypes = await this.discoverAllRecordsWithTypes(opts.path);
      const recordIds = recordsWithTypes.map(r => r.id);

      logger.info(`Starting lint validation for ${recordIds.length} records`);

      // 2. Validation Loop (concurrent or sequential)
      // Create a map of recordId -> entityType for efficient lookup
      // We already have the types from discoverAllRecordsWithTypes
      const recordTypeMap = new Map<string, Exclude<GitGovRecordType, 'custom'>>();
      for (const { id, type } of recordsWithTypes) {
        recordTypeMap.set(id, type);
      }

      if (opts.concurrent) {
        // Process in batches for concurrency control
        const batches = this.chunkArray(recordIds, opts.concurrencyLimit!);

        for (const batch of batches) {
          const batchResults = await Promise.all(
            batch.map(recordId => this.lintSingleRecord(recordId, opts, recordTypeMap.get(recordId)))
          );

          for (const batchResult of batchResults) {
            results.push(...batchResult);

            // Fail-fast: detener si hay errores fatales
            if (opts.failFast && batchResult.some(r => r.level === "error")) {
              logger.warn("Fail-fast mode: stopping after first error");
              break;
            }
          }

          if (opts.failFast && results.some(r => r.level === "error")) {
            break;
          }
        }
      } else {
        // Sequential processing
        for (const recordId of recordIds) {
          const recordResults = await this.lintSingleRecord(recordId, opts, recordTypeMap.get(recordId));
          results.push(...recordResults);

          if (opts.failFast && recordResults.some(r => r.level === "error")) {
            logger.warn("Fail-fast mode: stopping after first error");
            break;
          }
        }
      }

      // 3. Aggregate results
      const executionTime = Date.now() - startTime;
      const errors = results.filter(r => r.level === "error").length;
      const warnings = results.filter(r => r.level === "warning").length;
      const fixable = results.filter(r => r.fixable).length;

      logger.info(
        `Lint completed in ${executionTime}ms: ${recordIds.length} files, ${errors} errors, ${warnings} warnings`
      );

      return {
        summary: {
          filesChecked: recordIds.length,
          errors,
          warnings,
          fixable,
          executionTime
        },
        results,
        metadata: {
          timestamp: new Date().toISOString(),
          options: opts,
          version: "1.0.0"
        }
      };
    } catch (error) {
      logger.error("Lint operation failed:", error);
      throw error;
    } finally {
      // Restore console.warn
      console.warn = originalWarn;
    }
  }

  /**
   * Validates a specific file and returns its results.
   * Ultra-fast validation for single records (target: <50ms).
   * 
   * @param filePath - Path to the file to validate
   * @param options - Configuration options
   * @returns {Promise<LintReport>} Lint report for this single file
   * 
   * @example
   * ```typescript
   * const report = await lintModule.lintFile('.gitgov/tasks/1234567890-task-example.json', {
   *   validateReferences: true
   * });
   * ```
   */
  async lintFile(filePath: string, options?: Partial<LintOptions>): Promise<LintReport> {
    const startTime = Date.now();

    // Extract recordId from filePath
    const recordId = this.extractRecordId(filePath);

    // Determine entity type from file path (more reliable than from recordId)
    // Path format: .gitgov/{type}s/{recordId}.json
    const pathParts = filePath.split('/');
    const typeDirIndex = pathParts.findIndex(part =>
      ['tasks', 'cycles', 'executions', 'changelogs', 'feedback', 'actors', 'agents'].includes(part)
    );
    let entityType: Exclude<GitGovRecordType, 'custom'> = this.getEntityType(recordId);
    if (typeDirIndex >= 0 && pathParts[typeDirIndex]) {
      const typeDir = pathParts[typeDirIndex];
      // Convert directory name to record type (plural -> singular)
      const typeMap: Record<string, Exclude<GitGovRecordType, 'custom'>> = {
        'tasks': 'task',
        'cycles': 'cycle',
        'executions': 'execution',
        'changelogs': 'changelog',
        'feedback': 'feedback',
        'actors': 'actor',
        'agents': 'agent'
      };
      entityType = typeMap[typeDir] || entityType;
    }

    // Merge with defaults
    const opts: LintOptions = {
      path: filePath,
      validateReferences: options?.validateReferences ?? false,
      validateActors: options?.validateActors ?? false,
      validateChecksums: options?.validateChecksums ?? true,
      validateSignatures: options?.validateSignatures ?? true,
      validateConventions: options?.validateConventions ?? true,
      failFast: options?.failFast ?? false,
      concurrent: false, // Single file, no concurrency needed
      concurrencyLimit: 1
    };

    // Temporarily suppress console.warn from RecordStore to avoid cluttering output
    const originalWarn = console.warn;
    console.warn = () => { }; // Suppress warnings during lint execution

    try {
      // Validate single record (pass entityType to ensure correct loader is used)
      const results = await this.lintSingleRecord(recordId, opts, entityType);

      // Build report
      const executionTime = Date.now() - startTime;
      const errors = results.filter(r => r.level === "error").length;
      const warnings = results.filter(r => r.level === "warning").length;
      const fixable = results.filter(r => r.fixable).length;

      return {
        summary: {
          filesChecked: 1,
          errors,
          warnings,
          fixable,
          executionTime
        },
        results,
        metadata: {
          timestamp: new Date().toISOString(),
          options: opts,
          version: "1.0.0"
        }
      };
    } finally {
      // Restore console.warn
      console.warn = originalWarn;
    }
  }

  /**
   * Valida un record individual y retorna sus resultados.
   * 
   * @private
   * @param recordId - ID del record a validar
   * @param options - Opciones de configuración
   * @returns {Promise<LintResult[]>} Array de resultados para este record
   */
  private async lintSingleRecord(
    recordId: string,
    options: LintOptions,
    entityTypeOverride?: Exclude<GitGovRecordType, 'custom'>
  ): Promise<LintResult[]> {
    const results: LintResult[] = [];
    const entityType = entityTypeOverride || this.getEntityType(recordId);
    // Use the path from options if it's a file path, otherwise construct it
    let filePath: string;
    if (options.path && options.path.endsWith('.json')) {
      // Resolve to absolute path if relative
      // Use ConfigManager.findProjectRoot() to ensure we resolve relative to project root, not cwd
      const projectRoot = ConfigManager.findProjectRoot();
      if (options.path.startsWith('/')) {
        filePath = options.path;
      } else if (projectRoot) {
        // If path is relative and we have project root, resolve from project root
        filePath = join(projectRoot, options.path);
      } else {
        // Fallback to process.cwd() if no project root found
        filePath = join(process.cwd(), options.path);
      }
    } else {
      filePath = this.getFilePath(recordId, entityType);
    }

    try {

      // Try to read the file directly and validate with the appropriate loader
      // This works for all record types, not just the one configured in recordStore
      let record: GitGovRecord | null = null;
      try {
        const content = await this.fileSystem.readFile(filePath, 'utf-8');
        const raw = JSON.parse(content);

        // Load with the appropriate loader based on entity type
        // entityType is Exclude<GitGovRecordType, 'custom'>, so no need to check for 'custom'
        switch (entityType) {
          case 'task':
            record = loadTaskRecord(raw);
            break;
          case 'actor':
            record = loadActorRecord(raw);
            break;
          case 'agent':
            record = loadAgentRecord(raw);
            break;
          case 'cycle':
            record = loadCycleRecord(raw);
            break;
          case 'execution':
            record = loadExecutionRecord(raw);
            break;
          case 'changelog':
            record = loadChangelogRecord(raw);
            break;
          case 'feedback':
            record = loadFeedbackRecord(raw);
            break;
          default:
            // Unknown type, try to read with configured recordStore as fallback
            record = await this.recordStore.read(recordId);
        }
      } catch (validationError) {
        // File read or validation failed
        if (validationError instanceof DetailedValidationError) {
          // Filter out redundant oneOf errors when there's an "additional properties" error
          // These oneOf errors are side effects of the additional property, not separate issues
          const hasAdditionalProperties = validationError.errors.some(e =>
            e.message.includes("must NOT have additional properties") ||
            e.message.includes("must not have additional properties")
          );

          // If there's an additional properties error, filter out oneOf errors
          const filteredErrors = hasAdditionalProperties
            ? validationError.errors.filter(e =>
              !e.message.includes("oneOf") &&
              !e.message.includes("must match") &&
              !e.message.includes("boolean schema is false")
            )
            : validationError.errors;

          // Create one LintResult per error to show ALL errors, not just the first one
          for (const err of filteredErrors) {
            // Create temp error with field path in message for better detection
            const tempError = new DetailedValidationError('Record', [err]);
            tempError.message = `${err.field}: ${err.message}`;
            const validatorType = this.detectValidatorType(tempError);
            const isFixable = this.isFixable(tempError);

            results.push({
              level: "error",
              filePath,
              validator: validatorType,
              message: `${err.field}: ${err.message}`,
              entity: {
                type: entityType,
                id: recordId
              },
              fixable: isFixable,
              ...(err && {
                context: {
                  ...(err.field && { field: err.field }),
                  ...(err.value !== undefined && { actual: err.value }),
                  ...(err.message && { expected: err.message })
                }
              })
            });
          }
          return results;
        }

        // If validationError is not DetailedValidationError, it's a file read error
        const fsError = validationError as NodeJS.ErrnoException;
        let errorMessage: string;
        if (fsError.code === 'ENOENT') {
          errorMessage = `Record file not found: ${recordId}`;
        } else if (validationError instanceof SyntaxError) {
          errorMessage = `Invalid JSON in record file: ${recordId}`;
        } else {
          errorMessage = `Failed to read record file: ${validationError instanceof Error ? validationError.message : String(validationError)}`;
        }

        results.push({
          level: "error",
          filePath,
          validator: "SCHEMA_VALIDATION",
          message: errorMessage,
          entity: {
            type: entityType,
            id: recordId
          },
          fixable: false
        });
        return results;
      }

      // If record is null, validation failed but no DetailedValidationError was thrown
      if (!record) {
        results.push({
          level: "error",
          filePath,
          validator: "SCHEMA_VALIDATION",
          message: `Record validation failed: ${recordId}`,
          entity: {
            type: entityType,
            id: recordId
          },
          fixable: false
        });
        return results;
      }

      // Record is valid from store's perspective
      // Apply additional validations

      if (options.validateConventions) {
        const conventionResults = await this.validateConventions(record, recordId, filePath, entityType);
        results.push(...conventionResults);
      }

      if (options.validateReferences && this.indexerAdapter) {
        const refResults = await this.validateReferences(record, recordId, filePath, entityType);
        results.push(...refResults);
      }

      if (options.validateActors && this.indexerAdapter) {
        const actorResults = await this.validateActors(record, recordId, filePath, entityType);
        results.push(...actorResults);
      }

    } catch (error) {
      // Capture validation errors from recordStore.read()
      if (error instanceof DetailedValidationError) {
        // Filter out redundant oneOf errors when there's an "additional properties" error
        // These oneOf errors are side effects of the additional property, not separate issues
        const hasAdditionalProperties = error.errors.some(e =>
          e.message.includes("must NOT have additional properties") ||
          e.message.includes("must not have additional properties")
        );

        // If there's an additional properties error, filter out oneOf errors
        const filteredErrors = hasAdditionalProperties
          ? error.errors.filter(e =>
            !e.message.includes("oneOf") &&
            !e.message.includes("must match") &&
            !e.message.includes("boolean schema is false")
          )
          : error.errors;

        // Create one LintResult per error (not grouped by validator type)
        // This ensures all errors are visible, avoiding "surprise" errors after fixing one
        for (const err of filteredErrors) {
          // Create a temporary error to detect validator type for this specific error
          // Include field path in message for better detection
          const tempError = new DetailedValidationError('Record', [err]);
          tempError.message = `${err.field}: ${err.message}`;
          const validatorType = this.detectValidatorType(tempError);
          const isFixable = this.isFixable(tempError);

          results.push({
            level: "error",
            filePath,
            validator: validatorType,
            message: `${err.field}: ${err.message}`,
            entity: {
              type: entityType,
              id: recordId
            },
            fixable: isFixable,
            ...(err && {
              context: {
                ...(err.field && { field: err.field }),
                ...(err.value !== undefined && { actual: err.value }),
                ...(err.message && { expected: err.message })
              }
            })
          });
        }
      } else {
        // File system errors, parse errors, etc.
        results.push({
          level: "error",
          filePath,
          validator: "SCHEMA_VALIDATION",
          message: error instanceof Error ? error.message : String(error),
          entity: {
            type: entityType,
            id: recordId
          },
          fixable: false
        });
      }
    }

    return results;
  }

  /**
   * Valida un archivo específico.
   * 
   * Útil para validación en vivo (ej: dashboard, IDE integration).
   * 
   * @param filePath - Path del archivo a validar
   * @param options - Opciones de configuración
   * @returns {Promise<LintResult[]>} Resultados de validación para este archivo
   * 
   * @example
   * ```typescript
   * const results = await lintModule.lintFile(
   *   '.gitgov/tasks/task-123.json',
   *   { validateReferences: true }
   * );
   * ```
   */
  /**
   * Applies automatic repairs to problems marked as fixable.
   * 
   * @param lintReport - Lint report with detected problems
   * @param fixOptions - Options for the fix operation
   * @returns {Promise<FixReport>} Report of applied repairs
   * 
   * @example
   * ```typescript
   * const lintReport = await lintModule.lint();
   * const fixReport = await lintModule.fix(lintReport, {
   *   createBackups: true,
   *   keyId: 'system:migrator'
   * });
   * 
   * console.log(`Fixed: ${fixReport.summary.fixed}`);
   * ```
   */
  async fix(
    lintReport: LintReport,
    fixOptions?: Partial<FixOptions>
  ): Promise<FixReport> {
    const opts: FixOptions = {
      ...(fixOptions?.fixTypes && { fixTypes: fixOptions.fixTypes }),
      createBackups: fixOptions?.createBackups ?? true,
      keyId: fixOptions?.keyId ?? "system:migrator",
      dryRun: fixOptions?.dryRun ?? false,
      ...(fixOptions?.privateKey && { privateKey: fixOptions.privateKey })
    };

    const fixes: FixResult[] = [];

    // Filter fixable problems
    let fixableResults = lintReport.results.filter(r => r.fixable);

    // Filter by fix types if specified
    if (opts.fixTypes && opts.fixTypes.length > 0) {
      fixableResults = fixableResults.filter(r =>
        opts.fixTypes!.includes(r.validator)
      );
    }

    logger.info(`Starting fix operation for ${fixableResults.length} fixable problems`);

    // Group results by filePath and validator to avoid fixing the same file multiple times
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

    // Process each file once, passing all errors for that file/validator combination
    for (const [, validatorMap] of resultsByFile) {
      for (const [, results] of validatorMap) {
        // Use the first result for file path and entity info, but pass all results for context
        const primaryResult = results[0]!;

        // Declare backupPath outside try block so it's available in catch
        let backupPath: string | undefined;

        try {
          if (opts.dryRun) {
            // Dry run: report what would be done
            fixes.push({
              filePath: primaryResult.filePath,
              validator: primaryResult.validator,
              action: `Would fix ${primaryResult.validator} (${results.length} error${results.length === 1 ? '' : 's'})`,
              success: true
            });
            continue;
          }

          // Create backup if requested (only once per file)
          if (opts.createBackups && !backupPath) {
            backupPath = await this.createBackup(primaryResult.filePath);
          }

          // Apply fix based on validator type, passing all errors for context
          await this.applyFix(primaryResult, opts, results);

          fixes.push({
            filePath: primaryResult.filePath,
            validator: primaryResult.validator,
            action: `Fixed ${primaryResult.validator} (${results.length} error${results.length === 1 ? '' : 's'})`,
            success: true,
            ...(backupPath && { backupPath })
          });

          logger.debug(`Successfully fixed ${primaryResult.filePath} (${primaryResult.validator}, ${results.length} errors)`);

        } catch (error) {
          // Restore backup on failure
          if (opts.createBackups && backupPath) {
            try {
              await this.restoreBackup(primaryResult.filePath);
              logger.warn(`Restored backup for ${primaryResult.filePath} after fix failure`);
            } catch (restoreError) {
              logger.error(`Failed to restore backup for ${primaryResult.filePath}:`, restoreError);
            }
          }

          fixes.push({
            filePath: primaryResult.filePath,
            validator: primaryResult.validator,
            action: `Failed to fix ${primaryResult.validator}`,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            ...(backupPath && { backupPath }) // Include backup path even if fix failed
          });

          logger.error(`Failed to fix ${primaryResult.filePath}:`, error);
        }
      }
    }

    const summary = {
      fixed: fixes.filter(f => f.success).length,
      failed: fixes.filter(f => !f.success).length,
      backupsCreated: opts.createBackups ? fixes.filter(f => f.backupPath).length : 0
    };

    logger.info(
      `Fix operation completed: ${summary.fixed} fixed, ${summary.failed} failed, ${summary.backupsCreated} backups created`
    );

    return {
      summary,
      fixes
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Splits an array into chunks of the specified size.
   * @private
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }


  /**
   * Discovers all records with their types by scanning the filesystem.
   * This ensures we know the correct type for each record based on its directory.
   * @private
   */
  private async discoverAllRecordsWithTypes(path?: string): Promise<Array<{ id: string; type: Exclude<GitGovRecordType, 'custom'> }>> {
    const projectRoot = ConfigManager.findProjectRoot() || path || '.gitgov/';
    // Use GitGovRecordType to get all record types (excluding 'custom' which is for testing)
    const recordTypes: Array<Exclude<GitGovRecordType, 'custom'>> = [
      'actor', 'agent', 'cycle', 'task', 'execution', 'changelog', 'feedback'
    ];
    const allRecords: Array<{ id: string; type: Exclude<GitGovRecordType, 'custom'> }> = [];

    for (const recordType of recordTypes) {
      // Convert record type to directory name (pluralize: task -> tasks, cycle -> cycles, etc.)
      // Note: feedback and changelog have special pluralization rules
      const dirNameMap: Record<Exclude<GitGovRecordType, 'custom'>, string> = {
        'task': 'tasks',
        'cycle': 'cycles',
        'execution': 'executions',
        'changelog': 'changelogs',
        'feedback': 'feedback',  // feedback directory is singular, not plural
        'actor': 'actors',
        'agent': 'agents'
      };
      const dirName = dirNameMap[recordType];
      const dirPath = join(projectRoot, '.gitgov', dirName);
      try {
        const files = await readdir(dirPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        // Extract record IDs from filenames (remove .json extension)
        // We know the type from the directory, so store it with the ID
        const records = jsonFiles.map(f => ({
          id: f.replace('.json', ''),
          type: recordType
        }));
        allRecords.push(...records);
      } catch (error) {
        // Directory doesn't exist or can't be read, skip it
        continue;
      }
    }

    return allRecords;
  }

  /**
   * Gets the file path for a given recordId.
   * Matches the format used by RecordStore.getRecordPath()
   * @private
   */
  private getFilePath(recordId: string, entityTypeOverride?: Exclude<GitGovRecordType, 'custom'>): string {
    const type = entityTypeOverride || this.getEntityType(recordId);
    const projectRoot = ConfigManager.findProjectRoot();

    // Use the same directory name mapping as discoverAllRecordsWithTypes
    const dirNameMap: Record<Exclude<GitGovRecordType, 'custom'>, string> = {
      'task': 'tasks',
      'cycle': 'cycles',
      'execution': 'executions',
      'changelog': 'changelogs',
      'feedback': 'feedback',  // feedback directory is singular, not plural
      'actor': 'actors',
      'agent': 'agents'
    };
    const dirName = dirNameMap[type];

    if (!projectRoot) {
      // Fallback to relative path if no project root found
      const safeId = recordId.replace(/:/g, '_');
      return join(".gitgov", dirName, `${safeId}.json`);
    }
    const safeId = recordId.replace(/:/g, '_');
    return join(projectRoot, ".gitgov", dirName, `${safeId}.json`);
  }

  /**
   * Extracts the recordId from a filePath.
   * @private
   */
  private extractRecordId(filePath: string): string {
    return basename(filePath, ".json");
  }

  /**
   * Detects the entity type from a recordId.
   * @private
   */
  private getEntityType(recordId: string): Exclude<GitGovRecordType, 'custom'> {
    // Use GitGovRecordType for type safety
    // Check in order of specificity (longer/more specific patterns first to avoid false matches)
    // Pattern: {timestamp}-{type}-{slug} or {type}:{id} or {prefix}_{id}
    if (recordId.match(/^\d+-exec-/)) return "execution";
    if (recordId.match(/^\d+-changelog-/)) return "changelog";
    if (recordId.match(/^\d+-feedback-/)) return "feedback";
    if (recordId.match(/^\d+-cycle-/)) return "cycle";
    if (recordId.match(/^\d+-task-/)) return "task";
    if (recordId.startsWith("execution:") || recordId.includes("-execution-")) return "execution";
    if (recordId.startsWith("changelog:") || recordId.includes("-changelog-")) return "changelog";
    if (recordId.startsWith("feedback:") || recordId.includes("-feedback-")) return "feedback";
    if (recordId.startsWith("task:") || recordId.includes("-task-")) return "task";
    if (recordId.startsWith("cycle:") || recordId.includes("-cycle-")) return "cycle";
    // Check for actor/agent patterns: human:*, agent:*, human_*, agent_*
    if (recordId.startsWith("actor:") || recordId.startsWith("human:") || recordId.startsWith("agent:")) return "actor";
    if (recordId.startsWith("human_") || recordId.match(/^human-/)) return "actor";
    if (recordId.startsWith("agent_") || recordId.match(/^agent-/)) return "agent";
    if (recordId.startsWith("agent:")) return "agent";
    return "task"; // Default fallback
  }

  /**
   * Detects the validator type based on the error.
   * @private
   */
  private detectValidatorType(error: DetailedValidationError): ValidatorType {
    // Check both the error message and the field path from errors array
    const errorMessage = error.message.toLowerCase();
    const fieldPath = error.errors?.[0]?.field?.toLowerCase() || '';
    const allErrorMessages = error.errors?.map(e => e.message?.toLowerCase() || '').join(' ') || '';

    // Combine message and field path for detection
    const combinedText = `${errorMessage} ${fieldPath} ${allErrorMessages}`;

    if (combinedText.includes("checksum") || fieldPath.includes("payloadchecksum")) {
      return "CHECKSUM_VERIFICATION";
    }
    // Check for signature errors (including path patterns like /header/signatures/0/signature)
    if (combinedText.includes("signature") || fieldPath.includes("/signatures/") || fieldPath.includes("signatures")) {
      return "SIGNATURE_STRUCTURE";
    }
    if (combinedText.includes("header") || combinedText.includes("payload") || fieldPath.includes("/header/")) {
      return "EMBEDDED_METADATA_STRUCTURE";
    }

    // Check for schema version mismatch indicators
    // These patterns suggest the record structure doesn't match the current schema version:
    // - "required in v2", "field required in v2", "v2", "version", "deprecated", "obsolete"
    // - Missing new required fields that were added in a newer schema version
    // - Presence of deprecated fields
    const versionMismatchIndicators = [
      'required in v',
      'field required in v',
      'deprecated',
      'obsolete',
      'schema version',
      'migration',
      'v1 to v2',
      'v2 to v3'
    ];

    const hasVersionMismatchIndicator = versionMismatchIndicators.some(indicator =>
      combinedText.includes(indicator)
    );

    // Also check if error message suggests a new required field (schema evolution)
    // Pattern: "Field required in v2" or similar version-specific messages
    const hasVersionSpecificMessage = /v\d+|version\s+\d+/i.test(combinedText);

    if (hasVersionMismatchIndicator || hasVersionSpecificMessage) {
      return "SCHEMA_VERSION_MISMATCH";
    }

    return "SCHEMA_VALIDATION";
  }

  /**
   * Determines if an error is fixable.
   * @private
   */
  private isFixable(error: DetailedValidationError): boolean {
    const errorMessage = error.message.toLowerCase();

    // Legacy records without embedded metadata are fixable
    if (errorMessage.includes("header") || errorMessage.includes("metadata")) {
      return true;
    }

    // Additional properties in payload are fixable (can be removed)
    if (errorMessage.includes("must not have additional properties") || errorMessage.includes("must NOT have additional properties")) {
      return true;
    }

    // Invalid checksums are fixable
    if (errorMessage.includes("checksum")) {
      return true;
    }

    // Signatures with incorrect format are fixable
    if (errorMessage.includes("signature") && errorMessage.includes("format")) {
      return true;
    }

    return false;
  }

  /**
   * Validates conventions (file naming, timestamps, etc).
   * Implements EARS-13 through EARS-16.
   * @private
   */
  private async validateConventions(
    record: GitGovRecord,
    recordId: string,
    filePath: string,
    entityType: Exclude<GitGovRecordType, 'custom'>
  ): Promise<LintResult[]> {
    const results: LintResult[] = [];

    // EARS-13: Validate file is in correct directory
    // Use the same directory name mapping as discoverAllRecordsWithTypes and getFilePath
    const dirNameMap: Record<Exclude<GitGovRecordType, 'custom'>, string> = {
      'task': 'tasks',
      'cycle': 'cycles',
      'execution': 'executions',
      'changelog': 'changelogs',
      'feedback': 'feedback',  // feedback directory is singular, not plural
      'actor': 'actors',
      'agent': 'agents'
    };
    const expectedDir = `.gitgov/${dirNameMap[entityType]}`;
    if (!filePath.includes(expectedDir)) {
      results.push({
        level: "error",
        filePath,
        validator: "FILE_NAMING_CONVENTION",
        message: `File should be in ${expectedDir}/ directory but found in ${filePath}`,
        entity: {
          type: entityType,
          id: recordId
        },
        fixable: false,
        context: {
          field: "directory",
          actual: dirname(filePath),
          expected: expectedDir
        }
      });
    }

    // EARS-14: Validate filename matches entity ID
    const expectedFilename = `${recordId}.json`;
    const actualFilename = basename(filePath);
    if (actualFilename !== expectedFilename) {
      results.push({
        level: "error",
        filePath,
        validator: "FILE_NAMING_CONVENTION",
        message: `Filename '${actualFilename}' does not match entity ID '${recordId}'`,
        entity: {
          type: entityType,
          id: recordId
        },
        fixable: false,
        context: {
          field: "filename",
          actual: actualFilename,
          expected: expectedFilename
        }
      });
    }

    // EARS-15 & EARS-16: Validate timestamp ordering
    // Note: These fields are not in the schema but may exist in legacy records
    const payload = record.payload as GitGovRecordPayload & {
      createdAt?: number | string;
      updatedAt?: number | string;
      completedAt?: number | string;
      discardedAt?: number | string;
    };
    if (payload.createdAt && payload.updatedAt) {
      const created = new Date(payload.createdAt).getTime();
      const updated = new Date(payload.updatedAt).getTime();

      if (created > updated) {
        results.push({
          level: "error",
          filePath,
          validator: "TEMPORAL_CONSISTENCY",
          message: `createdAt (${String(payload.createdAt)}) is after updatedAt (${String(payload.updatedAt)})`,
          entity: {
            type: entityType,
            id: recordId
          },
          fixable: false,
          context: {
            field: "timestamps",
            actual: { createdAt: payload.createdAt, updatedAt: payload.updatedAt },
            expected: "createdAt <= updatedAt"
          }
        });
      }

      // Check completedAt if present
      if (payload.completedAt) {
        const completed = new Date(payload.completedAt).getTime();
        if (completed < created) {
          results.push({
            level: "error",
            filePath,
            validator: "TEMPORAL_CONSISTENCY",
            message: `completedAt (${String(payload.completedAt)}) is before createdAt (${String(payload.createdAt)})`,
            entity: {
              type: entityType,
              id: recordId
            },
            fixable: false
          });
        }
      }

      // Check discardedAt if present
      if (payload.discardedAt) {
        const discarded = new Date(payload.discardedAt).getTime();
        if (discarded < created) {
          results.push({
            level: "error",
            filePath,
            validator: "TEMPORAL_CONSISTENCY",
            message: `discardedAt (${String(payload.discardedAt)}) is before createdAt (${String(payload.createdAt)})`,
            entity: {
              type: entityType,
              id: recordId
            },
            fixable: false
          });
        }
      }
    }

    return results;
  }

  /**
   * Validates references (typed references, bidirectional consistency).
   * Implements EARS-17 through EARS-22.
   * Requires indexerAdapter to be present.
   * @private
   */
  private async validateReferences(
    record: GitGovRecord,
    recordId: string,
    filePath: string,
    entityType: Exclude<GitGovRecordType, 'custom'>
  ): Promise<LintResult[]> {
    const results: LintResult[] = [];
    // Use actual types from schemas - TaskRecord and ExecutionRecord have references, CycleRecord has taskIds
    const payload = record.payload;

    // EARS-17: Validate ExecutionRecord.taskId exists
    if (entityType === "execution" && isExecutionRecord(payload) && payload.taskId) {
      try {
        const taskRecord = await this.recordStore.read(payload.taskId);
        if (!taskRecord) {
          results.push({
            level: "warning",
            filePath,
            validator: "REFERENTIAL_INTEGRITY",
            message: `Referenced taskId '${payload.taskId}' not found`,
            entity: {
              type: entityType,
              id: recordId
            },
            fixable: false,
            context: {
              field: "taskId",
              actual: payload.taskId,
              expected: "existing task record"
            }
          });
        } else {
          // EARS-22: Check for soft delete
          // TaskRecord has status in its schema
          const taskPayload = taskRecord.payload as TaskRecord;
          if (taskPayload.status === "discarded") {
            results.push({
              level: "warning",
              filePath,
              validator: "SOFT_DELETE_DETECTION",
              message: `Referenced task '${payload.taskId}' has status 'discarded'`,
              entity: {
                type: entityType,
                id: recordId
              },
              fixable: false
            });
          }
        }
      } catch (error) {
        results.push({
          level: "warning",
          filePath,
          validator: "REFERENTIAL_INTEGRITY",
          message: `Failed to validate taskId reference: ${error instanceof Error ? error.message : String(error)}`,
          entity: {
            type: entityType,
            id: recordId
          },
          fixable: false
        });
      }
    }

    // EARS-18: Validate typed references by prefix
    // Only TaskRecord and ExecutionRecord have references in their schema
    if (isTaskRecord(payload) || isExecutionRecord(payload)) {
      const payloadWithRefs = payload as TaskRecord | ExecutionRecord;
      if (payloadWithRefs.references && Array.isArray(payloadWithRefs.references)) {
        for (const ref of payloadWithRefs.references) {
          const refStr = String(ref);

          // Validate format: prefix:value
          if (!refStr.includes(":")) {
            results.push({
              level: "warning",
              filePath,
              validator: "TYPED_REFERENCE",
              message: `Reference '${refStr}' missing type prefix (expected: task:, cycle:, file:, etc.)`,
              entity: {
                type: entityType,
                id: recordId
              },
              fixable: false,
              context: {
                field: "references",
                actual: refStr,
                expected: "prefix:value format"
              }
            });
            continue;
          }

          const parts = refStr.split(":", 2);
          if (parts.length < 2) continue; // Already handled above

          const [prefix, value] = parts;
          if (!prefix || !value) continue;

          // Validate known prefixes
          const knownPrefixes = ["task", "cycle", "execution", "changelog", "feedback", "actor", "agent", "file", "url", "commit", "pr", "adapter"];
          if (!knownPrefixes.includes(prefix)) {
            results.push({
              level: "warning",
              filePath,
              validator: "TYPED_REFERENCE",
              message: `Unknown reference prefix '${prefix}' (known: ${knownPrefixes.join(", ")})`,
              entity: {
                type: entityType,
                id: recordId
              },
              fixable: false,
              context: {
                field: "references",
                actual: prefix,
                expected: knownPrefixes.join(", ")
              }
            });
          }

          // EARS-20: Validate task/cycle/execution references exist
          if (["task", "cycle", "execution", "changelog", "feedback"].includes(prefix)) {
            try {
              const referencedRecord = await this.recordStore.read(value);
              if (!referencedRecord) {
                results.push({
                  level: "warning",
                  filePath,
                  validator: "REFERENTIAL_INTEGRITY",
                  message: `Referenced ${prefix} '${value}' not found`,
                  entity: {
                    type: entityType,
                    id: recordId
                  },
                  fixable: false,
                  context: {
                    field: "references",
                    actual: refStr,
                    expected: `existing ${prefix} record`
                  }
                });
              } else {
                // EARS-22: Check for soft delete
                // Most records have status in their schema
                const refPayload = referencedRecord.payload;
                if ('status' in refPayload && refPayload.status === "discarded") {
                  results.push({
                    level: "warning",
                    filePath,
                    validator: "SOFT_DELETE_DETECTION",
                    message: `Referenced ${prefix} '${value}' has status 'discarded'`,
                    entity: {
                      type: entityType,
                      id: recordId
                    },
                    fixable: false
                  });
                }
              }
            } catch (error) {
              // Silently continue if reference doesn't exist (already reported)
            }
          }
        }
      }
    }

    // EARS-21: Validate bidirectional consistency (Task ↔ Cycle)
    // TaskRecord has cycleIds[] and CycleRecord has taskIds[]
    if (entityType === "task" && isTaskRecord(payload) && payload.cycleIds && Array.isArray(payload.cycleIds)) {
      for (const cycleId of payload.cycleIds) {
        try {
          const cycleRecord = await this.recordStore.read(cycleId);
          if (cycleRecord) {
            // CycleRecord has taskIds in its schema
            const cyclePayload = cycleRecord.payload as CycleRecord;
            if (cyclePayload.taskIds && Array.isArray(cyclePayload.taskIds)) {
              if (!cyclePayload.taskIds.includes(recordId)) {
                results.push({
                  level: "warning",
                  filePath,
                  validator: "BIDIRECTIONAL_CONSISTENCY",
                  message: `Task references cycle '${cycleId}' in cycleIds but cycle doesn't include this task in taskIds[]`,
                  entity: {
                    type: entityType,
                    id: recordId
                  },
                  fixable: true,
                  context: {
                    field: "cycleIds",
                    actual: cycleId,
                    expected: `cycle should include task ${recordId} in taskIds[]`
                  }
                });
              }
            }
          }
        } catch (error) {
          // Already reported as REFERENTIAL_INTEGRITY above
        }
      }
    }

    if (entityType === "cycle" && isCycleRecord(payload) && payload.taskIds && Array.isArray(payload.taskIds)) {
      for (const taskId of payload.taskIds) {
        try {
          const taskRecord = await this.recordStore.read(taskId);
          if (taskRecord) {
            // TaskRecord has cycleIds in its schema
            const taskPayload = taskRecord.payload as TaskRecord;
            if (!taskPayload.cycleIds || !taskPayload.cycleIds.includes(recordId)) {
              results.push({
                level: "warning",
                filePath,
                validator: "BIDIRECTIONAL_CONSISTENCY",
                message: `Cycle includes task '${taskId}' in taskIds[] but task doesn't include this cycle in cycleIds[]`,
                entity: {
                  type: entityType,
                  id: recordId
                },
                fixable: true,
                context: {
                  field: "taskIds",
                  actual: taskPayload.cycleIds || [],
                  expected: `task should include cycle ${recordId} in cycleIds[]`
                }
              });
            }
          }
        } catch (error) {
          // Already reported as REFERENTIAL_INTEGRITY
        }
      }
    }

    return results;
  }

  /**
   * Validates actorIds (resolution in .gitgov/actors/).
   * Implements EARS-19.
   * @private
   */
  private async validateActors(
    record: GitGovRecord,
    recordId: string,
    filePath: string,
    entityType: Exclude<GitGovRecordType, 'custom'>
  ): Promise<LintResult[]> {
    const results: LintResult[] = [];

    // Extract all actorIds from signatures
    if (record.header && record.header.signatures && Array.isArray(record.header.signatures)) {
      for (const signature of record.header.signatures) {
        if (signature.keyId) {
          try {
            const actorRecord = await this.recordStore.read(signature.keyId);
            if (!actorRecord) {
              results.push({
                level: "warning",
                filePath,
                validator: "ACTOR_RESOLUTION",
                message: `Actor '${signature.keyId}' referenced in signature not found in .gitgov/actors/`,
                entity: {
                  type: entityType,
                  id: recordId
                },
                fixable: false,
                context: {
                  field: "signatures.keyId",
                  actual: signature.keyId,
                  expected: "existing actor record"
                }
              });
            }
          } catch (error) {
            results.push({
              level: "warning",
              filePath,
              validator: "ACTOR_RESOLUTION",
              message: `Failed to validate actor '${signature.keyId}': ${error instanceof Error ? error.message : String(error)}`,
              entity: {
                type: entityType,
                id: recordId
              },
              fixable: false
            });
          }
        }
      }
    }

    // Check actorId field in payload (for some record types)
    // Note: Most records don't have actorId in their schema, but it may exist in legacy records
    const payload = record.payload;
    if ('actorId' in payload && payload.actorId) {
      const actorId = (payload as { actorId?: string }).actorId;
      if (actorId) {
        try {
          const actorRecord = await this.recordStore.read(actorId);
          if (!actorRecord) {
            results.push({
              level: "warning",
              filePath,
              validator: "ACTOR_RESOLUTION",
              message: `Actor '${actorId}' referenced in payload not found`,
              entity: {
                type: entityType,
                id: recordId
              },
              fixable: false,
              context: {
                field: "actorId",
                actual: actorId,
                expected: "existing actor record"
              }
            });
          }
        } catch (error) {
          // Silently continue
        }
      }
    }

    return results;
  }

  /**
   * Applies a specific repair based on the problem type.
   * @private
   */
  private async applyFix(result: LintResult, options: FixOptions, allErrors?: LintResult[]): Promise<void> {
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
        await this.fixSignatureStructure(result, options, allErrors || [result]);
        break;

      default:
        throw new Error(`Fix not implemented for validator: ${result.validator}`);
    }
  }

  /**
   * Repairs a legacy record by wrapping it in embedded metadata.
   * Implements EARS-24: Normalize legacy records with signature.
   * @private
   */
  private async fixLegacyRecord(result: LintResult, options: FixOptions, allErrors?: LintResult[]): Promise<void> {
    if (!options.privateKey) {
      throw new Error("privateKey is required in FixOptions to sign legacy records");
    }

    // Read the raw file
    // All records MUST have EmbeddedMetadataRecord structure (header + payload)
    const fileContent = await this.fileSystem.readFile(result.filePath, "utf-8");
    const rawData = JSON.parse(fileContent) as unknown;

    // Validate that it has the required EmbeddedMetadataRecord structure
    if (typeof rawData !== 'object' || rawData === null || !('header' in rawData) || !('payload' in rawData)) {
      throw new Error(`Record does not have EmbeddedMetadataRecord structure (missing header or payload): ${result.filePath}`);
    }

    const rawObj = rawData as Record<string, unknown>;
    if (!rawObj['header'] || !rawObj['payload']) {
      throw new Error(`Record does not have EmbeddedMetadataRecord structure (missing header or payload): ${result.filePath}`);
    }

    const embeddedRecord = rawData as GitGovRecord;

    // Check if there are errors about additional properties in payload
    const hasAdditionalProperties = allErrors?.some(e =>
      e.message.includes("must NOT have additional properties") &&
      e.message.includes("/payload")
    );

    if (hasAdditionalProperties) {
      // Remove additional properties from payload by loading it through the factory
      // which will validate and return only valid properties
      const entityType = this.getEntityType(result.entity.id);
      let cleanPayload: GitGovRecordPayload;

      try {
        // Try to load the payload through the appropriate factory
        // This will fail if there are additional properties, but we can catch and clean manually
        switch (entityType) {
          case 'task':
            // Extract only valid properties from task schema
            const taskPayload = embeddedRecord.payload as Partial<TaskRecord>;
            cleanPayload = {
              id: taskPayload.id!,
              title: taskPayload.title!,
              status: taskPayload.status!,
              priority: taskPayload.priority!,
              description: taskPayload.description!,
              ...(taskPayload.cycleIds && { cycleIds: taskPayload.cycleIds }),
              ...(taskPayload.tags && { tags: taskPayload.tags }),
              ...(taskPayload.references && { references: taskPayload.references }),
              ...(taskPayload.notes && { notes: taskPayload.notes })
            } as TaskRecord;
            break;
          case 'cycle':
            const cyclePayload = embeddedRecord.payload as Partial<CycleRecord>;
            cleanPayload = {
              id: cyclePayload.id!,
              title: cyclePayload.title!,
              status: cyclePayload.status!,
              ...(cyclePayload.taskIds && { taskIds: cyclePayload.taskIds }),
              ...(cyclePayload.childCycleIds && { childCycleIds: cyclePayload.childCycleIds }),
              ...(cyclePayload.tags && { tags: cyclePayload.tags }),
              ...(cyclePayload.notes && { notes: cyclePayload.notes })
            } as CycleRecord;
            break;
          default:
            // For other types, just recalculate checksum (can't safely remove properties without schema)
            await this.recalculateChecksum(result);
            return;
        }

        // Recalculate checksum with cleaned payload
        const payloadChecksum = calculatePayloadChecksum(cleanPayload);

        // Regenerate signature
        const signature = signPayload(
          cleanPayload,
          options.privateKey,
          options.keyId || result.entity.id,
          'author',
          'Signature regenerated after removing additional properties'
        );

        // Update record
        const fixedRecord: GitGovRecord = {
          header: {
            ...embeddedRecord.header,
            payloadChecksum,
            signatures: [signature]
          },
          payload: cleanPayload
        };

        await this.fileSystem.writeFile(
          result.filePath,
          JSON.stringify(fixedRecord, null, 2)
        );

        logger.info(`Removed additional properties from payload: ${result.filePath}`);
        return;
      } catch (error) {
        // If cleaning fails, fall back to recalculating checksum
        logger.warn(`Could not clean additional properties, recalculating checksum only: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // If no additional properties or cleaning failed, just recalculate checksum
    await this.recalculateChecksum(result);
  }

  /**
   * Repairs bidirectional inconsistencies between Task and Cycle.
   * Implements EARS-25: Sync bidirectional references.
   * @private
   */
  private async fixBidirectionalReference(result: LintResult): Promise<void> {
    const entityType = result.entity.type;
    const recordId = result.entity.id;

    if (entityType === "task") {
      // Task references cycles in cycleIds[] that don't include it in their taskIds[]
      const taskRecord = await this.recordStore.read(recordId);
      if (!taskRecord) return;

      const taskPayload = taskRecord.payload as TaskRecord;
      if (!taskPayload.cycleIds || taskPayload.cycleIds.length === 0) return;

      // For each cycleId in the task, ensure the cycle includes this task
      for (const cycleId of taskPayload.cycleIds) {
        const cycleRecord = await this.recordStore.read(cycleId);
        if (!cycleRecord) continue;

        const mutableCyclePayload = cycleRecord.payload as CycleRecord;
        if (!mutableCyclePayload.taskIds) {
          mutableCyclePayload.taskIds = [];
        }

        if (!mutableCyclePayload.taskIds.includes(recordId)) {
          mutableCyclePayload.taskIds.push(recordId);

          // Write updated cycle
          const cycleFilePath = this.getFilePath(cycleId);
          await this.fileSystem.writeFile(
            cycleFilePath,
            JSON.stringify(cycleRecord, null, 2)
          );

          logger.info(`Fixed bidirectional reference: Added task ${recordId} to cycle ${cycleId}`);
        }
      }
    } else if (entityType === "cycle") {
      // Cycle includes tasks in taskIds[] that don't include it in their cycleIds[]
      const cycleRecord = await this.recordStore.read(recordId);
      if (!cycleRecord) return;

      const cyclePayload = cycleRecord.payload as CycleRecord;
      if (!cyclePayload.taskIds || cyclePayload.taskIds.length === 0) return;

      // Extract taskId from context if available, otherwise fix all tasks
      const taskIdFromContext = result.context?.actual as string | undefined;
      const tasksToFix = taskIdFromContext ? [taskIdFromContext] : cyclePayload.taskIds;

      for (const taskId of tasksToFix) {
        const taskRecord = await this.recordStore.read(taskId);
        if (!taskRecord) continue;

        const taskPayload = taskRecord.payload as TaskRecord;
        if (!taskPayload.cycleIds) {
          taskPayload.cycleIds = [];
        }

        if (!taskPayload.cycleIds.includes(recordId)) {
          taskPayload.cycleIds.push(recordId);

          // Write updated task
          const taskFilePath = this.getFilePath(taskId);
          await this.fileSystem.writeFile(
            taskFilePath,
            JSON.stringify(taskRecord, null, 2)
          );

          logger.info(`Fixed bidirectional reference: Added cycle ${recordId} to task ${taskId} in cycleIds[]`);
        }
      }
    }
  }

  /**
   * Recalculates the checksum of a record.
   * Implements checksum repair for corrupted checksums.
   * @private
   */
  private async recalculateChecksum(result: LintResult): Promise<void> {
    const fileContent = await this.fileSystem.readFile(result.filePath, "utf-8");
    const record = JSON.parse(fileContent) as GitGovRecord;

    if (!record.header || !record.payload) {
      throw new Error("Cannot recalculate checksum: invalid record structure");
    }

    // Recalculate checksum
    const correctChecksum = calculatePayloadChecksum(record.payload);
    record.header.payloadChecksum = correctChecksum;

    // Write updated record
    await this.fileSystem.writeFile(
      result.filePath,
      JSON.stringify(record, null, 2)
    );

    logger.info(`Recalculated checksum for: ${result.filePath}`);
  }

  /**
   * Creates a backup of a file.
   * @private
   */
  private async createBackup(filePath: string): Promise<string> {
    const timestamp = Date.now();
    const backupPath = `${filePath}.backup-${timestamp}`;

    const content = await this.fileSystem.readFile(filePath, "utf-8");
    await this.fileSystem.writeFile(backupPath, content);

    // Store backup path for later restoration
    this.lastBackupPath = backupPath;

    return backupPath;
  }

  /**
   * Fixes signature structure errors by analyzing specific errors and applying targeted fixes.
   * Reads the record directly (bypassing validation), extracts payload, and fixes signature issues:
   * - Adds missing 'notes' field with a valid value
   * - Removes additional properties not allowed
   * - Regenerates invalid signatures
   * Works even when signatures have invalid format (e.g., "placeholder" instead of base64).
   * @private
   */
  private async fixSignatureStructure(result: LintResult, options: FixOptions, allErrors: LintResult[]): Promise<void> {
    if (!options.privateKey) {
      throw new Error('Private key required to fix signature structure errors');
    }

    // Read the record file directly (bypassing validation - signatures may be invalid)
    // All records MUST have EmbeddedMetadataRecord structure (header + payload)
    const content = await this.fileSystem.readFile(result.filePath, 'utf-8');
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Invalid JSON in file: ${result.filePath}`);
    }

    // Validate that it has the required EmbeddedMetadataRecord structure
    if (typeof raw !== 'object' || raw === null || !('header' in raw) || !('payload' in raw)) {
      throw new Error(`Record does not have EmbeddedMetadataRecord structure (missing header or payload): ${result.filePath}`);
    }

    const rawObj = raw as Record<string, unknown>;
    if (!rawObj['header'] || !rawObj['payload']) {
      throw new Error(`Record does not have EmbeddedMetadataRecord structure (missing header or payload): ${result.filePath}`);
    }

    const embeddedRecord = raw as GitGovRecord;
    const payload = embeddedRecord.payload;
    const existingHeader = embeddedRecord.header;

    // Recalculate checksum
    const payloadChecksum = calculatePayloadChecksum(payload);

    // Analyze all errors to determine what needs to be fixed
    const needsNotes = allErrors.some(e => e.message.includes("must have required property 'notes'"));
    const hasAdditionalProperties = allErrors.some(e => e.message.includes("must NOT have additional properties"));
    const hasInvalidSignature = allErrors.some(e => e.message.includes("signature: must match pattern"));

    // Determine keyId and role - try to use existing signature values, or fallback to options/entity id
    let keyId = options.keyId || result.entity.id;
    let role = 'author';
    let notes = 'Signature regenerated by lint --fix';

    if (existingHeader?.signatures?.[0]) {
      const existingSig = existingHeader.signatures[0];
      // Prefer keyId from existing signature if available
      if (existingSig.keyId) {
        keyId = existingSig.keyId;
      }
      // Preserve role if it exists and is valid
      if (existingSig.role) {
        role = existingSig.role;
      }
      // Preserve notes if they exist and are valid, otherwise use default
      if (existingSig.notes && typeof existingSig.notes === 'string' && existingSig.notes.length > 0) {
        notes = existingSig.notes;
      }
    }

    // If we need to add notes but don't have a valid one, use a sensible default
    if (needsNotes && !notes) {
      notes = 'Signature regenerated by lint --fix';
    }

    // Determine if we need to regenerate signature or just fix structure
    // EARS-40: Only regenerate if there are other errors besides missing notes
    // If only notes is missing, just add it without regenerating the signature
    const needsRegeneration = hasInvalidSignature || hasAdditionalProperties || (needsNotes && (hasInvalidSignature || hasAdditionalProperties));

    let fixedSignature: Signature;
    if (needsRegeneration) {
      // Regenerate signature using private key (this creates a properly formatted signature)
      fixedSignature = signPayload(
        payload,
        options.privateKey,
        keyId,
        role,
        notes
      );
    } else {
      // EARS-40: Just fix the structure without regenerating (preserve existing signature if valid)
      // This handles the case where only notes is missing - we add notes without regenerating
      const existingSig = existingHeader?.signatures?.[0];
      fixedSignature = {
        keyId: existingSig?.keyId || keyId,
        role: existingSig?.role || role,
        notes: needsNotes ? (notes || 'Signature regenerated by lint --fix') : (existingSig?.notes || notes),
        signature: existingSig?.signature || '',
        timestamp: existingSig?.timestamp || Math.floor(Date.now() / 1000)
      };
    }

    // Create fixed record with proper structure
    // Preserve existing header fields if they exist, but replace signatures
    const entityType = this.getEntityType(result.entity.id);
    const fixedRecord: GitGovRecord = {
      header: {
        version: existingHeader?.version || '1.0',
        type: (existingHeader?.type || entityType) as GitGovRecordType,
        payloadChecksum,
        signatures: [fixedSignature] // Replace all signatures with one valid signature
      },
      payload
    };

    // Write fixed record
    await this.fileSystem.writeFile(
      result.filePath,
      JSON.stringify(fixedRecord, null, 2)
    );

    const action = needsRegeneration ? 'regenerated' : 'fixed structure';
    logger.info(`Fixed signature structure: ${result.filePath} (${action} signature for ${keyId})`);
  }

  /**
   * Restores a file from its most recent backup.
   * Implements EARS-32: Restore backup if fix fails.
   * @private
   */
  private async restoreBackup(filePath: string): Promise<void> {
    // First try to use the last backup path we created
    if (this.lastBackupPath) {
      try {
        const exists = await this.fileSystem.exists(this.lastBackupPath);
        if (exists) {
          const backupContent = await this.fileSystem.readFile(this.lastBackupPath, "utf-8");
          await this.fileSystem.writeFile(filePath, backupContent);
          logger.info(`Restored ${filePath} from backup ${this.lastBackupPath}`);
          this.lastBackupPath = null; // Clear after use
          return;
        }
      } catch (error) {
        // Fall through to timestamp search
      }
    }

    // Fallback: Find most recent backup file by trying recent timestamps
    const now = Date.now();
    const timeWindows = [0, 1000, 5000, 10000, 60000]; // 0s, 1s, 5s, 10s, 1min ago

    for (const delta of timeWindows) {
      const timestamp = now - delta;
      const backupPath = `${filePath}.backup-${timestamp}`;

      try {
        const exists = await this.fileSystem.exists(backupPath);
        if (exists) {
          // Restore from backup
          const backupContent = await this.fileSystem.readFile(backupPath, "utf-8");
          await this.fileSystem.writeFile(filePath, backupContent);
          logger.info(`Restored ${filePath} from backup ${backupPath}`);
          return;
        }
      } catch (error) {
        // Try next backup
        continue;
      }
    }

    throw new Error(`No backup found for ${filePath}`);
  }
}

