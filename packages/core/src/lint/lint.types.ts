import type { RecordStore } from "../store/record_store";
import type { IIndexerAdapter } from "../adapters/indexer_adapter";
import type { GitGovRecord, GitGovRecordPayload, CustomRecord } from "../types";

type StorablePayload = Exclude<GitGovRecordPayload, CustomRecord>;

/**
 * Public interface for LintModule operations.
 * 
 * Follows the same pattern as IBacklogAdapter, IFeedbackAdapter, etc.
 * Enables dependency injection and mocking for tests.
 * 
 * @example
 * ```typescript
 * const lintModule: ILintModule = new LintModule({
 *   recordStore: taskStore,
 *   indexerAdapter: indexerAdapter
 * });
 * 
 * const report = await lintModule.lint({ validateReferences: true });
 * ```
 */
export interface ILintModule {
  /**
   * Validates all records in the specified directory.
   * 
   * Uses delegation pattern: calls recordStore.read() which internally uses loaders
   * to validate schema + embedded metadata. Then adds additional validations
   * (conventions, references).
   * 
   * @param options - Configuration options
   * @returns {Promise<LintReport>} Consolidated report with all results
   */
  lint(options?: Partial<LintOptions>): Promise<LintReport>;

  /**
   * Validates a specific file and returns its results.
   * Ultra-fast validation for single records (target: <50ms).
   * 
   * @param filePath - Path to the file to validate
   * @param options - Configuration options
   * @returns {Promise<LintReport>} Lint report for this single file
   */
  lintFile(filePath: string, options?: Partial<LintOptions>): Promise<LintReport>;

  /**
   * Applies automatic repairs to problems marked as fixable.
   * 
   * @param lintReport - Lint report with detected problems
   * @param fixOptions - Options for the fix operation
   * @returns {Promise<FixReport>} Report of applied repairs
   */
  fix(lintReport: LintReport, fixOptions?: Partial<FixOptions>): Promise<FixReport>;
}

/**
 * Required and optional dependencies for the LintModule.
 * 
 * The module uses dependency injection for maximum flexibility and testability.
 * Some dependencies are optional and the module gracefully degrades if they are not present.
 * 
 * @example
 * ```typescript
 * const lintModule = new LintModule({
 *   recordStore: taskStore,
 *   indexerAdapter: new IndexerAdapter(), // optional
 * });
 * ```
 */
export interface LintModuleDependencies {
  /** 
   * Store for filesystem access to records (REQUIRED)
   * Note: This project does not have a centralized ValidatorModule.
   * Validation is performed by recordStore.read() using type-specific loaders.
   */
  recordStore: RecordStore<StorablePayload>;

  /** 
   * Indexing adapter for reference resolution (OPTIONAL)
   * If not present, reference validations will be limited.
   */
  indexerAdapter?: IIndexerAdapter;

  /**
   * File system for I/O operations (OPTIONAL)
   * Defaults to Node.js native fs.
   */
  fileSystem?: FileSystem;
}

/**
 * Interfaz simplificada del sistema de archivos para testing.
 */
export interface FileSystem {
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  unlink(path: string): Promise<void>;
}

/**
 * Opciones de configuración para la ejecución de lint.
 * 
 * Controla qué validaciones se ejecutan y cómo se comporta el motor de lint.
 * 
 * @example
 * ```typescript
 * const report = await lintModule.lint({
 *   path: '.gitgov/',
 *   validateReferences: true,
 *   validateActors: true,
 *   failFast: false,
 *   concurrent: true
 * });
 * ```
 */
export interface LintOptions {
  /** Directorio o archivo a validar (default: '.gitgov/') */
  path?: string;

  /** 
   * Validar referencias tipadas inteligentemente (default: false)
   * Requiere indexerModule presente.
   */
  validateReferences?: boolean;

  /** 
   * Validar resolución de actorIds (default: false)
   * Verifica que los actorIds existen en .gitgov/actors/
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
   * Validar convenciones de nombres y directorios (default: true)
   * Valida que archivos estén en directorios correctos.
   */
  validateConventions?: boolean;

  /** 
   * Modo fail-fast o acumular todos los errores (default: false)
   * Si true, detiene al primer error fatal.
   */
  failFast?: boolean;

  /** 
   * Modo concurrente para repositorios grandes (default: true)
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
 * 
 * Contiene resumen cuantitativo, resultados detallados y metadata de ejecución.
 * 
 * @example
 * ```typescript
 * const report = await lintModule.lint(options);
 * console.log(`Errores: ${report.summary.errors}`);
 * console.log(`Warnings: ${report.summary.warnings}`);
 * console.log(`Tiempo: ${report.summary.executionTime}ms`);
 * ```
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
 * 
 * Proporciona métricas agregadas para evaluación rápida del estado del repositorio.
 */
export interface LintSummary {
  /** Número total de archivos verificados en el directorio objetivo */
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
 * 
 * Representa un problema detectado en un record, con contexto completo para debugging.
 * 
 * @example
 * ```typescript
 * const result: LintResult = {
 *   level: 'error',
 *   filePath: '.gitgov/tasks/task-123.json',
 *   validator: 'SCHEMA_VALIDATION',
 *   message: 'Campo requerido "description" ausente',
 *   entity: { type: 'task', id: 'task-123' },
 *   fixable: false,
 *   context: { field: 'description', expected: 'string' }
 * };
 * ```
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
    /** 
     * Tipo de protocolo de la entidad.
     * Nota: Excluye "custom" que es solo para testing interno.
     */
    type: "actor" | "agent" | "task" | "cycle" | "execution" | "changelog" | "feedback";

    /** ID único de la entidad en el formato del protocolo */
    id: string;
  };

  /** Indica si el error es auto-reparable con fix() */
  fixable: boolean;

  /** 
   * Indica si el error fue reparado automáticamente (post-fix)
   * Solo presente después de ejecutar fix().
   */
  fixed?: boolean;

  /** 
   * Contexto adicional para debugging
   * Provee información específica del campo problemático.
   */
  context?: {
    /** Campo específico con problema (ej: 'description', 'payloadChecksum') */
    field?: string;
    /** Valor actual del campo */
    actual?: unknown;
    /** Valor esperado del campo */
    expected?: unknown;
  };

}

/**
 * Tipos de validadores disponibles en el pipeline.
 * 
 * Cada tipo representa una categoría específica de validación.
 * Los validadores se ejecutan en orden y pueden ser habilitados/deshabilitados vía opciones.
 * 
 * @example
 * ```typescript
 * const result: LintResult = {
 *   validator: 'SCHEMA_VALIDATION',
 *   // ...
 * };
 * ```
 */
export type ValidatorType =
  /** Validación de schema JSON usando AJV */
  | "SCHEMA_VALIDATION"
  /** Validación de integridad referencial (referencias existen) */
  | "REFERENTIAL_INTEGRITY"
  /** Validación de referencias tipadas por prefijo (task:, file:, etc) */
  | "TYPED_REFERENCE"
  /** Validación de consistencia bidireccional (Task↔Cycle) */
  | "BIDIRECTIONAL_CONSISTENCY"
  /** Validación de estructura header/payload de embedded metadata */
  | "EMBEDDED_METADATA_STRUCTURE"
  /** Verificación de checksum SHA256 */
  | "CHECKSUM_VERIFICATION"
  /** Validación de estructura de firmas Ed25519 */
  | "SIGNATURE_STRUCTURE"
  /** Validación de convenciones de nombres de archivos */
  | "FILE_NAMING_CONVENTION"
  /** Validación de consistencia temporal (createdAt ≤ updatedAt) */
  | "TEMPORAL_CONSISTENCY"
  /** Validación de resolución de actorIds */
  | "ACTOR_RESOLUTION"
  /** Detección de referencias a entidades con status 'discarded' */
  | "SOFT_DELETE_DETECTION"
  /** Detección de records con schema obsoleto (requiere migración) */
  | "SCHEMA_VERSION_MISMATCH";

/**
 * Contexto de ejecución para validación de un record individual.
 * 
 * Proporciona información necesaria para validadores individuales.
 */
export interface ValidationContext {
  /** Path del archivo siendo validado */
  filePath: string;

  /** Configuración de validadores habilitados */
  enabledValidators: ValidatorType[];

  /** 
   * Caché de records ya cargados (para referencias)
   * Evita cargar el mismo record múltiples veces.
   */
  recordCache?: Map<string, GitGovRecord>;

  /** Modo fail-fast habilitado */
  failFast: boolean;
}

/**
 * Options for auto-fix operation.
 * 
 * Controls which problems to repair and how the repair is executed.
 * Includes configuration for backups and change signing.
 * 
 * @example
 * ```typescript
 * const fixReport = await lintModule.fix(lintReport, {
 *   fixTypes: ['SCHEMA_VERSION_MISMATCH', 'EMBEDDED_METADATA_STRUCTURE'],
 *   createBackups: true,
 *   keyId: 'system:migrator',
 *   privateKey: systemPrivateKey,
 *   dryRun: false
 * });
 * ```
 */
export interface FixOptions {
  /** 
   * Types of problems to repair (default: all fixable)
   * If specified, only repairs the indicated types.
   */
  fixTypes?: ValidatorType[];

  /** 
   * Create backups before modifying files (default: true)
   * Creates .backup-{timestamp} file before each modification.
   */
  createBackups?: boolean;

  /** 
   * KeyId (actorId) for automatic change signing (default: 'system:migrator')
   * This value is used as the keyId parameter in signPayload().
   */
  keyId?: string;

  /**
   * Private key for signing fixed records (REQUIRED for legacy record fixes)
   * Used by signPayload() to create cryptographic signatures.
   */
  privateKey?: string;

  /** 
   * Dry-run mode that reports without applying changes (default: false)
   * Useful for previewing what will be repaired.
   */
  dryRun?: boolean;

}

/**
 * Reporte de operación de auto-fix.
 * 
 * Contiene resumen de reparaciones y detalles de cada fix aplicado.
 * 
 * @example
 * ```typescript
 * const fixReport = await lintModule.fix(lintReport, fixOptions);
 * console.log(`Reparados: ${fixReport.summary.fixed}`);
 * console.log(`Fallidos: ${fixReport.summary.failed}`);
 * console.log(`Backups: ${fixReport.summary.backupsCreated}`);
 * ```
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
 * 
 * Representa el resultado de intentar reparar un problema específico.
 */
export interface FixResult {
  /** Path del archivo reparado o intentado reparar */
  filePath: string;

  /** Tipo de problema reparado */
  validator: ValidatorType;

  /** Descripción de la reparación aplicada */
  action: string;

  /** Éxito de la reparación */
  success: boolean;

  /** 
   * Error si falló la reparación
   * Solo presente si success = false.
   */
  error?: string;

  /** 
   * Path del backup creado (si aplica)
   * Solo presente si createBackups = true y success = true.
   */
  backupPath?: string;
}

