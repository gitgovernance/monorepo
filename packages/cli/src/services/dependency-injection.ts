import * as path from 'path';
import { Adapters, Config, Records, Store, EventBus, Lint, Git, Sync } from '@gitgov/core';
import { spawn } from 'child_process';

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
  private lintModule: Lint.LintModule | null = null;
  private syncModule: Sync.SyncModule | null = null;
  private configManager: Config.ConfigManager | null = null;
  private gitModule: Git.GitModule | null = null;
  private projectRoot: string | null = null;
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
   * 
   * Bootstrap flow:
   * 1. Try to find .gitgov/ directory
   * 2. If not found, check if gitgov-state branch exists
   * 3. If branch exists, checkout .gitgov/ from it (bootstrap)
   * 4. If neither exists, throw error (not initialized)
   */
  private async initializeStores(): Promise<void> {
    if (this.stores) {
      return; // Already initialized
    }

    const { promises: fs } = await import('fs');
    const { Factories } = await import('@gitgov/core');

    // Get git module for potential bootstrap
    const gitModule = await this.getGitModule();
    const repoRoot = await gitModule.getRepoRoot();
    const gitgovPath = path.join(repoRoot, '.gitgov');

    // Check if .gitgov/ exists in filesystem
    let projectRoot: string;
    try {
      await fs.access(gitgovPath);
      // .gitgov/ exists, use it
      projectRoot = repoRoot;
    } catch {
      // .gitgov/ doesn't exist in filesystem
      // Try bootstrap from gitgov-state using SyncModule static method (core logic)
      const bootstrapResult = await Sync.SyncModule.bootstrapFromStateBranch(gitModule);

      if (bootstrapResult.success) {
        // Bootstrap successful
        projectRoot = repoRoot;
      } else {
        // Bootstrap failed - project not initialized
        throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
      }
    }

    // Save projectRoot for other methods
    this.projectRoot = projectRoot;

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
      // Use the projectRoot determined during initializeStores (which includes bootstrap)
      if (!this.projectRoot) {
        throw new Error("Project root not initialized");
      }
      const absoluteCachePath = path.join(this.projectRoot, '.gitgov', 'index.json');

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

      // Get ConfigManager for BacklogAdapter
      const configManager = await this.getConfigManager();

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
        eventBus,
        configManager
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
   * Creates and returns LintModule with all required dependencies
   */
  async getLintModule(): Promise<Lint.LintModule> {
    if (this.lintModule) {
      return this.lintModule;
    }

    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Get indexer adapter for reference validation
      const indexerAdapter = await this.getIndexerAdapter();

      // Use taskStore for lint validation
      // The LintModule needs to read all record types, and any store works since they all inherit from RecordStore
      // We cast to the expected type (StorablePayload) which excludes CustomRecord
      if (!this.stores) {
        throw new Error("Stores not initialized");
      }

      // Cast taskStore to the expected type for LintModule
      // StorablePayload = Exclude<GitGovRecordPayload, CustomRecord>
      type StorablePayload = Exclude<Records.GitGovRecordPayload, Records.CustomRecord>;
      const lintRecordStore = this.stores.taskStore as unknown as Store.RecordStore<StorablePayload>;

      // Create LintModule with dependencies
      this.lintModule = new Lint.LintModule({
        recordStore: lintRecordStore,
        indexerAdapter
      });

      return this.lintModule;

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize lint system: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing lint system.");
    }
  }

  /**
   * Creates and returns SyncModule with all required dependencies
   */
  async getSyncModule(): Promise<Sync.SyncModule> {
    if (this.syncModule) {
      return this.syncModule;
    }

    try {
      // Import modules from namespaces
      const { Sync, Git } = await import('@gitgov/core');
      const { spawn } = await import('child_process');

      // Initialize stores first (this sets projectRoot via bootstrap if needed)
      await this.initializeStores();

      if (!this.projectRoot) {
        throw new Error("Project root not initialized");
      }

      // Get required dependencies
      const indexerAdapter = await this.getIndexerAdapter();
      const configManager = await this.getConfigManager();
      const identityAdapter = await this.getIdentityAdapter();
      const lintModule = await this.getLintModule();

      // Create execCommand function for GitModule
      const execCommand = (command: string, args: string[], options?: Git.ExecOptions) => {
        return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
          const cwd = options?.cwd || this.projectRoot || process.cwd();
          const proc = spawn(command, args, {
            cwd,
            env: { ...process.env, ...options?.env },
          });

          let stdout = '';
          let stderr = '';

          proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
          proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

          proc.on('close', (code: number | null) => {
            resolve({ exitCode: code || 0, stdout, stderr });
          });

          proc.on('error', (error: Error) => {
            resolve({ exitCode: 1, stdout, stderr: error.message });
          });
        });
      };

      // Create GitModule with execCommand
      const gitModule = new Git.GitModule({
        repoRoot: this.projectRoot,
        execCommand
      });

      // Create SyncModule with all dependencies
      this.syncModule = new Sync.SyncModule({
        git: gitModule,
        config: configManager,
        identity: identityAdapter,
        lint: lintModule,
        indexer: indexerAdapter
      });

      return this.syncModule;

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize sync module: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing sync module.");
    }
  }

  /**
   * Creates and returns ConfigManager instance
   */
  /**
   * Creates and returns GitModule
   */
  async getGitModule(): Promise<Git.GitModule> {
    if (this.gitModule) {
      return this.gitModule;
    }

    try {
      const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || Config.ConfigManager.findProjectRoot() || process.cwd();

      // Create execCommand function for GitModule
      const execCommand = (command: string, args: string[], options?: Git.ExecOptions) => {
        return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
          const cwd = options?.cwd || this.projectRoot || process.cwd();
          const proc = spawn(command, args, {
            cwd,
            env: { ...process.env, ...options?.env },
          });

          let stdout = '';
          let stderr = '';

          proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
          proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

          proc.on('close', (code: number | null) => {
            resolve({ exitCode: code || 0, stdout, stderr });
          });

          proc.on('error', (error: Error) => {
            resolve({ exitCode: 1, stdout, stderr: error.message });
          });
        });
      };

      this.gitModule = new Git.GitModule({
        repoRoot: projectRoot,
        execCommand
      });

      return this.gitModule;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize Git module: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing Git module.");
    }
  }

  async getConfigManager(): Promise<Config.ConfigManager> {
    if (this.configManager) {
      return this.configManager;
    }

    try {
      // If projectRoot is not set yet, try to find it (this can happen when getConfigManager is called before initializeStores)
      if (!this.projectRoot) {
        this.projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || Config.ConfigManager.findGitgovRoot() || process.cwd();
      }

      // Create ConfigManager instance
      this.configManager = new Config.ConfigManager(this.projectRoot);

      return this.configManager;

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize config manager: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing config manager.");
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
      // If projectRoot is not set yet, try to find it
      if (!this.projectRoot) {
        this.projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || Config.ConfigManager.findGitgovRoot() || process.cwd();
      }

      // Check if .gitgov directory exists
      const { promises: fs } = await import('fs');
      const gitgovPath = `${this.projectRoot}/.gitgov`;

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