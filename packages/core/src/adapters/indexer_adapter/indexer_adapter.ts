import type { RecordStore, RecordStores } from '../../record_store';
import { MetricsAdapter } from '../metrics_adapter';
import { extractAuthor, extractLastModifier } from '../../utils/signature_utils';
import { calculatePayloadChecksum, verifySignatures } from '../../crypto';
import type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovChangelogRecord,
  GitGovActorRecord
} from '../../record_types';
import type { ActivityEvent } from '../../event_bus';
import type {
  AllRecords,
  DerivedStates,
  DerivedStateSets,
  EnrichedTaskRecord,
  IndexData,
  IndexerAdapterDependencies,
  IntegrityError,
  IntegrityWarning,
  IntegrityReport,
  IndexGenerationReport,
  IIndexerAdapter,
} from './indexer_adapter.types';

/**
 * IndexerAdapter - Backend-agnostic cache implementation.
 *
 * Uses RecordStore<IndexData> abstraction for cache operations.
 * Caller chooses implementation: FsRecordStore, MemoryRecordStore, etc.
 *
 * @see indexer_adapter.md Section 2 - Architecture
 */
export class IndexerAdapter implements IIndexerAdapter {
  private metricsAdapter: MetricsAdapter;
  private stores: Required<Pick<RecordStores, 'tasks' | 'cycles' | 'feedbacks' | 'executions' | 'changelogs' | 'actors'>>;
  private cacheStore: RecordStore<IndexData>;

  constructor(dependencies: IndexerAdapterDependencies) {
    this.metricsAdapter = dependencies.metricsAdapter;
    this.stores = dependencies.stores;
    this.cacheStore = dependencies.cacheStore;
  }

  /**
   * [EARS-1] Generates complete index from raw Records with MetricsAdapter integration
   */
  async generateIndex(): Promise<IndexGenerationReport> {
    const startTime = performance.now();
    const performance_metrics = {
      readTime: 0,
      calculationTime: 0,
      writeTime: 0
    };

    try {
      // 1. Read all stores (Phase 1: Read everything into memory)
      const readStart = performance.now();

      const [tasks, cycles, actors] = await Promise.all([
        this.readAllTasks(),
        this.readAllCycles(),
        this.readAllActors()
      ]);

      performance_metrics.readTime = performance.now() - readStart;

      // 2. Delegate calculations to MetricsAdapter
      const calcStart = performance.now();

      const [systemStatus, productivityMetrics, collaborationMetrics] = await Promise.all([
        this.metricsAdapter.getSystemStatus(),
        this.metricsAdapter.getProductivityMetrics(),
        this.metricsAdapter.getCollaborationMetrics()
      ]);

      performance_metrics.calculationTime = performance.now() - calcStart;

      // 3. Calculate activity history
      const allRecords: AllRecords = {
        tasks,
        cycles,
        feedback: await this.readAllFeedback(),
        executions: await this.readAllExecutions(),
        changelogs: await this.readAllChangelogs(),
        actors
      };

      const activityHistory = await this.calculateActivityHistory(allRecords);

      // 3.5. Calculate system-wide derived states (EARS 7-10)
      const derivedStates = await this.calculateDerivedStates(allRecords);

      // 3.6. Convert DerivedStates arrays to DerivedStateSets for O(1) lookup performance
      const derivedStateSets: DerivedStateSets = {
        stalledTasks: new Set(derivedStates.stalledTasks),
        atRiskTasks: new Set(derivedStates.atRiskTasks),
        needsClarificationTasks: new Set(derivedStates.needsClarificationTasks),
        blockedByDependencyTasks: new Set(derivedStates.blockedByDependencyTasks)
      };

      // 3.7. Enrich tasks with complete intelligence layer (EARS-43: pass pre-calculated derivedStates)
      const enrichedTasks = await Promise.all(
        tasks.map(task => this.enrichTaskRecord(task, allRecords, derivedStateSets))
      );

      // 3.8. Validate integrity to populate integrityStatus (EARS-4 integration)
      const integrityReport = await this.validateIntegrity();

      // 4. Build IndexData structure
      const indexData: IndexData = {
        metadata: {
          generatedAt: new Date().toISOString(),
          lastCommitHash: await this.getGitCommitHash(),
          integrityStatus: integrityReport.status, // Populated from validateIntegrity() (EARS-4)
          recordCounts: {
            tasks: tasks.length,
            cycles: cycles.length,
            actors: actors.length,
            feedback: allRecords.feedback.length,
            executions: allRecords.executions.length,
            changelogs: allRecords.changelogs.length
          },
          generationTime: 0 // Will be set below
        },
        metrics: { ...systemStatus, ...productivityMetrics, ...collaborationMetrics },
        derivedStates, // System-wide derived states for analytics
        activityHistory, // Activity stream for dashboard
        tasks, // Keep full records with headers (source of truth)
        enrichedTasks, // Tasks with intelligence layer
        cycles, // Keep full records with headers
        actors, // Keep full records with headers
        feedback: allRecords.feedback // Optional - Phase 1B+ raw feedback records
      };

      // 4. Write cache using Store abstraction
      const writeStart = performance.now();
      await this.writeCacheFile(indexData);
      performance_metrics.writeTime = performance.now() - writeStart;

      const totalTime = performance.now() - startTime;
      indexData.metadata.generationTime = totalTime;

      return {
        success: true,
        recordsProcessed: tasks.length + cycles.length + actors.length,
        metricsCalculated: 3, // systemStatus + productivity + collaboration
        derivedStatesApplied: Object.values(derivedStates).reduce((sum, arr) => sum + arr.length, 0), // Total tasks with derived states
        generationTime: totalTime,
        errors: [],
        performance: performance_metrics
      };

    } catch (error) {
      return {
        success: false,
        recordsProcessed: 0,
        metricsCalculated: 0,
        derivedStatesApplied: 0,
        generationTime: performance.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)],
        performance: performance_metrics
      };
    }
  }

  /**
   * [EARS-2] Gets data from local cache for fast CLI queries
   * [EARS-13] Returns null and logs warning if cache is corrupted
   */
  async getIndexData(): Promise<IndexData | null> {
    try {
      // Use Store abstraction for backend-agnostic cache access
      const indexData = await this.cacheStore.get('index');
      if (!indexData) {
        return null; // EARS-3: Return null without cache
      }

      // Validate freshness using metadata.generatedAt (backend-agnostic)
      const isUpToDate = await this.isIndexUpToDate();
      if (!isUpToDate) {
        return null; // Cache is stale
      }

      return indexData;
    } catch (error) {
      // [EARS-13] Cache is corrupted or invalid - log warning and suggest regeneration
      console.warn(`Warning: Cache is corrupted or invalid. Please regenerate with 'gitgov index'.`);
      console.warn(`Details: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * [EARS-4, EARS-70 to EARS-76] Validates integrity of Records without regenerating cache
   * 
   * PHASE 1A (IMPLEMENTED): Basic schema validation (required fields)
   * PHASE 1B (IMPLEMENTED): Cryptographic validation (checksums + signatures)
   * TODO FUTURE:
   * - Integrate ValidatorModule for comprehensive schema validation
   * - Compare cache consistency with Records
   * - Detect broken references between records
   * - Validate timestamp consistency
   */
  async validateIntegrity(): Promise<IntegrityReport> {
    const startTime = performance.now();
    const errors: IntegrityError[] = [];
    const warnings: IntegrityWarning[] = [];
    let recordsScanned = 0;
    let checksumFailures = 0;
    let signatureFailures = 0;

    try {
      // Read all records for validation
      const [tasks, cycles] = await Promise.all([
        this.readAllTasks(),
        this.readAllCycles()
      ]);

      recordsScanned = tasks.length + cycles.length;

      // PHASE 1A: Schema validation - verify required fields
      for (const task of tasks) {
        if (!task.payload.id || !task.payload.description) {
          errors.push({
            type: 'schema_violation',
            recordId: task.payload.id || 'unknown',
            message: 'Task missing required fields'
          });
        }
      }

      for (const cycle of cycles) {
        if (!cycle.payload.id || !cycle.payload.title) {
          errors.push({
            type: 'schema_violation',
            recordId: cycle.payload.id || 'unknown',
            message: 'Cycle missing required fields'
          });
        }
      }

      // PHASE 1B: Checksum verification (EARS-70 to EARS-72)
      for (const task of tasks) {
        const calculatedChecksum = calculatePayloadChecksum(task.payload);
        if (calculatedChecksum !== task.header.payloadChecksum) {
          checksumFailures++;
          errors.push({
            type: 'checksum_failure',
            recordId: task.payload.id,
            message: `Checksum mismatch: expected ${task.header.payloadChecksum}, got ${calculatedChecksum}`
          });
        }
      }

      for (const cycle of cycles) {
        const calculatedChecksum = calculatePayloadChecksum(cycle.payload);
        if (calculatedChecksum !== cycle.header.payloadChecksum) {
          checksumFailures++;
          errors.push({
            type: 'checksum_failure',
            recordId: cycle.payload.id,
            message: `Checksum mismatch: expected ${cycle.header.payloadChecksum}, got ${calculatedChecksum}`
          });
        }
      }

      // PHASE 1B: Signature verification (EARS-73 to EARS-76)
      // Create actor public key lookup function for signature verification
      const getActorPublicKey = async (keyId: string): Promise<string | null> => {
        const actor = await this.stores.actors.get(keyId);
        return actor?.payload.publicKey || null;
      };

      // Verify signatures for all tasks
      for (const task of tasks) {
        const isValid = await verifySignatures(task, getActorPublicKey);
        if (!isValid) {
          signatureFailures++;
          errors.push({
            type: 'signature_invalid',
            recordId: task.payload.id,
            message: 'One or more signatures failed verification'
          });
        }
      }

      // Verify signatures for all cycles
      for (const cycle of cycles) {
        const isValid = await verifySignatures(cycle, getActorPublicKey);
        if (!isValid) {
          signatureFailures++;
          errors.push({
            type: 'signature_invalid',
            recordId: cycle.payload.id,
            message: 'One or more signatures failed verification'
          });
        }
      }

      const status = errors.length > 0 ? "errors" : warnings.length > 0 ? "warnings" : "valid";

      return {
        status,
        recordsScanned,
        errorsFound: errors,
        warningsFound: warnings,
        validationTime: performance.now() - startTime,
        checksumFailures,
        signatureFailures
      };

    } catch (error) {
      return {
        status: "errors",
        recordsScanned,
        errorsFound: [{
          type: 'schema_violation',
          recordId: 'system',
          message: error instanceof Error ? error.message : String(error)
        }],
        warningsFound: warnings,
        validationTime: performance.now() - startTime,
        checksumFailures,
        signatureFailures
      };
    }
  }

  /**
   * [EARS-5] Checks if index is up to date by comparing timestamps
   * Uses metadata.generatedAt from cached data (backend-agnostic)
   */
  async isIndexUpToDate(): Promise<boolean> {
    try {
      // Check if cache exists using Store abstraction
      const cacheExists = await this.cacheStore.exists('index');
      if (!cacheExists) {
        return false;
      }

      // Get cache generation timestamp from metadata (backend-agnostic)
      const indexData = await this.cacheStore.get('index');
      if (!indexData) {
        return false;
      }
      const cacheTime = new Date(indexData.metadata.generatedAt).getTime();

      // Get last modified time of any record (simplified check)
      const taskIds = await this.stores.tasks.list();
      const cycleIds = await this.stores.cycles.list();

      // Check if any records are newer than cache
      for (const id of [...taskIds, ...cycleIds]) {
        const timestamp = this.getTimestampFromId(id);
        if (timestamp * 1000 > cacheTime) { // Convert to milliseconds
          return false; // Found newer record
        }
      }

      return true;
    } catch (error) {
      console.warn(`Error checking cache freshness: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * [EARS-6] Invalidates local cache by removing cache
   */
  async invalidateCache(): Promise<void> {
    try {
      const cacheExists = await this.cacheStore.exists('index');
      if (cacheExists) {
        await this.cacheStore.delete('index');
      }
    } catch (error) {
      throw new Error(`Failed to invalidate cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===== HELPER METHODS =====

  /**
   * Reads all tasks from stores.tasks with full metadata (headers + payloads).
   * Returns complete GitGovTaskRecord objects including signatures for author/lastModifier extraction.
   */
  private async readAllTasks(): Promise<GitGovTaskRecord[]> {
    const taskIds = await this.stores.tasks.list();
    const tasks: GitGovTaskRecord[] = [];

    for (const id of taskIds) {
      const record = await this.stores.tasks.get(id);
      if (record) {
        tasks.push(record);
      }
    }

    return tasks;
  }

  /**
   * Reads all cycles from stores.cycles with full metadata.
   */
  private async readAllCycles(): Promise<GitGovCycleRecord[]> {
    const cycleIds = await this.stores.cycles.list();
    const cycles: GitGovCycleRecord[] = [];

    for (const id of cycleIds) {
      const record = await this.stores.cycles.get(id);
      if (record) {
        cycles.push(record);
      }
    }

    return cycles;
  }

  /**
   * Reads all actors from stores.actors with full metadata.
   */
  private async readAllActors(): Promise<GitGovActorRecord[]> {
    const actorIds = await this.stores.actors.list();
    const actors: GitGovActorRecord[] = [];

    for (const id of actorIds) {
      const record = await this.stores.actors.get(id);
      if (record) {
        actors.push(record);
      }
    }

    return actors;
  }

  /**
   * Reads all feedback from stores.feedbacks with full metadata.
   */
  private async readAllFeedback(): Promise<GitGovFeedbackRecord[]> {
    const feedbackIds = await this.stores.feedbacks.list();
    const feedback: GitGovFeedbackRecord[] = [];

    for (const id of feedbackIds) {
      const record = await this.stores.feedbacks.get(id);
      if (record) {
        feedback.push(record);
      }
    }

    return feedback;
  }

  /**
   * Reads all executions from stores.executions with full metadata.
   */
  private async readAllExecutions(): Promise<GitGovExecutionRecord[]> {
    const executionIds = await this.stores.executions.list();
    const executions: GitGovExecutionRecord[] = [];

    for (const id of executionIds) {
      const record = await this.stores.executions.get(id);
      if (record) {
        executions.push(record);
      }
    }

    return executions;
  }

  /**
   * Reads all changelogs from stores.changelogs with full metadata.
   */
  private async readAllChangelogs(): Promise<GitGovChangelogRecord[]> {
    const changelogIds = await this.stores.changelogs.list();
    const changelogs: GitGovChangelogRecord[] = [];

    for (const id of changelogIds) {
      const record = await this.stores.changelogs.get(id);
      if (record) {
        changelogs.push(record);
      }
    }

    return changelogs;
  }

  /**
   * Writes cache data using Store abstraction
   * [EARS-14] Store implementation handles atomicity internally
   */
  private async writeCacheFile(indexData: IndexData): Promise<void> {
    // Store abstraction handles atomicity internally
    await this.cacheStore.put('index', indexData);
  }

  /**
   * Gets current git commit hash (simplified)
   */
  private async getGitCommitHash(): Promise<string> {
    try {
      // Simplified implementation - would use git commands in real implementation
      return "mock-commit-hash";
    } catch {
      return "unknown";
    }
  }

  /**
   * [EARS-7 to EARS-10] Calculates system-wide derived states for analytics and filtering.
   * 
   * Applies DerivedDataProtocol algorithms to categorize tasks:
   * - isStalled: Tasks en 'active' sin executions >7 días O en 'review' sin approval >3 días
   * - isAtRisk: Tasks con prioridad 'critical' + 'paused' O 2+ blocking feedbacks
   * - needsClarification: Tasks con feedback tipo 'question' abierto
   * - isBlockedByDependency: Tasks con referencias a tasks no completadas
   * 
   * @see derived_data_protocol.md for detailed algorithms
   * @see EARS-7, EARS-8, EARS-9, EARS-10 for requirements
   */
  async calculateDerivedStates(allRecords: AllRecords): Promise<DerivedStates> {
    const derivedStates: DerivedStates = {
      stalledTasks: [],
      atRiskTasks: [],
      needsClarificationTasks: [],
      blockedByDependencyTasks: []
    };

    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    try {
      for (const task of allRecords.tasks) {
        const taskId = task.payload.id;
        const taskPayload = task.payload;

        // [EARS-8] Calculate isStalled
        // Tasks en 'active' sin executions por >7 días O en 'review' sin approval por >3 días
        if (taskPayload.status === 'active' || taskPayload.status === 'review') {
          const taskTimestamp = this.getTimestampFromId(taskId) * 1000; // Convert to milliseconds
          const daysSinceCreation = (now - taskTimestamp) / (24 * 60 * 60 * 1000);

          // Check executions para tasks activas
          const hasRecentExecution = allRecords.executions.some(exec => {
            if (exec.payload.taskId === taskId) {
              const execTimestamp = this.getTimestampFromId(exec.payload.id) * 1000; // Convert to milliseconds
              return (now - execTimestamp) < SEVEN_DAYS_MS;
            }
            return false;
          });

          const isStalled =
            (taskPayload.status === 'active' && daysSinceCreation > 7 && !hasRecentExecution) ||
            (taskPayload.status === 'review' && daysSinceCreation > 3);

          if (isStalled) {
            derivedStates.stalledTasks.push(taskId);
          }
        }

        // [EARS-9] Calculate isAtRisk
        // Tasks con prioridad 'critical' + 'paused' O 2+ blocking feedbacks abiertos
        const isCriticalPaused = taskPayload.priority === 'critical' && taskPayload.status === 'paused';
        const blockingFeedbackCount = allRecords.feedback.filter(feedback => {
          return feedback.payload.type === 'blocking' &&
            feedback.payload.status === 'open' &&
            feedback.payload.entityId === taskId;
        }).length;

        if (isCriticalPaused || blockingFeedbackCount >= 2) {
          derivedStates.atRiskTasks.push(taskId);
        }

        // [EARS-9] Calculate needsClarification
        // Tasks con feedback tipo 'question' abierto
        const hasOpenQuestion = allRecords.feedback.some(feedback => {
          return feedback.payload.type === 'question' &&
            feedback.payload.status === 'open' &&
            feedback.payload.entityId === taskId;
        });

        if (hasOpenQuestion) {
          derivedStates.needsClarificationTasks.push(taskId);
        }

        // [EARS-10] Calculate isBlockedByDependency
        // Tasks con referencias a otras tasks no completadas
        if (taskPayload.references && taskPayload.references.length > 0) {
          const hasBlockingDependency = taskPayload.references.some(ref => {
            if (ref.startsWith('task:')) {
              const dependencyId = ref.replace('task:', '');
              const dependencyTask = allRecords.tasks.find(t => t.payload.id === dependencyId);
              return dependencyTask &&
                dependencyTask.payload.status !== 'done' &&
                dependencyTask.payload.status !== 'archived';
            }
            return false;
          });

          if (hasBlockingDependency) {
            derivedStates.blockedByDependencyTasks.push(taskId);
          }
        }
      }

      return derivedStates;
    } catch (error) {
      console.warn(`calculateDerivedStates error: ${error instanceof Error ? error.message : String(error)}`);
      // Return empty derived states on error (graceful degradation)
      return derivedStates;
    }
  }

  /**
   * [EARS-19] Calculates activity history from Record timestamps for dashboard activity streams
   */
  async calculateActivityHistory(allRecords: AllRecords): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = [];

    try {
      // Tasks creadas (basado en ID timestamp)
      allRecords.tasks.forEach(task => {
        const timestampPart = task.payload.id.split('-')[0];
        if (timestampPart) {
          events.push({
            timestamp: parseInt(timestampPart),
            type: 'task_created',
            entityId: task.payload.id,
            entityTitle: task.payload.title,
            actorId: task.header.signatures[0]?.keyId || 'unknown', // Extract from first signature
            metadata: { priority: task.payload.priority, status: task.payload.status }
          });
        }
      });

      // Cycles creados (basado en ID timestamp)
      allRecords.cycles.forEach(cycle => {
        const timestampPart = cycle.payload.id.split('-')[0];
        if (timestampPart) {
          events.push({
            timestamp: parseInt(timestampPart),
            type: 'cycle_created',
            entityId: cycle.payload.id,
            entityTitle: cycle.payload.title,
            actorId: cycle.header.signatures[0]?.keyId || 'unknown', // Extract from first signature
            metadata: { status: cycle.payload.status }
          });
        }
      });

      // Feedback creado (basado en ID timestamp)
      allRecords.feedback.forEach(feedback => {
        const timestampPart = feedback.payload.id.split('-')[0];
        if (timestampPart) {
          const metadata: { type: string; assignee?: string; resolution: string } = {
            type: feedback.payload.type,
            resolution: feedback.payload.status
          };
          if (feedback.payload.assignee) {
            metadata.assignee = feedback.payload.assignee;
          }

          const event: ActivityEvent = {
            timestamp: parseInt(timestampPart),
            type: 'feedback_created',
            entityId: feedback.payload.id,
            entityTitle: `${feedback.payload.type}: ${feedback.payload.content.slice(0, 40)}...`,
            actorId: feedback.header.signatures[0]?.keyId || feedback.payload.assignee || 'unknown',
            metadata
          };

          events.push(event);
        }
      });

      // Changelogs creados (basado en ID timestamp) 
      allRecords.changelogs.forEach(changelog => {
        const timestampPart = changelog.payload.id.split('-')[0];
        if (timestampPart) {
          const event: ActivityEvent = {
            timestamp: parseInt(timestampPart),
            type: 'changelog_created',
            entityId: changelog.payload.id,
            entityTitle: changelog.payload.title || 'Release notes',
            actorId: changelog.header.signatures[0]?.keyId || 'unknown'
          };
          if (changelog.payload.version) {
            event.metadata = { version: changelog.payload.version };
          }
          events.push(event);
        }
      });

      // Executions creadas (basado en ID timestamp)
      allRecords.executions.forEach(execution => {
        const timestampPart = execution.payload.id.split('-')[0];
        if (timestampPart) {
          events.push({
            timestamp: parseInt(timestampPart),
            type: 'execution_created',
            entityId: execution.payload.id,
            entityTitle: execution.payload.title || `Working on ${execution.payload.taskId.slice(-8)}`,
            actorId: execution.header.signatures[0]?.keyId || 'unknown', // Extract from first signature
            metadata: {
              executionType: execution.payload.type || 'development',
              taskId: execution.payload.taskId
            }
          });
        }
      });

      // Actors creados (basado en ID timestamp)
      allRecords.actors.forEach(actor => {
        const timestampPart = actor.payload.id.split('-')[0];
        if (timestampPart) {
          events.push({
            timestamp: parseInt(timestampPart),
            type: 'actor_created',
            entityId: actor.payload.id,
            entityTitle: `${actor.payload.displayName} joined (${actor.payload.type})`,
            metadata: { type: actor.payload.type }
          });
        }
      });

      // [EARS-20] Ordenar cronológicamente y limitar a últimos 15 eventos
      return events
        .sort((a, b) => b.timestamp - a.timestamp) // Más recientes primero
        .slice(0, 15); // Últimos 15 eventos para performance

    } catch (error) {
      // Graceful degradation si hay errores
      console.warn('Error calculating activity history:', error);
      return [];
    }
  }

  /**
   * [EARS-19, EARS-22, EARS-24] Calculate lastUpdated timestamp and activity type for a task
   * Uses signature timestamps instead of file mtime (backend-agnostic)
   * @param task - Full GitGovTaskRecord with header.signatures for timestamp extraction
   */
  async calculateLastUpdated(
    task: GitGovTaskRecord,
    relatedRecords: AllRecords
  ): Promise<{ lastUpdated: number; lastActivityType: EnrichedTaskRecord['lastActivityType']; recentActivity: string }> {
    try {
      const taskPayload = task.payload;
      const creationTime = this.getTimestampFromId(taskPayload.id) * 1000; // Convert to milliseconds
      let lastUpdated = creationTime;
      let lastActivityType: EnrichedTaskRecord['lastActivityType'] = 'task_created';
      let recentActivity = 'Task created';

      // 1. [EARS-22] Check signature timestamp for task modification (backend-agnostic)
      // Uses extractLastModifier() instead of file mtime
      const lastModifier = extractLastModifier(task);
      if (lastModifier) {
        const signatureTime = lastModifier.timestamp * 1000; // Convert to milliseconds
        const timeDifference = signatureTime - creationTime;

        // [EARS-24] Only consider significant modifications (>60s after creation)
        if (timeDifference > 60000 && signatureTime > lastUpdated) {
          lastUpdated = signatureTime;
          lastActivityType = 'task_modified';
          recentActivity = `Task modified ${this.formatTimeAgo(signatureTime)}`;
        }
      }

      // 2. Check related feedback records
      const relatedFeedback = relatedRecords.feedback.filter(f =>
        f.payload.entityId === taskPayload.id || (f.payload.content && f.payload.content.includes(taskPayload.id))
      );

      for (const feedback of relatedFeedback) {
        const feedbackTime = this.getTimestampFromId(feedback.payload.id) * 1000; // Convert to milliseconds
        if (feedbackTime > lastUpdated) {
          lastUpdated = feedbackTime;
          lastActivityType = 'feedback_received';
          recentActivity = `${feedback.payload.type} feedback: ${feedback.payload.content.slice(0, 30)}...`;
        }
      }

      // 3. Check related execution records
      const relatedExecutions = relatedRecords.executions.filter(e => e.payload.taskId === taskPayload.id);

      for (const execution of relatedExecutions) {
        const executionTime = this.getTimestampFromId(execution.payload.id) * 1000; // Convert to milliseconds
        if (executionTime > lastUpdated) {
          lastUpdated = executionTime;
          lastActivityType = 'execution_added';
          recentActivity = `Execution: ${execution.payload.title || 'Work logged'}`;
        }
      }

      // 4. Check related changelog records
      const relatedChangelogs = relatedRecords.changelogs.filter(c =>
        (c.payload.relatedTasks && c.payload.relatedTasks.includes(taskPayload.id)) ||
        c.payload.description?.includes(taskPayload.id)
      );

      for (const changelog of relatedChangelogs) {
        const changelogTime = this.getTimestampFromId(changelog.payload.id) * 1000; // Convert to milliseconds
        if (changelogTime > lastUpdated) {
          lastUpdated = changelogTime;
          lastActivityType = 'changelog_created';
          recentActivity = `Changelog: ${changelog.payload.title}`;
        }
      }

      return { lastUpdated, lastActivityType, recentActivity };

    } catch (error) {
      // Graceful fallback
      const fallbackTime = this.getTimestampFromId(task.payload.id) * 1000; // Convert to milliseconds
      return {
        lastUpdated: fallbackTime,
        lastActivityType: 'task_created',
        recentActivity: 'Task created'
      };
    }
  }

  /**
   * [EARS-22] Enrich a TaskRecord with activity metadata
   * @param task - Full GitGovTaskRecord with header.signatures for author/lastModifier extraction
   * @param relatedRecords - All related records with full metadata
   */
  /**
   * Enriches a task with complete intelligence layer (EARS 25-48)
   * 
   * 11-step algorithm:
   * 1. Activity metadata (lastUpdated, lastActivityType, recentActivity)
   * 2. Signatures (author, lastModifier with timestamps)
   * 3. Assignments (assignedTo from feedback)
   * 4. Dependencies (dependsOn, blockedBy with typed references)
   * 5. Cycles (all cycles as array with id+title)
   * 6. Metrics (executionCount, blockingFeedbackCount, openQuestionCount)
   * 7. Time to resolution (for done tasks)
   * 8. Release info (isReleased, lastReleaseVersion from changelogs)
   * 9. Derived states (EARS-43: REUTILIZA pre-calculated derivedStates con O(1) lookup)
   * 10. Health score (0-100 using multi-factor algorithm)
   * 11. Time in current stage (days)
   * 
   * @param task - Full GitGovTaskRecord with header.signatures
   * @param relatedRecords - All records for cross-referencing
   * @param derivedStateSets - Pre-calculated system-wide derived states as Sets for O(1) lookup (EARS-43)
   * @returns Promise<EnrichedTaskRecord> - Task with complete intelligence layer
   */
  async enrichTaskRecord(
    task: GitGovTaskRecord,
    relatedRecords: AllRecords,
    derivedStateSets: DerivedStateSets
  ): Promise<EnrichedTaskRecord> {
    // Step 1: Activity metadata (now uses full task for signature timestamps)
    const { lastUpdated, lastActivityType, recentActivity } = await this.calculateLastUpdated(task, relatedRecords);

    // Step 2: Signatures (author, lastModifier) using signature_utils helpers
    const author = extractAuthor(task);
    const lastModifier = extractLastModifier(task);

    // Step 3: Assignments (assignedTo from feedback)
    const assignments = relatedRecords.feedback
      .filter(f => f.payload.entityId === task.payload.id && f.payload.type === 'assignment')
      .map(f => ({
        actorId: f.payload.assignee || 'unknown',
        assignedAt: this.getTimestampFromId(f.payload.id) * 1000 // ms
      }));

    // Step 4: Dependencies (dependsOn, blockedBy with typed references)
    // [EARS-37] Include ALL typed references (task:, pr:, issue:, file:, url:)
    // Filter out completed tasks, but preserve external references always
    const completedStatuses = ['done', 'archived', 'discarded'];
    const dependsOn = (task.payload.references || [])
      .filter(ref => {
        // Include all typed references (task:, pr:, issue:, file:, url:)
        const hasValidPrefix = ref.startsWith('task:') || ref.startsWith('pr:') ||
          ref.startsWith('issue:') || ref.startsWith('file:') ||
          ref.startsWith('url:');

        if (!hasValidPrefix) return false;

        // For task: references, filter out completed tasks
        if (ref.startsWith('task:')) {
          const refTaskId = ref.replace('task:', '');
          const refTask = relatedRecords.tasks.find(t => t.payload.id === refTaskId);
          return !refTask || !refTask.payload.status || !completedStatuses.includes(refTask.payload.status);
        }

        // For external references (pr:, issue:, file:, url:), always include
        return true;
      });

    const blockedBy = relatedRecords.tasks
      .filter(t => !completedStatuses.includes(t.payload.status))
      .filter(t => (t.payload.references || []).includes(`task:${task.payload.id}`))
      .map(t => `task:${t.payload.id}`);

    // Step 5: Cycles (all cycles as array with id+title)
    const cycles = (task.payload.cycleIds || [])
      .map(cycleId => {
        const cycle = relatedRecords.cycles.find(c => c.payload.id === cycleId);
        return cycle ? { id: cycleId, title: cycle.payload.title } : null;
      })
      .filter((c): c is { id: string; title: string } => c !== null);

    // Step 6: Metrics
    const executionCount = relatedRecords.executions.filter(e => e.payload.taskId === task.payload.id).length;
    const blockingFeedbackCount = relatedRecords.feedback.filter(
      f => f.payload.entityId === task.payload.id && f.payload.type === 'blocking' && f.payload.status === 'open'
    ).length;
    const openQuestionCount = relatedRecords.feedback.filter(
      f => f.payload.entityId === task.payload.id && f.payload.type === 'question' && f.payload.status === 'open'
    ).length;

    // Step 7: Time to resolution (for done tasks)
    const timeToResolution: number | undefined = task.payload.status === 'done'
      ? (lastUpdated - this.getTimestampFromId(task.payload.id) * 1000) / (1000 * 60 * 60) // horas
      : undefined;

    // Step 8: Release info (from changelogs)
    const releaseChangelogs = relatedRecords.changelogs.filter(cl =>
      cl.payload.relatedTasks.includes(task.payload.id)
    );
    const isReleased = releaseChangelogs.length > 0;
    const lastReleaseVersion: string | undefined = isReleased
      ? (releaseChangelogs[releaseChangelogs.length - 1]?.payload.version || undefined)
      : undefined;

    // Step 9: Derived states (EARS-43: Usar pre-calculated derivedStates con O(1) lookup)
    // NO recalcular - buscar en los Sets de derivedStateSets pre-calculados
    const taskId = task.payload.id;
    const isStalled = derivedStateSets.stalledTasks.has(taskId);
    const isAtRisk = derivedStateSets.atRiskTasks.has(taskId);
    const needsClarification = derivedStateSets.needsClarificationTasks.has(taskId);
    const isBlockedByDependency = derivedStateSets.blockedByDependencyTasks.has(taskId);

    // Calculate daysSinceLastUpdate for health score and timeInCurrentStage
    const daysSinceLastUpdate = (Date.now() - lastUpdated) / (1000 * 60 * 60 * 24);

    // Step 10: Health score (0-100)
    let healthScore = 100;

    // Status health (30 points)
    if (task.payload.status === 'done') healthScore -= 0; // Perfect
    else if (task.payload.status === 'active') healthScore -= 5;
    else if (task.payload.status === 'ready') healthScore -= 10;
    else if (task.payload.status === 'review') healthScore -= 15;
    else if (task.payload.status === 'paused') healthScore -= 25;
    else healthScore -= 30; // draft, archived, discarded

    // Feedback health (30 points)
    healthScore -= Math.min(blockingFeedbackCount * 10, 30);

    // Executions health (20 points)
    if (executionCount === 0 && task.payload.status === 'active') healthScore -= 20;
    else if (executionCount < 2) healthScore -= 10;

    // Time health (20 points)
    if (daysSinceLastUpdate > 30) healthScore -= 20;
    else if (daysSinceLastUpdate > 14) healthScore -= 15;
    else if (daysSinceLastUpdate > 7) healthScore -= 10;

    healthScore = Math.max(0, Math.min(100, healthScore));

    // Step 11: Time in current stage (days)
    const timeInCurrentStage = daysSinceLastUpdate;

    // Build enriched record with conditional optional properties
    const enrichedRecord: EnrichedTaskRecord = {
      ...task.payload,
      derivedState: {
        isStalled,
        isAtRisk,
        needsClarification,
        isBlockedByDependency,
        healthScore,
        timeInCurrentStage
      },
      relationships: {
        ...(author && { author }),
        ...(lastModifier && { lastModifier }),
        assignedTo: assignments,
        dependsOn,
        blockedBy,
        cycles
      },
      metrics: {
        executionCount,
        blockingFeedbackCount,
        openQuestionCount,
        ...(timeToResolution !== undefined && { timeToResolution })
      },
      release: {
        isReleased,
        ...(lastReleaseVersion !== undefined && { lastReleaseVersion })
      },
      lastUpdated,
      lastActivityType,
      ...(recentActivity && { recentActivity })
    };

    return enrichedRecord;
  }

  /**
   * Format timestamp as human-readable time ago
   */
  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  /**
   * Extracts timestamp from ID (format: {timestamp}-{type}-{slug})
   */
  private getTimestampFromId(id: string): number {
    try {
      const parts = id.split('-');
      const timestamp = parseInt(parts[0] || '0', 10);

      if (isNaN(timestamp) || timestamp <= 0) {
        throw new Error(`Invalid timestamp in ID: ${id}`);
      }

      return timestamp;
    } catch (error) {
      throw new Error(`Cannot extract timestamp from ID: ${id}`);
    }
  }
}
