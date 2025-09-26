import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import { RecordStore } from '../../store';
import { MetricsAdapter } from '../metrics_adapter';
import type { TaskRecord } from '../../types';
import type { CycleRecord } from '../../types';
import type { FeedbackRecord } from '../../types';
import type { ExecutionRecord } from '../../types';
import type { ChangelogRecord } from '../../types';
import type { ActorRecord } from '../../types';
import type { SystemStatus, ProductivityMetrics, CollaborationMetrics } from '../metrics_adapter';
import type { ActivityEvent } from '../../event_bus';

// Type for all records collection
export type AllRecords = {
  tasks: TaskRecord[];
  cycles: CycleRecord[];
  feedback: FeedbackRecord[];
  executions: ExecutionRecord[];
  changelogs: ChangelogRecord[];
  actors: ActorRecord[];
};

/**
 * Enhanced Task Record with calculated activity metadata
 * Used by Dashboard for intelligent sorting and display
 */
export type EnrichedTaskRecord = TaskRecord & {
  lastUpdated: number; // Unix timestamp of most recent activity
  lastActivityType: 'task_modified' | 'feedback_received' | 'execution_added' | 'changelog_created' | 'task_created';
  recentActivity?: string; // Human-readable description of recent activity
};

/**
 * IndexerAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export type IndexerAdapterDependencies = {
  // Core calculation engine (CRITICAL)
  metricsAdapter: MetricsAdapter;

  // Data stores (read-only)
  taskStore: RecordStore<TaskRecord>;
  cycleStore: RecordStore<CycleRecord>;
  feedbackStore?: RecordStore<FeedbackRecord>;
  executionStore?: RecordStore<ExecutionRecord>;
  changelogStore?: RecordStore<ChangelogRecord>;
  actorStore?: RecordStore<ActorRecord>;

  // Optional: Configuration for evolution phases
  cacheStrategy?: "json" | "sqlite" | "dual"; // Default: 'json'
  cachePath?: string; // Default: '.gitgov/index.json'
};

/**
 * Return types specific to the adapter
 */
export type IndexData = {
  metadata: {
    generatedAt: string;
    lastCommitHash: string;
    integrityStatus: "valid" | "warnings" | "errors";
    recordCounts: Record<string, number>;
    cacheStrategy: "json" | "sqlite" | "dual";
    generationTime: number; // ms
  };
  metrics: SystemStatus & ProductivityMetrics & CollaborationMetrics;
  activityHistory: ActivityEvent[]; // Para dashboard activity streams
  tasks: TaskRecord[];
  enrichedTasks: EnrichedTaskRecord[]; // Tasks with activity metadata for Dashboard
  cycles: CycleRecord[];
  actors: ActorRecord[];
};

export type IntegrityReport = {
  status: "valid" | "warnings" | "errors";
  recordsScanned: number;
  errorsFound: IntegrityError[];
  warningsFound: IntegrityWarning[];
  validationTime: number; // ms
  checksumFailures: number;
  signatureFailures: number;
};

export type IndexGenerationReport = {
  success: boolean;
  recordsProcessed: number;
  metricsCalculated: number;
  generationTime: number; // ms
  cacheSize: number; // bytes
  cacheStrategy: "json" | "sqlite" | "dual";
  errors: string[];
  performance: {
    readTime: number;
    calculationTime: number;
    writeTime: number;
  };
};

export type IntegrityError = {
  type: 'schema_violation' | 'checksum_failure' | 'signature_invalid';
  recordId: string;
  message: string;
};

export type IntegrityWarning = {
  type: 'missing_reference' | 'deprecated_field' | 'performance_issue';
  recordId: string;
  message: string;
};

/**
 * IndexerAdapter Interface - The Cache Engine
 */
export interface IIndexerAdapter {
  generateIndex(): Promise<IndexGenerationReport>;
  getIndexData(): Promise<IndexData | null>;
  validateIntegrity(): Promise<IntegrityReport>;
  calculateActivityHistory(allRecords: AllRecords): Promise<ActivityEvent[]>; // NUEVO
  calculateLastUpdated(task: TaskRecord, relatedRecords: AllRecords): Promise<{ lastUpdated: number; lastActivityType: EnrichedTaskRecord['lastActivityType']; recentActivity: string }>; // NUEVO
  enrichTaskRecord(task: TaskRecord, relatedRecords: AllRecords): Promise<EnrichedTaskRecord>; // NUEVO
  isIndexUpToDate(): Promise<boolean>;
  invalidateCache(): Promise<void>;
}

/**
 * FileIndexerAdapter - Phase 1 Implementation
 * 
 * File-based cache implementation using .gitgov/index.json
 * Optimized for teams with <500 records
 */
export class FileIndexerAdapter implements IIndexerAdapter {
  private metricsAdapter: MetricsAdapter;
  private taskStore: RecordStore<TaskRecord>;
  private cycleStore: RecordStore<CycleRecord>;
  private feedbackStore: RecordStore<FeedbackRecord> | undefined;
  private executionStore: RecordStore<ExecutionRecord> | undefined;
  private changelogStore: RecordStore<ChangelogRecord> | undefined;
  private actorStore: RecordStore<ActorRecord> | undefined;
  private cacheStrategy: "json" | "sqlite" | "dual";
  private cachePath: string;

  constructor(dependencies: IndexerAdapterDependencies) {
    // Core calculation engine (REQUIRED)
    this.metricsAdapter = dependencies.metricsAdapter;

    // Data stores (REQUIRED)
    this.taskStore = dependencies.taskStore;
    this.cycleStore = dependencies.cycleStore;

    // Optional stores (graceful degradation)
    this.feedbackStore = dependencies.feedbackStore;
    this.executionStore = dependencies.executionStore;
    this.changelogStore = dependencies.changelogStore;
    this.actorStore = dependencies.actorStore;

    // Configuration with defaults
    this.cacheStrategy = dependencies.cacheStrategy || "json";
    this.cachePath = dependencies.cachePath || ".gitgov/index.json";
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

      // 3.5. Enrich tasks with activity metadata
      const enrichedTasks: EnrichedTaskRecord[] = [];
      for (const task of tasks) {
        const enrichedTask = await this.enrichTaskRecord(task, allRecords);
        enrichedTasks.push(enrichedTask);
      }

      // 4. Build IndexData structure
      const indexData: IndexData = {
        metadata: {
          generatedAt: new Date().toISOString(),
          lastCommitHash: await this.getGitCommitHash(),
          integrityStatus: "valid", // TODO: Implement integrity check
          recordCounts: {
            tasks: tasks.length,
            cycles: cycles.length,
            actors: actors.length,
            feedback: allRecords.feedback.length,
            executions: allRecords.executions.length,
            changelogs: allRecords.changelogs.length
          },
          cacheStrategy: this.cacheStrategy,
          generationTime: 0 // Will be set below
        },
        metrics: { ...systemStatus, ...productivityMetrics, ...collaborationMetrics },
        activityHistory, // NUEVO
        tasks,
        enrichedTasks, // NUEVO - Tasks with activity metadata
        cycles,
        actors
      };

      // 4. Write cache (Phase 1: JSON file)
      const writeStart = performance.now();
      await this.writeCacheFile(indexData);
      performance_metrics.writeTime = performance.now() - writeStart;

      const totalTime = performance.now() - startTime;
      indexData.metadata.generationTime = totalTime;

      // 5. Get cache size
      const cacheSize = await this.getCacheFileSize();

      return {
        success: true,
        recordsProcessed: tasks.length + cycles.length + actors.length,
        metricsCalculated: 3, // systemStatus + productivity + collaboration
        generationTime: totalTime,
        cacheSize,
        cacheStrategy: this.cacheStrategy,
        errors: [],
        performance: performance_metrics
      };

    } catch (error) {
      return {
        success: false,
        recordsProcessed: 0,
        metricsCalculated: 0,
        generationTime: performance.now() - startTime,
        cacheSize: 0,
        cacheStrategy: this.cacheStrategy,
        errors: [error instanceof Error ? error.message : String(error)],
        performance: performance_metrics
      };
    }
  }

  /**
   * [EARS-2] Gets data from local cache for fast CLI queries
   */
  async getIndexData(): Promise<IndexData | null> {
    try {
      // Check if cache file exists
      const cacheExists = await this.cacheFileExists();
      if (!cacheExists) {
        return null; // EARS-3: Return null without cache
      }

      // Validate freshness
      const isUpToDate = await this.isIndexUpToDate();
      if (!isUpToDate) {
        return null; // Cache is stale
      }

      // Read and parse cache file
      const cacheContent = await fs.readFile(this.cachePath, 'utf-8');
      const indexData: IndexData = JSON.parse(cacheContent);

      return indexData;
    } catch (error) {
      console.warn(`Cache read error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * [EARS-4] Validates integrity of Records without regenerating cache
   */
  async validateIntegrity(): Promise<IntegrityReport> {
    const startTime = performance.now();
    const errors: IntegrityError[] = [];
    const warnings: IntegrityWarning[] = [];
    let recordsScanned = 0;

    try {
      // Read all records for validation
      const [tasks, cycles] = await Promise.all([
        this.readAllTasks(),
        this.readAllCycles()
      ]);

      recordsScanned = tasks.length + cycles.length;

      // Basic validation (schema validation would need ValidatorModule)
      for (const task of tasks) {
        if (!task.id || !task.description) {
          errors.push({
            type: 'schema_violation',
            recordId: task.id || 'unknown',
            message: 'Task missing required fields'
          });
        }
      }

      for (const cycle of cycles) {
        if (!cycle.id || !cycle.title) {
          errors.push({
            type: 'schema_violation',
            recordId: cycle.id || 'unknown',
            message: 'Cycle missing required fields'
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
        checksumFailures: 0, // TODO: Implement checksum validation
        signatureFailures: 0  // TODO: Implement signature validation
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
        checksumFailures: 0,
        signatureFailures: 0
      };
    }
  }

  /**
   * [EARS-5] Checks if index is up to date by comparing timestamps
   */
  async isIndexUpToDate(): Promise<boolean> {
    try {
      // Check if cache exists
      const cacheExists = await this.cacheFileExists();
      if (!cacheExists) {
        return false;
      }

      // Get cache timestamp
      const cacheStats = await fs.stat(this.cachePath);
      const cacheTime = cacheStats.mtime.getTime();

      // Get last modified time of any record (simplified check)
      const taskIds = await this.taskStore.list();
      const cycleIds = await this.cycleStore.list();

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
   * [EARS-6] Invalidates local cache by removing cache files
   */
  async invalidateCache(): Promise<void> {
    try {
      const cacheExists = await this.cacheFileExists();
      if (cacheExists) {
        await fs.unlink(this.cachePath);
      }
    } catch (error) {
      throw new Error(`Failed to invalidate cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===== HELPER METHODS =====

  /**
   * Reads all tasks from taskStore
   */
  private async readAllTasks(): Promise<TaskRecord[]> {
    const taskIds = await this.taskStore.list();
    const tasks: TaskRecord[] = [];

    for (const id of taskIds) {
      const record = await this.taskStore.read(id);
      if (record) {
        tasks.push(record.payload);
      }
    }

    return tasks;
  }

  /**
   * Reads all cycles from cycleStore
   */
  private async readAllCycles(): Promise<CycleRecord[]> {
    const cycleIds = await this.cycleStore.list();
    const cycles: CycleRecord[] = [];

    for (const id of cycleIds) {
      const record = await this.cycleStore.read(id);
      if (record) {
        cycles.push(record.payload);
      }
    }

    return cycles;
  }

  /**
   * Reads all actors from actorStore (graceful degradation)
   */
  private async readAllActors(): Promise<ActorRecord[]> {
    if (!this.actorStore) {
      return [];
    }

    const actorIds = await this.actorStore.list();
    const actors: ActorRecord[] = [];

    for (const id of actorIds) {
      const record = await this.actorStore.read(id);
      if (record) {
        actors.push(record.payload);
      }
    }

    return actors;
  }

  /**
   * Reads all feedback from feedbackStore (graceful degradation)
   */
  private async readAllFeedback(): Promise<FeedbackRecord[]> {
    if (!this.feedbackStore) {
      return [];
    }

    const feedbackIds = await this.feedbackStore.list();
    const feedback: FeedbackRecord[] = [];

    for (const id of feedbackIds) {
      const record = await this.feedbackStore.read(id);
      if (record) {
        feedback.push(record.payload);
      }
    }

    return feedback;
  }

  /**
   * Reads all executions from executionStore (graceful degradation)
   */
  private async readAllExecutions(): Promise<ExecutionRecord[]> {
    if (!this.executionStore) {
      return [];
    }

    const executionIds = await this.executionStore.list();
    const executions: ExecutionRecord[] = [];

    for (const id of executionIds) {
      const record = await this.executionStore.read(id);
      if (record) {
        executions.push(record.payload);
      }
    }

    return executions;
  }

  /**
   * Reads all changelogs from changelogStore (graceful degradation)
   */
  private async readAllChangelogs(): Promise<ChangelogRecord[]> {
    if (!this.changelogStore) {
      return [];
    }

    const changelogIds = await this.changelogStore.list();
    const changelogs: ChangelogRecord[] = [];

    for (const id of changelogIds) {
      const record = await this.changelogStore.read(id);
      if (record) {
        changelogs.push(record.payload);
      }
    }

    return changelogs;
  }

  /**
   * Writes cache data to file (Phase 1: JSON)
   */
  private async writeCacheFile(indexData: IndexData): Promise<void> {
    // Ensure .gitgov directory exists
    const cacheDir = path.dirname(this.cachePath);
    await fs.mkdir(cacheDir, { recursive: true });

    // Write JSON cache file
    const jsonContent = JSON.stringify(indexData, null, 2);
    await fs.writeFile(this.cachePath, jsonContent, 'utf-8');
  }

  /**
   * Checks if cache file exists
   */
  private async cacheFileExists(): Promise<boolean> {
    try {
      await fs.access(this.cachePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets cache file size in bytes
   */
  private async getCacheFileSize(): Promise<number> {
    try {
      const stats = await fs.stat(this.cachePath);
      return stats.size;
    } catch {
      return 0;
    }
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
   * [EARS-19] Calculates activity history from Record timestamps for dashboard activity streams
   */
  async calculateActivityHistory(allRecords: AllRecords): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = [];

    try {
      // Tasks creadas (basado en ID timestamp)
      allRecords.tasks.forEach(task => {
        const timestampPart = task.id.split('-')[0];
        if (timestampPart) {
          events.push({
            timestamp: parseInt(timestampPart),
            type: 'task_created',
            entityId: task.id,
            entityTitle: task.title,
            actorId: 'human:camilo', // TODO: Extraer del primer signature
            metadata: { priority: task.priority, status: task.status }
          });
        }
      });

      // Cycles creados (basado en ID timestamp)
      allRecords.cycles.forEach(cycle => {
        const timestampPart = cycle.id.split('-')[0];
        if (timestampPart) {
          events.push({
            timestamp: parseInt(timestampPart),
            type: 'cycle_created',
            entityId: cycle.id,
            entityTitle: cycle.title,
            actorId: 'human:scrum-master', // TODO: Extraer del primer signature
            metadata: { status: cycle.status }
          });
        }
      });

      // Feedback creado (basado en ID timestamp)
      allRecords.feedback.forEach(feedback => {
        const timestampPart = feedback.id.split('-')[0];
        if (timestampPart) {
          const metadata: { type: string; assignee?: string; resolution: string } = {
            type: feedback.type,
            resolution: feedback.status
          };
          if (feedback.assignee) {
            metadata.assignee = feedback.assignee;
          }

          const event: ActivityEvent = {
            timestamp: parseInt(timestampPart),
            type: 'feedback_created',
            entityId: feedback.id,
            entityTitle: `${feedback.type}: ${feedback.content.slice(0, 40)}...`,
            metadata
          };
          if (feedback.assignee) {
            event.actorId = feedback.assignee;
          }

          events.push(event);
        }
      });

      // Changelogs creados (basado en ID timestamp) 
      allRecords.changelogs.forEach(changelog => {
        const timestampPart = changelog.id.split('-')[0];
        if (timestampPart) {
          events.push({
            timestamp: parseInt(timestampPart),
            type: 'changelog_created',
            entityId: changelog.id,
            entityTitle: changelog.title || 'Release notes',
            actorId: 'agent:api-dev', // TODO: Extraer del primer signature
            metadata: { type: changelog.changeType }
          });
        }
      });

      // Executions creadas (basado en ID timestamp)
      allRecords.executions.forEach(execution => {
        const timestampPart = execution.id.split('-')[0];
        if (timestampPart) {
          events.push({
            timestamp: parseInt(timestampPart),
            type: 'execution_created',
            entityId: execution.id,
            entityTitle: execution.title || `Working on ${execution.taskId.slice(-8)}`,
            actorId: 'human:developer', // TODO: Extraer del primer signature
            metadata: {
              executionType: execution.type || 'development',
              taskId: execution.taskId
            }
          });
        }
      });

      // Actors creados (basado en ID timestamp)
      allRecords.actors.forEach(actor => {
        const timestampPart = actor.id.split('-')[0];
        if (timestampPart) {
          events.push({
            timestamp: parseInt(timestampPart),
            type: 'actor_created',
            entityId: actor.id,
            entityTitle: `${actor.displayName} joined (${actor.type})`,
            metadata: { type: actor.type }
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
   * [EARS-21] Calculate lastUpdated timestamp and activity type for a task
   * Considers task file modification time and related records timestamps
   */
  async calculateLastUpdated(
    task: TaskRecord,
    relatedRecords: AllRecords
  ): Promise<{ lastUpdated: number; lastActivityType: EnrichedTaskRecord['lastActivityType']; recentActivity: string }> {
    try {
      let lastUpdated = this.getTimestampFromId(task.id) * 1000; // Convert to milliseconds for consistency
      let lastActivityType: EnrichedTaskRecord['lastActivityType'] = 'task_created';
      let recentActivity = 'Task created';


      // 1. Check task file modification time (only if significantly newer than creation)
      try {
        // Find the project root by looking for .gitgov directory
        let projectRoot = process.cwd();
        while (!fsSync.existsSync(path.join(projectRoot, '.gitgov')) && projectRoot !== '/') {
          projectRoot = path.dirname(projectRoot);
        }
        const taskFilePath = path.join(projectRoot, '.gitgov', 'tasks', `${task.id}.json`);
        const stats = await fs.stat(taskFilePath);
        const fileModTime = stats.mtime.getTime();

        // Only consider file modification if it's more than 60 seconds after creation
        // This avoids counting initial file creation as "modification"
        const creationTime = this.getTimestampFromId(task.id) * 1000;
        const timeDifference = fileModTime - creationTime;

        if (timeDifference > 60000 && fileModTime > lastUpdated) { // 60 seconds threshold
          lastUpdated = fileModTime;
          lastActivityType = 'task_modified';
          recentActivity = `Task modified ${this.formatTimeAgo(fileModTime)}`;

        }
      } catch (error) {
        // File not accessible, continue with other checks
      }

      // 2. Check related feedback records
      const relatedFeedback = relatedRecords.feedback.filter(f =>
        f.entityId === task.id || f.content.includes(task.id)
      );

      for (const feedback of relatedFeedback) {
        const feedbackTime = this.getTimestampFromId(feedback.id) * 1000; // Convert to milliseconds
        if (feedbackTime > lastUpdated) {
          lastUpdated = feedbackTime;
          lastActivityType = 'feedback_received';
          recentActivity = `${feedback.type} feedback: ${feedback.content.slice(0, 30)}...`;
        }
      }

      // 3. Check related execution records
      const relatedExecutions = relatedRecords.executions.filter(e => e.taskId === task.id);

      for (const execution of relatedExecutions) {
        const executionTime = this.getTimestampFromId(execution.id) * 1000; // Convert to milliseconds
        if (executionTime > lastUpdated) {
          lastUpdated = executionTime;
          lastActivityType = 'execution_added';
          recentActivity = `Execution: ${execution.title || 'Work logged'}`;
        }
      }

      // 4. Check related changelog records
      const relatedChangelogs = relatedRecords.changelogs.filter(c =>
        c.entityId === task.id ||
        c.references?.tasks?.includes(task.id) ||
        c.description?.includes(task.id)
      );

      for (const changelog of relatedChangelogs) {
        const changelogTime = this.getTimestampFromId(changelog.id) * 1000; // Convert to milliseconds
        if (changelogTime > lastUpdated) {
          lastUpdated = changelogTime;
          lastActivityType = 'changelog_created';
          recentActivity = `Changelog: ${changelog.title}`;
        }
      }

      return { lastUpdated, lastActivityType, recentActivity };

    } catch (error) {
      // Graceful fallback
      const fallbackTime = this.getTimestampFromId(task.id) * 1000; // Convert to milliseconds
      return {
        lastUpdated: fallbackTime,
        lastActivityType: 'task_created',
        recentActivity: 'Task created'
      };
    }
  }

  /**
   * [EARS-22] Enrich a TaskRecord with activity metadata
   */
  async enrichTaskRecord(task: TaskRecord, relatedRecords: AllRecords): Promise<EnrichedTaskRecord> {
    const { lastUpdated, lastActivityType, recentActivity } = await this.calculateLastUpdated(task, relatedRecords);

    return {
      ...task,
      lastUpdated,
      lastActivityType,
      recentActivity
    };
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
