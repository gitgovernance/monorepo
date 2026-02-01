/**
 * Pure LintModule - Structural Validation without I/O
 *
 * This module provides pure validation logic for GitGovernance records.
 * It does NOT perform filesystem operations (no fs/path imports).
 *
 * For filesystem operations (directory scanning, file reading, backups),
 * use FsLintModule from './fs'.
 *
 * @module lint
 */

import type {
  ILintModule,
  LintModuleDependencies,
  LintOptions,
  LintReport,
  LintResult,
  FixRecordOptions,
  ValidatorType,
  RecordEntry,
  LintRecordContext,
  RecordStores
} from "./lint.types";
import type { IIndexerAdapter } from "../adapters/indexer_adapter";
import type {
  GitGovRecord,
  GitGovRecordPayload,
  TaskRecord,
  CycleRecord,
  GitGovRecordType
} from "../types";
import {
  isTaskPayload,
  isCyclePayload,
  isExecutionPayload
} from "../types/type_guards";
import type { Signature } from "../types/embedded.types";
import { DetailedValidationError } from "../validation/common";
import { createLogger } from "../logger";
import { calculatePayloadChecksum } from "../crypto/checksum";
import { signPayload } from "../crypto/signatures";
import {
  loadTaskRecord,
  loadActorRecord,
  loadAgentRecord,
  loadCycleRecord,
  loadExecutionRecord,
  loadChangelogRecord,
  loadFeedbackRecord
} from "../factories";
import { Schemas } from "../record_schemas/generated";

const logger = createLogger("[Lint] ");

/**
 * [EARS-F2] Mapping from entity type to schema name for payload cleaning.
 * Uses Schemas from generated JSON schemas to extract valid properties.
 */
const ENTITY_TO_SCHEMA: Record<string, keyof typeof Schemas> = {
  task: 'TaskRecord',
  actor: 'ActorRecord',
  agent: 'AgentRecord',
  cycle: 'CycleRecord',
  execution: 'ExecutionRecord',
  changelog: 'ChangelogRecord',
  feedback: 'FeedbackRecord',
};


/**
 * Pure structural validation module for GitGovernance records.
 *
 * Implements Quality Model Layer 1 (Structural + Referential Integrity).
 * Does NOT perform filesystem operations - works with GitGovRecord objects in memory.
 *
 * @implements {ILintModule}
 */
export class LintModule implements ILintModule {
  private readonly stores: RecordStores;
  private readonly indexerAdapter: IIndexerAdapter | null;

  /**
   * Constructor for pure LintModule.
   *
   * @param dependencies - Optional module dependencies
   */
  constructor(dependencies?: LintModuleDependencies) {
    this.stores = dependencies?.stores ?? {};
    this.indexerAdapter = dependencies?.indexerAdapter ?? null;

    if (!this.indexerAdapter) {
      logger.warn("indexerAdapter not provided, reference validation will be limited");
    }
  }

  /**
   * Validates a single record object (pure validation).
   * Does NOT read files - receives pre-loaded record.
   *
   * @param record - The GitGovRecord object to validate
   * @param context - Context with recordId and entityType
   * @returns Array of lint results
   */
  lintRecord(record: GitGovRecord, context: LintRecordContext): LintResult[] {
    const results: LintResult[] = [];
    const { recordId, entityType, filePath = `unknown/${recordId}.json` } = context;

    try {
      // Validate with appropriate loader (schema validation)
      this.validateWithLoader(record, entityType);

      // [EARS-D1], [EARS-D2] Validate timestamps
      const timestampResults = this.validateTimestamps(record, recordId, filePath, entityType);
      results.push(...timestampResults);

    } catch (error) {
      if (error instanceof DetailedValidationError) {
        const hasAdditionalProperties = error.errors.some(e =>
          e.message.includes("must NOT have additional properties") ||
          e.message.includes("must not have additional properties")
        );

        const filteredErrors = hasAdditionalProperties
          ? error.errors.filter(e =>
            !e.message.includes("oneOf") &&
            !e.message.includes("must match") &&
            !e.message.includes("boolean schema is false")
          )
          : error.errors;

        for (const err of filteredErrors) {
          const tempError = new DetailedValidationError('Record', [err]);
          tempError.message = `${err.field}: ${err.message}`;
          const validatorType = this.detectValidatorType(tempError);
          const isFixable = this.isFixable(tempError);

          results.push({
            level: "error",
            filePath,
            validator: validatorType,
            message: `${err.field}: ${err.message}`,
            entity: { type: entityType, id: recordId },
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
        results.push({
          level: "error",
          filePath,
          validator: "SCHEMA_VALIDATION",
          message: error instanceof Error ? error.message : String(error),
          entity: { type: entityType, id: recordId },
          fixable: false
        });
      }
    }

    return results;
  }

  /**
   * Validates all records from stores.
   * Iterates this.stores to collect records, then validates each one.
   *
   * @param options - Configuration options
   * @returns Consolidated lint report
   */
  async lint(
    options?: Partial<LintOptions>
  ): Promise<LintReport> {
    const startTime = Date.now();
    const opts: LintOptions = {
      validateReferences: options?.validateReferences ?? false,
      validateActors: options?.validateActors ?? false,
      validateChecksums: options?.validateChecksums ?? true,
      validateSignatures: options?.validateSignatures ?? true,
      validateTimestamps: options?.validateTimestamps ?? true,
      failFast: options?.failFast ?? false,
      concurrent: options?.concurrent ?? true,
      concurrencyLimit: options?.concurrencyLimit ?? 10
    };

    const results: LintResult[] = [];

    // Collect all records from stores
    const storeMap: Array<[Exclude<GitGovRecordType, 'custom'>, RecordStores[keyof RecordStores]]> = [
      ['task', this.stores.tasks],
      ['cycle', this.stores.cycles],
      ['actor', this.stores.actors],
      ['agent', this.stores.agents],
      ['execution', this.stores.executions],
      ['feedback', this.stores.feedbacks],
      ['changelog', this.stores.changelogs],
    ];

    const recordEntries: RecordEntry[] = [];
    for (const [type, store] of storeMap) {
      if (!store) continue;
      const ids = await store.list();
      for (const id of ids) {
        const record = await store.get(id);
        if (record) {
          recordEntries.push({ record, id, type });
        }
      }
    }

    for (const entry of recordEntries) {
      const context: LintRecordContext = {
        recordId: entry.id,
        entityType: entry.type,
        ...(entry.filePath !== undefined && { filePath: entry.filePath })
      };

      const recordResults = this.lintRecord(entry.record, context);
      results.push(...recordResults);

      // Reference validation (async - uses stores)
      if (opts.validateReferences) {
        const refResults = await this.validateReferences(
          entry.record, entry.id, entry.filePath || `unknown/${entry.id}.json`, entry.type
        );
        results.push(...refResults);
      }

      // Actor validation (async - uses stores)
      if (opts.validateActors) {
        const actorResults = await this.validateActors(
          entry.record, entry.id, entry.filePath || `unknown/${entry.id}.json`, entry.type
        );
        results.push(...actorResults);
      }

      if (opts.failFast && recordResults.some(r => r.level === "error")) {
        break;
      }
    }

    const executionTime = Date.now() - startTime;
    const errors = results.filter(r => r.level === "error").length;
    const warnings = results.filter(r => r.level === "warning").length;
    const fixable = results.filter(r => r.fixable).length;

    return {
      summary: {
        filesChecked: recordEntries.length,
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
  }

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
  ): GitGovRecord {
    const fixableResults = results.filter(r => r.fixable);

    if (fixableResults.length === 0) {
      return record;
    }

    // Clone the record to avoid mutation
    let fixedRecord: GitGovRecord = JSON.parse(JSON.stringify(record));

    for (const result of fixableResults) {
      // Skip if fix type not in allowed list
      if (options.fixTypes && !options.fixTypes.includes(result.validator)) {
        continue;
      }

      switch (result.validator) {
        case "EMBEDDED_METADATA_STRUCTURE":
          fixedRecord = this.fixEmbeddedMetadata(fixedRecord, result, options);
          break;

        case "CHECKSUM_VERIFICATION":
          fixedRecord = this.fixChecksum(fixedRecord);
          break;

        case "SIGNATURE_STRUCTURE":
          fixedRecord = this.fixSignature(fixedRecord, result, options);
          break;

        // BIDIRECTIONAL_CONSISTENCY requires modifying OTHER records
        // This must be handled by FsLintModule which can write multiple files
        case "BIDIRECTIONAL_CONSISTENCY":
          logger.warn("BIDIRECTIONAL_CONSISTENCY fix requires FsLintModule");
          break;

        default:
          logger.warn(`Fix not implemented for validator: ${result.validator}`);
      }
    }

    return fixedRecord;
  }

  // ==================== Private Validation Methods ====================

  /**
   * Validates record with appropriate loader based on entity type.
   * @private
   */
  private validateWithLoader(record: GitGovRecord, entityType: Exclude<GitGovRecordType, 'custom'>): void {
    // Re-validate the record through its loader to ensure schema compliance
    const rawRecord = JSON.parse(JSON.stringify(record));

    switch (entityType) {
      case 'task':
        loadTaskRecord(rawRecord);
        break;
      case 'actor':
        loadActorRecord(rawRecord);
        break;
      case 'agent':
        loadAgentRecord(rawRecord);
        break;
      case 'cycle':
        loadCycleRecord(rawRecord);
        break;
      case 'execution':
        loadExecutionRecord(rawRecord);
        break;
      case 'changelog':
        loadChangelogRecord(rawRecord);
        break;
      case 'feedback':
        loadFeedbackRecord(rawRecord);
        break;
    }
  }

  /**
   * [EARS-D1], [EARS-D2] Validates timestamp ordering.
   * Pure validation - no I/O.
   * @private
   */
  private validateTimestamps(
    record: GitGovRecord,
    recordId: string,
    filePath: string,
    entityType: Exclude<GitGovRecordType, 'custom'>
  ): LintResult[] {
    const results: LintResult[] = [];

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
          entity: { type: entityType, id: recordId },
          fixable: false,
          context: {
            field: "timestamps",
            actual: { createdAt: payload.createdAt, updatedAt: payload.updatedAt },
            expected: "createdAt <= updatedAt"
          }
        });
      }

      if (payload.completedAt) {
        const completed = new Date(payload.completedAt).getTime();
        if (completed < created) {
          results.push({
            level: "error",
            filePath,
            validator: "TEMPORAL_CONSISTENCY",
            message: `completedAt (${String(payload.completedAt)}) is before createdAt (${String(payload.createdAt)})`,
            entity: { type: entityType, id: recordId },
            fixable: false
          });
        }
      }

      if (payload.discardedAt) {
        const discarded = new Date(payload.discardedAt).getTime();
        if (discarded < created) {
          results.push({
            level: "error",
            filePath,
            validator: "TEMPORAL_CONSISTENCY",
            message: `discardedAt (${String(payload.discardedAt)}) is before createdAt (${String(payload.createdAt)})`,
            entity: { type: entityType, id: recordId },
            fixable: false
          });
        }
      }
    }

    return results;
  }

  /**
   * [EARS-E1] through [EARS-E6] Validates references.
   * Uses Store<T> for lookups.
   * @private
   */
  private async validateReferences(
    record: GitGovRecord,
    recordId: string,
    filePath: string,
    entityType: Exclude<GitGovRecordType, 'custom'>
  ): Promise<LintResult[]> {
    const results: LintResult[] = [];
    const payload = record.payload;

    // Get appropriate store for lookups
    const taskStore = this.stores.tasks;
    const cycleStore = this.stores.cycles;

    // [EARS-E1] Validate ExecutionRecord.taskId exists
    if (entityType === "execution" && isExecutionPayload(payload) && payload.taskId && taskStore) {
      try {
        const taskRecord = await taskStore.get(payload.taskId);
        if (!taskRecord) {
          results.push({
            level: "warning",
            filePath,
            validator: "REFERENTIAL_INTEGRITY",
            message: `Referenced taskId '${payload.taskId}' not found`,
            entity: { type: entityType, id: recordId },
            fixable: false,
            context: { field: "taskId", actual: payload.taskId, expected: "existing task record" }
          });
        } else {
          // [EARS-E6] Check for soft delete
          const taskPayload = taskRecord.payload as TaskRecord;
          if (taskPayload.status === "discarded") {
            results.push({
              level: "warning",
              filePath,
              validator: "SOFT_DELETE_DETECTION",
              message: `Referenced task '${payload.taskId}' has status 'discarded'`,
              entity: { type: entityType, id: recordId },
              fixable: false
            });
          }
        }
      } catch {
        // Store lookup failed, skip
      }
    }

    // [EARS-E5] Validate bidirectional consistency (Task ↔ Cycle)
    if (entityType === "task" && isTaskPayload(payload) && payload.cycleIds && cycleStore) {
      for (const cycleId of payload.cycleIds) {
        try {
          const cycleRecord = await cycleStore.get(cycleId);
          if (cycleRecord) {
            const cyclePayload = cycleRecord.payload as CycleRecord;
            if (cyclePayload.taskIds && !cyclePayload.taskIds.includes(recordId)) {
              results.push({
                level: "warning",
                filePath,
                validator: "BIDIRECTIONAL_CONSISTENCY",
                message: `Task references cycle '${cycleId}' but cycle doesn't include this task`,
                entity: { type: entityType, id: recordId },
                fixable: true,
                context: { field: "cycleIds", actual: cycleId, expected: `cycle should include task ${recordId}` }
              });
            }
          }
        } catch {
          // Store lookup failed, skip
        }
      }
    }

    if (entityType === "cycle" && isCyclePayload(payload) && payload.taskIds && taskStore) {
      for (const taskId of payload.taskIds) {
        try {
          const taskRecord = await taskStore.get(taskId);
          if (taskRecord) {
            const taskPayload = taskRecord.payload as TaskRecord;
            if (!taskPayload.cycleIds || !taskPayload.cycleIds.includes(recordId)) {
              results.push({
                level: "warning",
                filePath,
                validator: "BIDIRECTIONAL_CONSISTENCY",
                message: `Cycle includes task '${taskId}' but task doesn't include this cycle`,
                entity: { type: entityType, id: recordId },
                fixable: true,
                context: { field: "taskIds", actual: taskPayload.cycleIds || [], expected: `task should include cycle ${recordId}` }
              });
            }
          }
        } catch {
          // Store lookup failed, skip
        }
      }
    }

    return results;
  }

  /**
   * [EARS-E3] Validates actor resolution.
   * Uses Store<T> for lookups.
   * @private
   */
  private async validateActors(
    record: GitGovRecord,
    recordId: string,
    filePath: string,
    entityType: Exclude<GitGovRecordType, 'custom'>
  ): Promise<LintResult[]> {
    const results: LintResult[] = [];
    const actorStore = this.stores.actors;

    if (!actorStore) {
      return results;
    }

    // Check signatures for actor references
    if (record.header?.signatures) {
      for (const signature of record.header.signatures) {
        if (signature.keyId) {
          try {
            const actorRecord = await actorStore.get(signature.keyId);
            if (!actorRecord) {
              results.push({
                level: "warning",
                filePath,
                validator: "ACTOR_RESOLUTION",
                message: `Actor '${signature.keyId}' referenced in signature not found`,
                entity: { type: entityType, id: recordId },
                fixable: false,
                context: { field: "signatures.keyId", actual: signature.keyId, expected: "existing actor record" }
              });
            }
          } catch {
            // Store lookup failed, skip
          }
        }
      }
    }

    return results;
  }

  // ==================== Private Fix Methods ====================

  /**
   * [EARS-F2] Fixes embedded metadata structure issues.
   *
   * Steps:
   * 1. Validates EmbeddedMetadataRecord structure (header + payload)
   * 2. Removes additional properties from payload automatically
   * 3. Recalculates payloadChecksum using SHA256 on canonical JSON
   * 4. Regenerates signature with role: "author" and keyId from options
   * 5. Returns the fixed record (does not write to disk)
   *
   * @private
   */
  private fixEmbeddedMetadata(
    record: GitGovRecord,
    result: LintResult,
    options: FixRecordOptions
  ): GitGovRecord {
    if (!options.privateKey) {
      throw new Error("privateKey is required to fix embedded metadata");
    }

    // [EARS-F2] Step 1: Validate EmbeddedMetadataRecord structure
    if (!record.header || !record.payload) {
      throw new Error("Record does not have EmbeddedMetadataRecord structure (missing header or payload)");
    }

    // [EARS-F2] Step 2: Clean payload - remove additional properties automatically
    const cleanedPayload = this.cleanPayload(record.payload, result.entity.type);

    // [EARS-F2] Step 3: Recalculate checksum with cleaned payload
    const payloadChecksum = calculatePayloadChecksum(cleanedPayload);

    // [EARS-F2] Step 4: Regenerate signature
    const signature = signPayload(
      cleanedPayload,
      options.privateKey,
      options.keyId || result.entity.id,
      'author',
      'Signature regenerated by lint fix'
    );

    // [EARS-F2] Step 5: Return the fixed record
    return {
      header: {
        ...record.header,
        payloadChecksum,
        signatures: [signature]
      },
      payload: cleanedPayload
    };
  }

  /**
   * [EARS-F2] Gets valid payload keys from JSON schema for a given entity type.
   * Derives keys directly from generated schemas to stay in sync.
   * @private
   */
  private getValidPayloadKeys(entityType: string): string[] {
    const schemaName = ENTITY_TO_SCHEMA[entityType];
    if (!schemaName) {
      logger.warn(`Unknown entity type '${entityType}' for schema lookup`);
      return [];
    }

    const schema = Schemas[schemaName] as { properties?: Record<string, unknown> };
    if (!schema.properties) {
      logger.warn(`Schema '${schemaName}' has no properties defined`);
      return [];
    }

    return Object.keys(schema.properties);
  }

  /**
   * [EARS-F2] Cleans payload by removing properties not defined in the schema.
   * Uses JSON schemas as source of truth for valid properties.
   * @private
   */
  private cleanPayload(payload: GitGovRecordPayload, entityType: string): GitGovRecordPayload {
    const validKeys = this.getValidPayloadKeys(entityType);

    if (validKeys.length === 0) {
      // Unknown type or no schema - return as-is to avoid data loss
      logger.warn(`No valid keys found for entity type '${entityType}', returning payload as-is`);
      return payload;
    }

    const cleaned: Record<string, unknown> = {};
    const payloadRecord = payload as Record<string, unknown>;

    for (const key of validKeys) {
      if (key in payloadRecord) {
        cleaned[key] = payloadRecord[key];
      }
    }

    return cleaned as GitGovRecordPayload;
  }

  /**
   * Fixes checksum issues.
   * @private
   */
  private fixChecksum(record: GitGovRecord): GitGovRecord {
    const payloadChecksum = calculatePayloadChecksum(record.payload);

    return {
      header: {
        ...record.header,
        payloadChecksum
      },
      payload: record.payload
    };
  }

  /**
   * Fixes signature structure issues.
   * @private
   */
  /**
   * [EARS-F9] Fixes signature structure issues.
   *
   * Preserves valid keyId and role from existing signature if present,
   * only using options.keyId as fallback when no existing signature exists.
   *
   * @private
   */
  private fixSignature(
    record: GitGovRecord,
    result: LintResult,
    options: FixRecordOptions
  ): GitGovRecord {
    if (!options.privateKey) {
      throw new Error("privateKey is required to fix signature");
    }

    const payloadChecksum = calculatePayloadChecksum(record.payload);

    // [EARS-F9] Preserve existing signature metadata if valid
    // Priority: existing signature > options > fallback
    const existingSig = record.header?.signatures?.[0];
    const keyId = existingSig?.keyId || options.keyId || result.entity.id;
    const role = existingSig?.role || 'author';
    const notes = existingSig?.notes || 'Signature regenerated by lint fix';

    const signature: Signature = signPayload(
      record.payload,
      options.privateKey,
      keyId,
      role,
      notes
    );

    return {
      header: {
        ...record.header,
        payloadChecksum,
        signatures: [signature]
      },
      payload: record.payload
    };
  }

  // ==================== Private Helper Methods ====================

  /**
   * Detects the validator type based on the error.
   * @private
   */
  private detectValidatorType(error: DetailedValidationError): ValidatorType {
    const errorMessage = error.message.toLowerCase();
    const fieldPath = error.errors?.[0]?.field?.toLowerCase() || '';
    const allErrorMessages = error.errors?.map(e => e.message?.toLowerCase() || '').join(' ') || '';
    const combinedText = `${errorMessage} ${fieldPath} ${allErrorMessages}`;

    if (combinedText.includes("checksum") || fieldPath.includes("payloadchecksum")) {
      return "CHECKSUM_VERIFICATION";
    }
    if (combinedText.includes("signature") || fieldPath.includes("/signatures/")) {
      return "SIGNATURE_STRUCTURE";
    }
    if (combinedText.includes("header") || combinedText.includes("payload") || fieldPath.includes("/header/")) {
      return "EMBEDDED_METADATA_STRUCTURE";
    }

    const versionMismatchIndicators = [
      'required in v', 'deprecated', 'obsolete', 'schema version', 'migration'
    ];
    if (versionMismatchIndicators.some(i => combinedText.includes(i)) || /v\d+|version\s+\d+/i.test(combinedText)) {
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

    if (errorMessage.includes("header") || errorMessage.includes("metadata")) {
      return true;
    }
    if (errorMessage.includes("must not have additional properties") || errorMessage.includes("must NOT have additional properties")) {
      return true;
    }
    if (errorMessage.includes("checksum")) {
      return true;
    }
    if (errorMessage.includes("signature") && errorMessage.includes("format")) {
      return true;
    }

    return false;
  }
}
