import * as path from 'path';
import { RecordStore } from '../../../core/src/store';
import { MetricsAdapter } from '../../../core/src/adapters/metrics_adapter';
import { FileIndexerAdapter } from '../../../core/src/adapters/indexer_adapter';
import { BacklogAdapter } from '../../../core/src/adapters/backlog_adapter';
import { FeedbackAdapter } from '../../../core/src/adapters/feedback_adapter';
import { ExecutionAdapter } from '../../../core/src/adapters/execution_adapter';
import { ChangelogAdapter } from '../../../core/src/adapters/changelog_adapter';
import { IdentityAdapter } from '../../../core/src/adapters/identity_adapter';
import { WorkflowMethodologyAdapter } from '../../../core/src/adapters/workflow_methodology_adapter';
import { EventBus } from '../../../core/src/modules/event_bus_module';
import { ConfigManager } from '../../../core/src/config_manager';
import type { TaskRecord } from '../../../core/src/types/task_record';
import type { CycleRecord } from '../../../core/src/types/cycle_record';
import type { FeedbackRecord } from '../../../core/src/types/feedback_record';
import type { ExecutionRecord } from '../../../core/src/types/execution_record';
import type { ChangelogRecord } from '../../../core/src/types/changelog_record';
import type { ActorRecord } from '../../../core/src/types/actor_record';
import type { AgentRecord } from '../../../core/src/types/agent_record';
import type { IIndexerAdapter } from '../../../core/src/adapters/indexer_adapter';

/**
 * Dependency Injection Service for GitGovernance CLI
 * 
 * Creates and manages all adapter instances with proper dependency injection
 * following the established patterns from the core system.
 */
export class DependencyInjectionService {
  private static instance: DependencyInjectionService | null = null;
  private indexerAdapter: IIndexerAdapter | null = null;
  private backlogAdapter: BacklogAdapter | null = null;
  private stores: {
    taskStore: RecordStore<TaskRecord>;
    cycleStore: RecordStore<CycleRecord>;
    feedbackStore: RecordStore<FeedbackRecord>;
    executionStore: RecordStore<ExecutionRecord>;
    changelogStore: RecordStore<ChangelogRecord>;
    actorStore: RecordStore<ActorRecord>;
    agentStore: RecordStore<AgentRecord>;
  } | null = null;

  private constructor() { }

  /**
   * Singleton pattern to ensure single instance across CLI
   */
  static getInstance(): DependencyInjectionService {
    if (!DependencyInjectionService.instance) {
      DependencyInjectionService.instance = new DependencyInjectionService();
    }
    return DependencyInjectionService.instance;
  }

  /**
   * Initialize stores (shared between adapters)
   */
  private async initializeStores(): Promise<void> {
    if (this.stores) {
      return; // Already initialized
    }

    const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || ConfigManager.findGitgovRoot() || process.cwd();
    // Verify .gitgov directory exists in current directory
    const { promises: fs } = await import('fs');
    const gitgovPath = `${projectRoot}/.gitgov`;
    try {
      await fs.access(gitgovPath);
    } catch {
      throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
    }

    this.stores = {
      taskStore: new RecordStore<TaskRecord>('tasks', projectRoot),
      cycleStore: new RecordStore<CycleRecord>('cycles', projectRoot),
      feedbackStore: new RecordStore<FeedbackRecord>('feedback', projectRoot),
      executionStore: new RecordStore<ExecutionRecord>('executions', projectRoot),
      changelogStore: new RecordStore<ChangelogRecord>('changelogs', projectRoot),
      actorStore: new RecordStore<ActorRecord>('actors', projectRoot),
      agentStore: new RecordStore<AgentRecord>('agents', projectRoot),
    };
  }

  /**
   * Creates and returns IndexerAdapter with all required dependencies
   */
  async getIndexerAdapter(): Promise<IIndexerAdapter> {
    if (this.indexerAdapter) {
      return this.indexerAdapter;
    }

    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create MetricsAdapter with dependencies
      const metricsAdapter = new MetricsAdapter({
        taskStore: this.stores.taskStore,
        cycleStore: this.stores.cycleStore,
        feedbackStore: this.stores.feedbackStore,
        executionStore: this.stores.executionStore,
        changelogStore: this.stores.changelogStore,
        actorStore: this.stores.actorStore
      });

      // Create IndexerAdapter with all dependencies
      const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || ConfigManager.findGitgovRoot() || process.cwd();
      const absoluteCachePath = path.join(projectRoot, '.gitgov', 'index.json');

      this.indexerAdapter = new FileIndexerAdapter({
        metricsAdapter,
        taskStore: this.stores.taskStore,
        cycleStore: this.stores.cycleStore,
        feedbackStore: this.stores.feedbackStore,
        executionStore: this.stores.executionStore,
        changelogStore: this.stores.changelogStore,
        actorStore: this.stores.actorStore,
        cacheStrategy: 'json',
        cachePath: absoluteCachePath
      });

      return this.indexerAdapter;

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize cache system: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing cache system.");
    }
  }

  /**
   * Creates and returns BacklogAdapter with all required dependencies
   */
  async getBacklogAdapter(): Promise<BacklogAdapter> {
    if (this.backlogAdapter) {
      return this.backlogAdapter;
    }

    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create EventBus
      const eventBus = new EventBus();

      // Create IdentityAdapter with correct dependencies
      const identityAdapter = new IdentityAdapter({
        actorStore: this.stores.actorStore,
        agentStore: this.stores.agentStore,
        eventBus
      });

      // Create other adapters
      const feedbackAdapter = new FeedbackAdapter({
        feedbackStore: this.stores.feedbackStore,
        identity: identityAdapter,
        eventBus
      });

      const executionAdapter = new ExecutionAdapter({
        executionStore: this.stores.executionStore,
        identity: identityAdapter,
        eventBus
      });

      const changelogAdapter = new ChangelogAdapter({
        changelogStore: this.stores.changelogStore,
        identity: identityAdapter,
        eventBus
      });

      // Create MetricsAdapter
      const metricsAdapter = new MetricsAdapter({
        taskStore: this.stores.taskStore,
        cycleStore: this.stores.cycleStore,
        feedbackStore: this.stores.feedbackStore,
        executionStore: this.stores.executionStore,
        changelogStore: this.stores.changelogStore,
        actorStore: this.stores.actorStore
      });

      // Create WorkflowMethodologyAdapter
      const workflowMethodology = new WorkflowMethodologyAdapter({});

      // Create BacklogAdapter with all dependencies
      this.backlogAdapter = new BacklogAdapter({
        taskStore: this.stores.taskStore,
        cycleStore: this.stores.cycleStore,
        feedbackStore: this.stores.feedbackStore,
        executionStore: this.stores.executionStore,
        changelogStore: this.stores.changelogStore,
        feedbackAdapter,
        executionAdapter,
        changelogAdapter,
        metricsAdapter,
        workflowMethodology,
        identity: identityAdapter,
        eventBus
      });

      return this.backlogAdapter;

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize backlog system: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing backlog system.");
    }
  }

  /**
   * Creates and returns IdentityAdapter with all required dependencies
   */
  async getIdentityAdapter(): Promise<IdentityAdapter> {
    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create EventBus
      const eventBus = new EventBus();

      // Create IdentityAdapter with dependencies
      return new IdentityAdapter({
        actorStore: this.stores.actorStore,
        agentStore: this.stores.agentStore,
        eventBus
      });

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize identity system: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing identity system.");
    }
  }

  /**
   * Creates and returns FeedbackAdapter with all required dependencies
   */
  async getFeedbackAdapter(): Promise<FeedbackAdapter> {
    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create EventBus and IdentityAdapter
      const eventBus = new EventBus();
      const identityAdapter = new IdentityAdapter({
        actorStore: this.stores.actorStore,
        agentStore: this.stores.agentStore,
        eventBus
      });

      // Create FeedbackAdapter with dependencies
      return new FeedbackAdapter({
        feedbackStore: this.stores.feedbackStore,
        identity: identityAdapter,
        eventBus
      });

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize feedback system: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing feedback system.");
    }
  }

  /**
   * Creates and returns MetricsAdapter with all required dependencies
   */
  async getMetricsAdapter(): Promise<MetricsAdapter> {
    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create MetricsAdapter with dependencies
      return new MetricsAdapter({
        taskStore: this.stores.taskStore,
        cycleStore: this.stores.cycleStore,
        feedbackStore: this.stores.feedbackStore,
        executionStore: this.stores.executionStore,
        changelogStore: this.stores.changelogStore,
        actorStore: this.stores.actorStore
      });

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize metrics system: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing metrics system.");
    }
  }

  /**
   * Resets the singleton instance (useful for testing)
   */
  static reset(): void {
    DependencyInjectionService.instance = null;
  }

  /**
   * Validates that all required dependencies are available
   */
  async validateDependencies(): Promise<boolean> {
    try {
      const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || ConfigManager.findGitgovRoot() || process.cwd();

      // Check if .gitgov directory exists
      const { promises: fs } = await import('fs');
      const gitgovPath = `${projectRoot}/.gitgov`;

      try {
        await fs.access(gitgovPath);
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }
}