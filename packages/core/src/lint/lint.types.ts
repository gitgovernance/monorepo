import type { Store } from "../store/store";
import type { IIndexerAdapter } from "../adapters/indexer_adapter";
import type { GitGovRecord, GitGovRecordType } from "../types";

// ==================== Pure LintModule Interface ====================

/**
 * Public interface for pure LintModule operations (no I/O).
 *
 * This interface defines the core validation logic that works with
 * GitGovRecord objects in memory, without any filesystem operations.
 *
 * For filesystem operations (directory scanning, file reading, backups),
 * use IFsLintModule.
 *
 * @example
 * ```typescript
 * const lintModule: ILintModule = new LintModule({ stores });
 *
 * // Validate a single record (pure)
 * const results = lintModule.lintRecord(record, { recordId, entityType });
 *
 * // Validate multiple records
 * const report = await lintModule.lint(records, options);
 *
 * // Fix a record (returns fixed record, no I/O)
 * const fixedRecord = lintModule.fixRecord(record, results, { keyId, privateKey });
 * ```
 */
export interface ILintModule {
  /**
   * Validates a single record object (pure validation).
   * Does NOT read files - receives pre-loaded record.
   *
   * @param record - The GitGovRecord object to validate
   * @param context - Context with recordId and entityType
   * @returns Array of lint results
   */
  lintRecord(
    record: GitGovRecord,
    context: LintRecordContext
  ): LintResult[];

  /**
   * Validates multiple records.
   * Uses stores for reference lookups (via Store<T> interface).
   *
   * @param records - Iterable of record entries to validate
   * @param options - Configuration options
   * @returns Consolidated lint report
   */
  lint(
    records: Iterable<RecordEntry>,
    options?: Partial<LintOptions>
  ): Promise<LintReport>;

  /**
   * Applies fixes to a record and returns the fixed version.
   * Does NOT write to disk - returns modified object.
   *
   * @param record - The record to fix
   * @param results - Lint results identifying problems
   * @param options - Fix options including privateKey for signing
   * @returns The fixed record
   */
  fixRecord(
    record: GitGovRecord,
    results: LintResult[],
    options: FixRecordOptions
  ): GitGovRecord;
}

/**
 * Entry for batch validation.
 * Used by LintModule.lint() to process multiple records.
 */
export interface RecordEntry {
  /** The GitGovRecord object */
  record: GitGovRecord;
  /** Record ID */
  id: string;
  /** Entity type */
  type: Exclude<GitGovRecordType, 'custom'>;
  /** Optional file path for error reporting (FsLintModule provides this) */
  filePath?: string;
}

/**
 * Context for single record validation.
 */
export interface LintRecordContext {
  /** Record ID */
  recordId: string;
  /** Entity type */
  entityType: Exclude<GitGovRecordType, 'custom'>;
  /** Optional file path for error reporting */
  filePath?: string;
}

/**
 * Stores for reference lookups (pure interface).
 * Uses generic Store<T> interface, not filesystem-specific RecordStore.
 */
export interface RecordStores {
  actors?: Store<GitGovRecord>;
  agents?: Store<GitGovRecord>;
  tasks?: Store<GitGovRecord>;
  cycles?: Store<GitGovRecord>;
  executions?: Store<GitGovRecord>;
  feedbacks?: Store<GitGovRecord>;
  changelogs?: Store<GitGovRecord>;
}

/**
 * Dependencies for pure LintModule.
 * All dependencies are optional for maximum flexibility.
 */
export interface LintModuleDependencies {
  /** Stores for reference lookups (OPTIONAL) */
  stores?: RecordStores;

  /**
   * Indexing adapter for advanced reference resolution (OPTIONAL)
   * If not present, reference validations will be limited.
   */
  indexerAdapter?: IIndexerAdapter;
}

/**
 * Options for pure record fix operation.
 * Does NOT include filesystem-specific options like createBackups.
 */
export interface FixRecordOptions {
  /** Types of problems to repair (default: all fixable) */
  fixTypes?: ValidatorType[];
  /** KeyId (actorId) for signing (default: 'system:migrator') */
  keyId?: string;
  /** Private key for signing (REQUIRED for signature fixes) */
  privateKey?: string;
}

// ==================== FsLintModule Interface ====================

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
export interface IFsLintModule {
  /**
   * Scans directories and validates all records.
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
  /** Core LintModule for pure validation (REQUIRED) */
  lintModule: ILintModule;

  /** Record stores for reference lookups (OPTIONAL) */
  stores?: RecordStores;

  /** Indexer adapter for reference resolution (OPTIONAL) */
  indexerAdapter?: IIndexerAdapter;

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

// ==================== Shared Types ====================

/**
 * Options for pure LintModule operations.
 * Does NOT include filesystem-specific options like path.
 */
export interface LintOptions {
  /**
   * Validar referencias tipadas inteligentemente (default: false)
   * Requiere stores presente para lookups.
   */
  validateReferences?: boolean;

  /**
   * Validar resolución de actorIds (default: false)
   * Verifica que los actorIds existen via stores.
   */
  validateActors?: boolean;

  /**
   * Validar checksums de embedded metadata (default: true)
   * Usa SHA256 sobre JSON canónico.
   */
  validateChecksums?: boolean;

  /**
   * Validar estructura de firmas (default: true)
   * Verifica formato Ed25519 y campos requeridos.
   */
  validateSignatures?: boolean;

  /**
   * Validar consistencia temporal de timestamps (default: true)
   * Valida que createdAt <= updatedAt <= completedAt.
   */
  validateTimestamps?: boolean;

  /**
   * Modo fail-fast o acumular todos los errores (default: false)
   * Si true, detiene al primer error fatal.
   */
  failFast?: boolean;

  /**
   * Modo concurrente para batch processing (default: true)
   * Procesa múltiples records en paralelo.
   */
  concurrent?: boolean;

  /**
   * Límite de concurrencia (default: 10)
   * Número máximo de records procesados simultáneamente.
   */
  concurrencyLimit?: number;
}

/**
 * Reporte consolidado de la ejecución de lint.
 */
export interface LintReport {
  /** Resumen cuantitativo de los resultados */
  summary: LintSummary;

  /** Lista detallada de cada problema encontrado */
  results: LintResult[];

  /** Metadata de la ejecución */
  metadata: {
    /** Timestamp ISO 8601 de ejecución */
    timestamp: string;
    /** Opciones utilizadas en esta ejecución */
    options: LintOptions;
    /** Versión del módulo lint */
    version: string;
  };
}

/**
 * Resumen cuantitativo de resultados de lint.
 */
export interface LintSummary {
  /** Número total de archivos/records verificados */
  filesChecked: number;

  /** Número total de errores fatales que requieren corrección */
  errors: number;

  /** Número total de advertencias que sugieren mejoras */
  warnings: number;

  /** Número de problemas auto-reparables con fix() */
  fixable: number;

  /** Tiempo de ejecución en milisegundos */
  executionTime: number;
}

/**
 * Resultado individual de validación para una entidad específica.
 */
export interface LintResult {
  /** Nivel de severidad del problema detectado */
  level: "error" | "warning" | "info";

  /** Ruta relativa del archivo donde se detectó el problema */
  filePath: string;

  /** Tipo de validador que generó este resultado */
  validator: ValidatorType;

  /** Mensaje descriptivo del problema encontrado */
  message: string;

  /** Información de la entidad GitGovernance afectada */
  entity: {
    type: "actor" | "agent" | "task" | "cycle" | "execution" | "changelog" | "feedback";
    id: string;
  };

  /** Indica si el error es auto-reparable con fixRecord() */
  fixable: boolean;

  /** Indica si el error fue reparado automáticamente (post-fix) */
  fixed?: boolean;

  /** Contexto adicional para debugging */
  context?: {
    field?: string;
    actual?: unknown;
    expected?: unknown;
  };
}

/**
 * Tipos de validadores disponibles en el pipeline.
 */
export type ValidatorType =
  | "SCHEMA_VALIDATION"
  | "REFERENTIAL_INTEGRITY"
  | "TYPED_REFERENCE"
  | "BIDIRECTIONAL_CONSISTENCY"
  | "EMBEDDED_METADATA_STRUCTURE"
  | "CHECKSUM_VERIFICATION"
  | "SIGNATURE_STRUCTURE"
  | "FILE_NAMING_CONVENTION"
  | "TEMPORAL_CONSISTENCY"
  | "ACTOR_RESOLUTION"
  | "SOFT_DELETE_DETECTION"
  | "SCHEMA_VERSION_MISMATCH";

/**
 * Contexto de ejecución para validación de un record individual.
 */
export interface ValidationContext {
  /** Path del archivo siendo validado */
  filePath: string;

  /** Configuración de validadores habilitados */
  enabledValidators: ValidatorType[];

  /** Caché de records ya cargados (para referencias) */
  recordCache?: Map<string, GitGovRecord>;

  /** Modo fail-fast habilitado */
  failFast: boolean;
}

/**
 * Reporte de operación de auto-fix.
 */
export interface FixReport {
  /** Resumen de reparaciones aplicadas */
  summary: {
    /** Número de problemas reparados exitosamente */
    fixed: number;
    /** Número de problemas que fallaron al reparar */
    failed: number;
    /** Número de backups creados */
    backupsCreated: number;
  };

  /** Detalles de cada reparación */
  fixes: FixResult[];
}

/**
 * Resultado individual de reparación.
 */
export interface FixResult {
  /** Path del archivo reparado */
  filePath: string;

  /** Tipo de problema reparado */
  validator: ValidatorType;

  /** Descripción de la reparación aplicada */
  action: string;

  /** Éxito de la reparación */
  success: boolean;

  /** Error si falló la reparación */
  error?: string;

  /** Path del backup creado (si aplica) */
  backupPath?: string;
}
