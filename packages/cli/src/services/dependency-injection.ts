import * as path from 'path';
import { Adapters, Config, Records, Store, EventBus } from '@gitgov/core';

/**
 * Dependency Injection Service for GitGovernance CLI
 * 
 * Creates and manages all adapter instances with proper dependency injection
 * following the established patterns from the core system.
 */
export class DependencyInjectionService {
  private static instance: DependencyInjectionService | null = null;
  private indexerAdapter: Adapters.IIndexerAdapter | null = null;
  private backlogAdapter: Adapters.BacklogAdapter | null = null;
  private stores: {
    taskStore: Store.RecordStore<Records.TaskRecord>;
    cycleStore: Store.RecordStore<Records.CycleRecord>;
    feedbackStore: Store.RecordStore<Records.FeedbackRecord>;
    executionStore: Store.RecordStore<Records.ExecutionRecord>;
    changelogStore: Store.RecordStore<Records.ChangelogRecord>;
    actorStore: Store.RecordStore<Records.ActorRecord>;
    agentStore: Store.RecordStore<Records.AgentRecord>;
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

    const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || Config.ConfigManager.findGitgovRoot() || process.cwd();
    // Verify .gitgov directory exists in current directory
    const { promises: fs } = await import('fs');
    const gitgovPath = `${projectRoot}/.gitgov`;
    try {
      await fs.access(gitgovPath);
    } catch {
      throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
    }

    const { Factories } = await import('@gitgov/core');

    this.stores = {
      taskStore: new Store.RecordStore<Records.TaskRecord>('tasks', Factories.loadTaskRecord, projectRoot),
      cycleStore: new Store.RecordStore<Records.CycleRecord>('cycles', Factories.loadCycleRecord, projectRoot),
      feedbackStore: new Store.RecordStore<Records.FeedbackRecord>('feedback', Factories.loadFeedbackRecord, projectRoot),
      executionStore: new Store.RecordStore<Records.ExecutionRecord>('executions', Factories.loadExecutionRecord, projectRoot),
      changelogStore: new Store.RecordStore<Records.ChangelogRecord>('changelogs', Factories.loadChangelogRecord, projectRoot),
      actorStore: new Store.RecordStore<Records.ActorRecord>('actors', Factories.loadActorRecord, projectRoot),
      agentStore: new Store.RecordStore<Records.AgentRecord>('agents', Factories.loadAgentRecord, projectRoot),
    };
  }

  /**
   * Creates and returns IndexerAdapter with all required dependencies
   */
  async getIndexerAdapter(): Promise<Adapters.IIndexerAdapter> {
    if (this.indexerAdapter) {
      return this.indexerAdapter;
    }

    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create Adapters.MetricsAdapter with dependencies
      const metricsAdapter = new Adapters.MetricsAdapter({
        taskStore: this.stores.taskStore,
        cycleStore: this.stores.cycleStore,
        feedbackStore: this.stores.feedbackStore,
        executionStore: this.stores.executionStore,
        actorStore: this.stores.actorStore
      });

      // Create IndexerAdapter with all dependencies
      const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || Config.ConfigManager.findGitgovRoot() || process.cwd();
      const absoluteCachePath = path.join(projectRoot, '.gitgov', 'index.json');

      this.indexerAdapter = new Adapters.FileIndexerAdapter({
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
   * Creates and returns Adapters.BacklogAdapter with all required dependencies
   */
  async getBacklogAdapter(): Promise<Adapters.BacklogAdapter> {
    if (this.backlogAdapter) {
      return this.backlogAdapter;
    }

    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create EventBus
      const eventBus = new EventBus.EventBus();

      // Create IdentityAdapter with correct dependencies
      const identityAdapter = new Adapters.IdentityAdapter({
        actorStore: this.stores.actorStore,
        agentStore: this.stores.agentStore,
        eventBus
      });

      // Create other adapters
      const feedbackAdapter = new Adapters.FeedbackAdapter({
        feedbackStore: this.stores.feedbackStore,
        identity: identityAdapter,
        eventBus
      });

      const executionAdapter = new Adapters.ExecutionAdapter({
        executionStore: this.stores.executionStore,
        identity: identityAdapter,
        eventBus
      });

      const changelogAdapter = new Adapters.ChangelogAdapter({
        changelogStore: this.stores.changelogStore,
        identity: identityAdapter,
        eventBus
      });

      // Create Adapters.MetricsAdapter
      const metricsAdapter = new Adapters.MetricsAdapter({
        taskStore: this.stores.taskStore,
        cycleStore: this.stores.cycleStore,
        feedbackStore: this.stores.feedbackStore,
        executionStore: this.stores.executionStore,
        actorStore: this.stores.actorStore
      });

      // Create WorkflowMethodologyAdapter
      const workflowMethodologyAdapter = Adapters.WorkflowMethodologyAdapter.createDefault(feedbackAdapter);

      // Create Adapters.BacklogAdapter with all dependencies
      this.backlogAdapter = new Adapters.BacklogAdapter({
        taskStore: this.stores.taskStore,
        cycleStore: this.stores.cycleStore,
        feedbackStore: this.stores.feedbackStore,
        executionStore: this.stores.executionStore,
        changelogStore: this.stores.changelogStore,
        feedbackAdapter,
        executionAdapter,
        changelogAdapter,
        metricsAdapter,
        workflowMethodologyAdapter,
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
  async getIdentityAdapter(): Promise<Adapters.IdentityAdapter> {
    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create EventBus
      const eventBus = new EventBus.EventBus();

      // Create IdentityAdapter with dependencies
      return new Adapters.IdentityAdapter({
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
  async getFeedbackAdapter(): Promise<Adapters.FeedbackAdapter> {
    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create EventBus and IdentityAdapter
      const eventBus = new EventBus.EventBus();
      const identityAdapter = new Adapters.IdentityAdapter({
        actorStore: this.stores.actorStore,
        agentStore: this.stores.agentStore,
        eventBus
      });

      // Create FeedbackAdapter with dependencies
      return new Adapters.FeedbackAdapter({
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
   * Creates and returns Adapters.MetricsAdapter with all required dependencies
   */
  async getMetricsAdapter(): Promise<Adapters.MetricsAdapter> {
    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create Adapters.MetricsAdapter with dependencies
      return new Adapters.MetricsAdapter({
        taskStore: this.stores.taskStore,
        cycleStore: this.stores.cycleStore,
        feedbackStore: this.stores.feedbackStore,
        executionStore: this.stores.executionStore,
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
      const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || Config.ConfigManager.findGitgovRoot() || process.cwd();

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