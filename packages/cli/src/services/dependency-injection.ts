import * as path from 'path';
import { Adapters, Config, Session, Store, EventBus, Lint, Git, Sync, SourceAuditor, PiiDetector, Runner, KeyProvider, Factories } from '@gitgov/core';
import { FsFileLister, findProjectRoot, findGitgovRoot, createSessionManager } from '@gitgov/core/fs';
import type {
  TaskRecord, CycleRecord, FeedbackRecord, ExecutionRecord, ChangelogRecord, ActorRecord, AgentRecord,
  GitGovRecordPayload, CustomRecord, GitGovRecord,
  // Adapter types
  IIndexerAdapter, IndexData, IMetricsAdapter,
  // Lint types
  IFsLintModule, RecordStores as LintRecordStores,
} from '@gitgov/core';
import { RecordStore } from '@gitgov/core';
import { spawn } from 'child_process';

/**
 * Dependency Injection Service for GitGovernance CLI
 * 
 * Creates and manages all adapter instances with proper dependency injection
 * following the established patterns from the core system.
 */
export class DependencyInjectionService {
  private static instance: DependencyInjectionService | null = null;
  private indexerAdapter: IIndexerAdapter | null = null;
  private backlogAdapter: Adapters.BacklogAdapter | null = null;
  private lintModule: IFsLintModule | null = null;
  private syncModule: Sync.SyncModule | null = null;
  private sourceAuditorModule: SourceAuditor.SourceAuditorModule | null = null;
  private agentRunnerModule: Runner.AgentRunnerModule | null = null;
  private configManager: Config.ConfigManager | null = null;
  private sessionManager: Session.SessionManager | null = null;
  private gitModule: Git.GitModule | null = null;
  private keyProvider: KeyProvider.KeyProvider | null = null;
  private projectRoot: string | null = null;
  private stores: {
    taskStore: RecordStore<TaskRecord>;
    cycleStore: RecordStore<CycleRecord>;
    feedbackStore: RecordStore<FeedbackRecord>;
    executionStore: RecordStore<ExecutionRecord>;
    changelogStore: RecordStore<ChangelogRecord>;
    actorStore: RecordStore<ActorRecord>;
    agentStore: RecordStore<AgentRecord>;
  } | null = null;

  /** [EARS-52] Tracks if bootstrap from gitgov-state occurred, requiring reindex */
  private bootstrapOccurred: boolean = false;

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
        // [EARS-52] Bootstrap successful - mark for reindex
        projectRoot = repoRoot;
        this.bootstrapOccurred = true;
      } else {
        // Bootstrap failed - project not initialized
        throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
      }
    }

    // Save projectRoot for other methods
    this.projectRoot = projectRoot;

    this.stores = {
      taskStore: new RecordStore<TaskRecord>('tasks', Factories.loadTaskRecord, projectRoot),
      cycleStore: new RecordStore<CycleRecord>('cycles', Factories.loadCycleRecord, projectRoot),
      feedbackStore: new RecordStore<FeedbackRecord>('feedback', Factories.loadFeedbackRecord, projectRoot),
      executionStore: new RecordStore<ExecutionRecord>('executions', Factories.loadExecutionRecord, projectRoot),
      changelogStore: new RecordStore<ChangelogRecord>('changelogs', Factories.loadChangelogRecord, projectRoot),
      actorStore: new RecordStore<ActorRecord>('actors', Factories.loadActorRecord, projectRoot),
      agentStore: new RecordStore<AgentRecord>('agents', Factories.loadAgentRecord, projectRoot),
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

      // Create FsStore for cache (backend-agnostic abstraction)
      const cacheStore = new Store.FsStore<IndexData>({
        basePath: path.join(this.projectRoot, '.gitgov'),
      });

      this.indexerAdapter = new Adapters.IndexerAdapter({
        metricsAdapter,
        taskStore: this.stores.taskStore,
        cycleStore: this.stores.cycleStore,
        feedbackStore: this.stores.feedbackStore,
        executionStore: this.stores.executionStore,
        changelogStore: this.stores.changelogStore,
        actorStore: this.stores.actorStore,
        cacheStore,
      });

      // [EARS-52] If bootstrap occurred, regenerate index immediately
      // This ensures index.json is up-to-date after restoring .gitgov/ from gitgov-state
      if (this.bootstrapOccurred) {
        try {
          await this.indexerAdapter.generateIndex();
          this.bootstrapOccurred = false; // Reset flag after reindex
        } catch (reindexError) {
          // Non-critical: log warning but don't fail
          console.warn('⚠️  Warning: Failed to regenerate index after bootstrap');
        }
      }

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

      // Create KeyProvider for filesystem-based key storage
      this.keyProvider = new KeyProvider.FsKeyProvider({
        actorsDir: path.join(this.projectRoot!, '.gitgov', 'actors')
      });

      // Create IdentityAdapter with correct dependencies
      const identityAdapter = new Adapters.IdentityAdapter({
        actorStore: this.stores.actorStore,
        agentStore: this.stores.agentStore,
        keyProvider: this.keyProvider,
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

      // Create KeyProvider for filesystem-based key storage
      const keyProvider = new KeyProvider.FsKeyProvider({
        actorsDir: path.join(this.projectRoot!, '.gitgov', 'actors')
      });

      // Create IdentityAdapter with dependencies
      return new Adapters.IdentityAdapter({
        actorStore: this.stores.actorStore,
        agentStore: this.stores.agentStore,
        keyProvider,
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

      // Create EventBus and KeyProvider
      const eventBus = new EventBus.EventBus();
      const keyProvider = new KeyProvider.FsKeyProvider({
        actorsDir: path.join(this.projectRoot!, '.gitgov', 'actors')
      });

      // Create IdentityAdapter
      const identityAdapter = new Adapters.IdentityAdapter({
        actorStore: this.stores.actorStore,
        agentStore: this.stores.agentStore,
        keyProvider,
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
  async getMetricsAdapter(): Promise<IMetricsAdapter> {
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
   * Creates and returns FsLintModule with all required dependencies.
   *
   * Architecture (Store Backends Epic):
   * - LintModule (pure): Core validation logic without I/O
   * - FsLintModule (with I/O): Filesystem wrapper for CLI usage
   */
  async getLintModule(): Promise<IFsLintModule> {
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

      // Create stores object for LintModule
      // RecordStore is compatible with Store<GitGovRecord> interface
      const lintStores = {
        tasks: this.stores.taskStore,
        cycles: this.stores.cycleStore,
        actors: this.stores.actorStore,
        agents: this.stores.agentStore,
        executions: this.stores.executionStore,
        feedbacks: this.stores.feedbackStore,
        changelogs: this.stores.changelogStore,
      } as unknown as LintRecordStores;

      // Create pure LintModule (no I/O)
      const pureLintModule = new Lint.LintModule({
        stores: lintStores,
        indexerAdapter
      });

      // Create FsLintModule (with I/O) wrapping the pure module
      this.lintModule = new Lint.FsLintModule({
        lintModule: pureLintModule,
        stores: lintStores,
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
   * Creates and returns SourceAuditorModule with all required dependencies
   */
  async getSourceAuditorModule(): Promise<SourceAuditor.SourceAuditorModule> {
    if (this.sourceAuditorModule) {
      return this.sourceAuditorModule;
    }

    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create PiiDetectorModule (uses default config)
      const piiDetector = new PiiDetector.PiiDetectorModule();

      // Create WaiverReader with FeedbackAdapter
      const feedbackAdapter = await this.getFeedbackAdapter();
      const waiverReader = new SourceAuditor.WaiverReader(feedbackAdapter);

      // Create FileLister for filesystem access
      const projectRoot = await this.getProjectRoot();
      const fileLister = new FsFileLister({ cwd: projectRoot });

      // Create SourceAuditorModule with dependencies (including FileLister)
      this.sourceAuditorModule = new SourceAuditor.SourceAuditorModule({
        piiDetector,
        waiverReader,
        fileLister,
      });

      return this.sourceAuditorModule;

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize source auditor: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing source auditor.");
    }
  }

  /**
   * Creates and returns WaiverWriter for creating waivers
   */
  async getWaiverWriter(): Promise<SourceAuditor.WaiverWriter> {
    const feedbackAdapter = await this.getFeedbackAdapter();
    return new SourceAuditor.WaiverWriter(feedbackAdapter);
  }

  /**
   * Creates and returns WaiverReader for reading waivers
   */
  async getWaiverReader(): Promise<SourceAuditor.WaiverReader> {
    const feedbackAdapter = await this.getFeedbackAdapter();
    return new SourceAuditor.WaiverReader(feedbackAdapter);
  }

  /**
   * Creates and returns ExecutionAdapter with all required dependencies
   */
  async getExecutionAdapter(): Promise<Adapters.ExecutionAdapter> {
    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create EventBus and KeyProvider
      const eventBus = new EventBus.EventBus();
      const keyProvider = new KeyProvider.FsKeyProvider({
        actorsDir: path.join(this.projectRoot!, '.gitgov', 'actors')
      });

      // Create IdentityAdapter
      const identityAdapter = new Adapters.IdentityAdapter({
        actorStore: this.stores.actorStore,
        agentStore: this.stores.agentStore,
        keyProvider,
        eventBus
      });

      // Create ExecutionAdapter with dependencies
      return new Adapters.ExecutionAdapter({
        executionStore: this.stores.executionStore,
        identity: identityAdapter,
        eventBus
      });

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize execution adapter: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing execution adapter.");
    }
  }

  /**
   * Creates and returns AgentRunnerModule with all required dependencies
   */
  async getAgentRunnerModule(): Promise<Runner.AgentRunnerModule> {
    if (this.agentRunnerModule) {
      return this.agentRunnerModule;
    }

    try {
      await this.initializeStores();
      if (!this.stores || !this.projectRoot) {
        throw new Error("Failed to initialize stores");
      }

      // Get required dependencies
      const executionAdapter = await this.getExecutionAdapter();
      const eventBus = new EventBus.EventBus();

      // Create AgentRunnerModule with dependencies
      this.agentRunnerModule = new Runner.AgentRunnerModule({
        gitgovPath: path.join(this.projectRoot, '.gitgov'),
        projectRoot: this.projectRoot,
        executionAdapter,
        eventBus
      });

      return this.agentRunnerModule;

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize agent runner: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing agent runner.");
    }
  }

  /**
   * Returns the project root path (after initialization)
   */
  async getProjectRoot(): Promise<string> {
    await this.initializeStores();
    if (!this.projectRoot) {
      throw new Error("Project root not initialized");
    }
    return this.projectRoot;
  }

  /**
   * Returns the agent store for listing agents
   */
  async getAgentStore(): Promise<RecordStore<AgentRecord>> {
    await this.initializeStores();
    if (!this.stores) {
      throw new Error("Failed to initialize stores");
    }
    return this.stores.agentStore;
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
      const projectRoot = findProjectRoot();
      if (!projectRoot) {
        throw new Error("Could not find project root");
      }

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
        const root = findGitgovRoot();
        if (!root) {
          throw new Error("Could not find project root");
        }
        this.projectRoot = root;
      }

      // Create ConfigManager instance using factory function
      this.configManager = Config.createConfigManager(this.projectRoot);

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
   * Creates and returns SessionManager instance
   */
  async getSessionManager(): Promise<Session.SessionManager> {
    if (this.sessionManager) {
      return this.sessionManager;
    }

    try {
      if (!this.projectRoot) {
        const root = findGitgovRoot();
        if (!root) {
          throw new Error("Could not find project root");
        }
        this.projectRoot = root;
      }

      this.sessionManager = createSessionManager(this.projectRoot);

      return this.sessionManager;

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize session manager: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing session manager.");
    }
  }

  /**
   * Get the KeyProvider instance (created during store initialization)
   */
  getKeyProvider(): KeyProvider.KeyProvider {
    if (!this.keyProvider) {
      throw new Error("KeyProvider not initialized. Call initializeStores first.");
    }
    return this.keyProvider;
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
        const root = findGitgovRoot();
        if (!root) {
          return false;
        }
        this.projectRoot = root;
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