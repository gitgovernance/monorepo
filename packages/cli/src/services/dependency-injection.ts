import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { Adapters, Config, Session, EventBus, Lint, Git, SourceAuditor, FindingDetector, Runner, KeyProvider, RecordProjection, RecordMetrics } from '@gitgov/core';
import { FsRecordStore, DEFAULT_ID_ENCODER, FsFileLister, FsProjectInitializer, FsLintModule, FsWorktreeSyncStateModule, GitModule, createAgentRunner, createConfigManager, findProjectRoot, createSessionManager, FsRecordProjection } from '@gitgov/core/fs';
import type { IFsLintModule } from '@gitgov/core/fs';
import type {
  GitGovTaskRecord, GitGovCycleRecord, GitGovFeedbackRecord, GitGovExecutionRecord, GitGovChangelogRecord, GitGovActorRecord, GitGovAgentRecord,
  // Module types
  IRecordProjector, IRecordMetrics, IConfigManager, IIdentityAdapter, ISessionManager, IAgentRunner, IKeyProvider,
  ISyncStateModule,
  // Lint types
  RecordStores as LintRecordStores,
  RecordStore,
} from '@gitgov/core';
import { spawn } from 'child_process';

/**
 * Dependency Injection Service for GitGovernance CLI
 * 
 * Creates and manages all adapter instances with proper dependency injection
 * following the established patterns from the core system.
 */
export class DependencyInjectionService {
  private static instance: DependencyInjectionService | null = null;
  private projector: IRecordProjector | null = null;
  private backlogAdapter: Adapters.BacklogAdapter | null = null;
  private lintModule: IFsLintModule | null = null;
  private syncModule: ISyncStateModule | null = null;
  private sourceAuditorModule: SourceAuditor.SourceAuditorModule | null = null;
  private agentRunnerModule: IAgentRunner | null = null;
  private configManager: InstanceType<typeof Config.ConfigManager> | null = null;
  private sessionManager: InstanceType<typeof Session.SessionManager> | null = null;
  private gitModule: Git.IGitModule | null = null;
  private keyProvider: IKeyProvider | null = null;
  private repoRoot: string | null = null;
  private projectRoot: string | null = null;
  private stores: {
    tasks: RecordStore<GitGovTaskRecord>;
    cycles: RecordStore<GitGovCycleRecord>;
    feedbacks: RecordStore<GitGovFeedbackRecord>;
    executions: RecordStore<GitGovExecutionRecord>;
    changelogs: RecordStore<GitGovChangelogRecord>;
    actors: RecordStore<GitGovActorRecord>;
    agents: RecordStore<GitGovAgentRecord>;
  } | null = null;

  /** [EARS-D1] Tracks if bootstrap from gitgov-state occurred, requiring reindex */
  private bootstrapOccurred: boolean = false;

  /**
   * When true, initializeStores() skips .gitgov discovery and bootstrap.
   * Only set via setInitMode() — never via internal projectRoot assignments.
   */
  private initModeEnabled = false;

  private constructor() { }

  /**
   * [EARS-A1] Singleton pattern to ensure single instance across CLI
   */
  static getInstance(): DependencyInjectionService {
    if (!DependencyInjectionService.instance) {
      DependencyInjectionService.instance = new DependencyInjectionService();
    }
    return DependencyInjectionService.instance;
  }

  /** Compute worktree base path from repo root */
  static getWorktreeBasePath(repoRoot: string): string {
    const hash = createHash('sha256').update(repoRoot).digest('hex').slice(0, 12);
    return path.join(os.homedir(), '.gitgov', 'worktrees', hash);
  }

  /**
   * Configure DI for init mode — sets projectRoot to worktree path,
   * bypassing .gitgov discovery and bootstrap.
   * Only called by InitCommand before .gitgov/ exists.
   */
  setInitMode(projectRoot: string): void {
    this.repoRoot = projectRoot;
    this.projectRoot = DependencyInjectionService.getWorktreeBasePath(projectRoot);
    this.initModeEnabled = true;
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
    // [EARS-B4] Return immediately if stores already initialized
    if (this.stores) {
      return;
    }

    let projectRoot: string;

    if (this.initModeEnabled && this.projectRoot) {
      // Init mode: projectRoot pre-set via setInitMode(), skip discovery + bootstrap
      projectRoot = this.projectRoot;
    } else {
      // Normal discovery flow: worktree at ~/.gitgov/worktrees/<hash>/
      const { promises: fsPromises } = await import('fs');

      const gitModule = await this.getGitModule();
      const repoRoot = await gitModule.getRepoRoot();
      const worktreeBasePath = DependencyInjectionService.getWorktreeBasePath(repoRoot);
      const gitgovPath = path.join(worktreeBasePath, '.gitgov');

      // [CLIINT-A1] Check if worktree .gitgov/ exists
      try {
        await fsPromises.access(gitgovPath);
        // Worktree exists with .gitgov
        projectRoot = worktreeBasePath;
      } catch {
        // Bootstrap: create worktree at ~/.gitgov/worktrees/<hash>/
        await this.bootstrapWorktree(gitModule, repoRoot, worktreeBasePath);
        projectRoot = worktreeBasePath;
        this.bootstrapOccurred = true;
      }

      this.repoRoot = repoRoot;
    }

    // Save projectRoot for other methods
    this.projectRoot = projectRoot;

    this.stores = {
      tasks: new FsRecordStore<GitGovTaskRecord>({ basePath: path.join(projectRoot, '.gitgov', 'tasks') }),
      cycles: new FsRecordStore<GitGovCycleRecord>({ basePath: path.join(projectRoot, '.gitgov', 'cycles') }),
      feedbacks: new FsRecordStore<GitGovFeedbackRecord>({ basePath: path.join(projectRoot, '.gitgov', 'feedback') }),
      executions: new FsRecordStore<GitGovExecutionRecord>({ basePath: path.join(projectRoot, '.gitgov', 'executions') }),
      changelogs: new FsRecordStore<GitGovChangelogRecord>({ basePath: path.join(projectRoot, '.gitgov', 'changelogs') }),
      actors: new FsRecordStore<GitGovActorRecord>({ basePath: path.join(projectRoot, '.gitgov', 'actors'), idEncoder: DEFAULT_ID_ENCODER }),
      agents: new FsRecordStore<GitGovAgentRecord>({ basePath: path.join(projectRoot, '.gitgov', 'agents'), idEncoder: DEFAULT_ID_ENCODER }),
    };
  }

  /**
   * [CLIINT-A1] Bootstrap worktree from gitgov-state branch.
   * Creates a git worktree at ~/.gitgov/worktrees/<hash>/ pointing to gitgov-state.
   */
  private async bootstrapWorktree(
    gitModule: Git.IGitModule,
    repoRoot: string,
    worktreeBasePath: string,
  ): Promise<void> {
    const { promises: fsPromises } = await import('fs');

    // Ensure ~/.gitgov/worktrees/ exists
    await fsPromises.mkdir(path.join(os.homedir(), '.gitgov', 'worktrees'), { recursive: true });

    // Check if gitgov-state branch exists locally
    const branchExists = await gitModule.branchExists('gitgov-state');
    if (!branchExists) {
      // Check remote
      const remoteBranches = await gitModule.listRemoteBranches('origin');
      if (remoteBranches.includes('gitgov-state') || remoteBranches.includes('origin/gitgov-state')) {
        // Create local tracking branch
        await gitModule.exec('git', ['branch', 'gitgov-state', 'origin/gitgov-state']);
      } else {
        // Neither exists — not initialized
        throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
      }
    }

    // Create worktree
    await gitModule.exec('git', ['worktree', 'add', worktreeBasePath, 'gitgov-state']);
  }

  /**
   * [EARS-C1] Creates and returns RecordProjector with all required dependencies
   */
  async getRecordProjector(): Promise<IRecordProjector> {
    // [EARS-C8] Return cached instance
    if (this.projector) {
      return this.projector;
    }

    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create RecordMetrics with dependencies
      const recordMetrics = new RecordMetrics.RecordMetrics({
        stores: {
          tasks: this.stores.tasks,
          cycles: this.stores.cycles,
          feedbacks: this.stores.feedbacks,
          executions: this.stores.executions,
          actors: this.stores.actors,
        }
      });

      // Use the projectRoot determined during initializeStores (which includes bootstrap)
      if (!this.projectRoot) {
        throw new Error("Project root not initialized");
      }

      // Create FsRecordProjection for CLI (writes to .gitgov/index.json)
      const sink = new FsRecordProjection({
        basePath: path.join(this.projectRoot, '.gitgov'),
      });

      this.projector = new RecordProjection.RecordProjector({
        recordMetrics,
        stores: {
          tasks: this.stores.tasks,
          cycles: this.stores.cycles,
          feedbacks: this.stores.feedbacks,
          executions: this.stores.executions,
          changelogs: this.stores.changelogs,
          actors: this.stores.actors,
        },
        sink,
      });

      // [EARS-D1, D2] If bootstrap occurred, regenerate index; otherwise skip
      if (this.bootstrapOccurred) {
        try {
          await this.projector.generateIndex();
          // Note: bootstrapOccurred NOT reset — consumer commands (sync pull) check it via wasBootstrapped()
        } catch (reindexError) {
          // Non-critical: log warning but don't fail
          console.warn('⚠️  Warning: Failed to regenerate index after bootstrap');
        }
      }

      return this.projector;

    } catch (error) {
      // [EARS-E1] Project not initialized
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        // [EARS-E2] Cache system error with message
        throw new Error(`❌ Failed to initialize cache system: ${error.message}`);
      }
      // [EARS-E4] Non-Error types
      throw new Error("❌ Unknown error initializing cache system.");
    }
  }

  /**
   * [EARS-C2] Creates and returns Adapters.BacklogAdapter with all required dependencies
   */
  async getBacklogAdapter(): Promise<Adapters.BacklogAdapter> {
    // [EARS-C8] Return cached instance
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
        keysDir: path.join(this.projectRoot!, '.gitgov', 'keys')
      });

      // Create IdentityAdapter with correct dependencies
      const identityAdapter = new Adapters.IdentityAdapter({
        stores: { actors: this.stores.actors },
        keyProvider: this.keyProvider,
        sessionManager: await this.getSessionManager(),
        eventBus,
      });

      // Create other adapters
      const feedbackAdapter = new Adapters.FeedbackAdapter({
        stores: { feedbacks: this.stores.feedbacks },
        identity: identityAdapter,
        eventBus
      });

      const executionAdapter = new Adapters.ExecutionAdapter({
        stores: { tasks: this.stores.tasks, executions: this.stores.executions },
        identity: identityAdapter,
        eventBus
      });

      const changelogAdapter = new Adapters.ChangelogAdapter({
        stores: { changelogs: this.stores.changelogs, tasks: this.stores.tasks, cycles: this.stores.cycles },
        identity: identityAdapter,
        eventBus
      });

      // Create RecordMetrics
      const recordMetrics = new RecordMetrics.RecordMetrics({
        stores: {
          tasks: this.stores.tasks,
          cycles: this.stores.cycles,
          feedbacks: this.stores.feedbacks,
          executions: this.stores.executions,
          actors: this.stores.actors,
        }
      });

      // Create WorkflowAdapter
      const workflowAdapter = Adapters.WorkflowAdapter.createDefault(feedbackAdapter);

      // Get ConfigManager for BacklogAdapter
      const configManager = await this.getConfigManager();

      // Create Adapters.BacklogAdapter with all dependencies
      this.backlogAdapter = new Adapters.BacklogAdapter({
        stores: {
          tasks: this.stores.tasks,
          cycles: this.stores.cycles,
          feedbacks: this.stores.feedbacks,
          changelogs: this.stores.changelogs,
        },
        feedbackAdapter,
        executionAdapter,
        changelogAdapter,
        metricsAdapter: recordMetrics,
        workflowAdapter,
        identity: identityAdapter,
        eventBus,
        configManager,
        sessionManager: await this.getSessionManager(),
      });

      return this.backlogAdapter;

    } catch (error) {
      // [EARS-E1] Project not initialized
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        // [EARS-E3] Backlog system error with message
        throw new Error(`❌ Failed to initialize backlog system: ${error.message}`);
      }
      // [EARS-E4] Non-Error types
      throw new Error("❌ Unknown error initializing backlog system.");
    }
  }

  /**
   * [EARS-C4] Creates and returns IdentityAdapter with all required dependencies
   */
  async getIdentityAdapter(): Promise<InstanceType<typeof Adapters.IdentityAdapter>> {
    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create EventBus
      const eventBus = new EventBus.EventBus();

      // Create KeyProvider for filesystem-based key storage
      const keyProvider = new KeyProvider.FsKeyProvider({
        keysDir: path.join(this.projectRoot!, '.gitgov', 'keys')
      });

      // Create IdentityAdapter with dependencies
      return new Adapters.IdentityAdapter({
        stores: { actors: this.stores.actors },
        keyProvider,
        sessionManager: await this.getSessionManager(),
        eventBus,
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
   * Creates and returns ProjectAdapter with all required dependencies.
   * Used by InitCommand (via setInitMode) and potentially other commands.
   */
  async getProjectAdapter(): Promise<Adapters.ProjectAdapter> {
    await this.initializeStores();
    if (!this.projectRoot) {
      throw new Error("Project root not initialized");
    }

    const identityAdapter = await this.getIdentityAdapter();
    const backlogAdapter = await this.getBacklogAdapter();
    const configManager = await this.getConfigManager();
    const projectInitializer = new FsProjectInitializer(this.projectRoot, this.repoRoot ?? undefined);

    return new Adapters.ProjectAdapter({
      identityAdapter,
      backlogAdapter,
      configManager,
      projectInitializer,
    });
  }

  /**
   * [EARS-C5] Creates and returns FeedbackAdapter with all required dependencies
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
        keysDir: path.join(this.projectRoot!, '.gitgov', 'keys')
      });

      // Create IdentityAdapter
      const identityAdapter = new Adapters.IdentityAdapter({
        stores: { actors: this.stores.actors },
        keyProvider,
        sessionManager: await this.getSessionManager(),
        eventBus,
      });

      // Create FeedbackAdapter with dependencies
      return new Adapters.FeedbackAdapter({
        stores: { feedbacks: this.stores.feedbacks },
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
   * [EARS-C3] Creates and returns RecordMetrics with all required dependencies
   */
  async getRecordMetrics(): Promise<IRecordMetrics> {
    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Create RecordMetrics with dependencies
      return new RecordMetrics.RecordMetrics({
        stores: {
          tasks: this.stores.tasks,
          cycles: this.stores.cycles,
          feedbacks: this.stores.feedbacks,
          executions: this.stores.executions,
          actors: this.stores.actors,
        }
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
   * [EARS-C6] Creates and returns FsLintModule with all required dependencies.
   *
   * Architecture (Store Backends Epic):
   * - LintModule (pure): Core validation logic without I/O
   * - FsLintModule (with I/O): Filesystem wrapper for CLI usage
   */
  async getLintModule(): Promise<IFsLintModule> {
    // [EARS-C8] Return cached instance
    if (this.lintModule) {
      return this.lintModule;
    }

    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      // Get projector for reference validation
      const projector = await this.getRecordProjector();

      // Create stores object for LintModule
      // RecordStore is compatible with Store<GitGovRecord> interface
      const lintStores = {
        tasks: this.stores.tasks,
        cycles: this.stores.cycles,
        actors: this.stores.actors,
        agents: this.stores.agents,
        executions: this.stores.executions,
        feedbacks: this.stores.feedbacks,
        changelogs: this.stores.changelogs,
      } as unknown as LintRecordStores;

      // Create pure LintModule (no I/O)
      const pureLintModule = new Lint.LintModule({
        stores: lintStores,
        projector
      });

      // Create FsLintModule (with I/O) wrapping the pure module
      const fsLint = new FsLintModule({
        lintModule: pureLintModule,
        stores: lintStores,
        projector,
        projectRoot: this.projectRoot!,
      });
      this.lintModule = fsLint;

      return fsLint;

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

      // Create FindingDetectorModule (uses default config)
      const findingDetector = new FindingDetector.FindingDetectorModule();

      // Create WaiverReader with FeedbackAdapter
      const feedbackAdapter = await this.getFeedbackAdapter();
      const waiverReader = new SourceAuditor.WaiverReader(feedbackAdapter);

      // Create FileLister for filesystem access
      const projectRoot = await this.getProjectRoot();
      const fileLister = new FsFileLister({ cwd: projectRoot });

      // Create SourceAuditorModule with dependencies (including FileLister)
      this.sourceAuditorModule = new SourceAuditor.SourceAuditorModule({
        findingDetector,
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
        keysDir: path.join(this.projectRoot!, '.gitgov', 'keys')
      });

      // Create IdentityAdapter
      const identityAdapter = new Adapters.IdentityAdapter({
        stores: { actors: this.stores.actors },
        keyProvider,
        sessionManager: await this.getSessionManager(),
        eventBus,
      });

      // Create ExecutionAdapter with dependencies
      return new Adapters.ExecutionAdapter({
        stores: { tasks: this.stores.tasks, executions: this.stores.executions },
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
   * Creates and returns AgentAdapter with all required dependencies
   */
  async getAgentAdapter(): Promise<Adapters.AgentAdapter> {
    try {
      await this.initializeStores();
      if (!this.stores) {
        throw new Error("Failed to initialize stores");
      }

      const eventBus = new EventBus.EventBus();
      const keyProvider = new KeyProvider.FsKeyProvider({
        keysDir: path.join(this.projectRoot!, '.gitgov', 'keys')
      });

      const identityAdapter = new Adapters.IdentityAdapter({
        stores: { actors: this.stores.actors },
        keyProvider,
        sessionManager: await this.getSessionManager(),
        eventBus,
      });

      return new Adapters.AgentAdapter({
        stores: { agents: this.stores.agents },
        identity: identityAdapter,
        keyProvider,
        eventBus,
      });

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Could not find project root')) {
          throw new Error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        }
        throw new Error(`❌ Failed to initialize agent adapter: ${error.message}`);
      }
      throw new Error("❌ Unknown error initializing agent adapter.");
    }
  }

  /**
   * Creates and returns AgentRunnerModule with all required dependencies
   */
  async getAgentRunnerModule(): Promise<IAgentRunner> {
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
      this.agentRunnerModule = createAgentRunner({
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
   * Returns the project root path (worktree base path, after initialization)
   */
  async getProjectRoot(): Promise<string> {
    await this.initializeStores();
    if (!this.projectRoot) {
      throw new Error("Project root not initialized");
    }
    return this.projectRoot;
  }

  /**
   * Returns the actual git repository root path (after initialization)
   */
  async getRepoRoot(): Promise<string> {
    await this.initializeStores();
    if (!this.repoRoot) {
      throw new Error("Repo root not initialized");
    }
    return this.repoRoot;
  }

  /**
   * Returns the agent store for listing agents
   */
  async getAgentStore(): Promise<RecordStore<GitGovAgentRecord>> {
    await this.initializeStores();
    if (!this.stores) {
      throw new Error("Failed to initialize stores");
    }
    return this.stores.agents;
  }

  /**
   * [EARS-C7] Creates and returns SyncStateModule with all required dependencies
   */
  async getSyncStateModule(): Promise<ISyncStateModule> {
    // [EARS-C8] Return cached instance
    if (this.syncModule) {
      return this.syncModule;
    }

    try {
      const { spawn } = await import('child_process');

      // Initialize stores first (this sets projectRoot via bootstrap if needed)
      await this.initializeStores();

      if (!this.projectRoot) {
        throw new Error("Project root not initialized");
      }

      // Get required dependencies
      const projector = await this.getRecordProjector();
      const configManager = await this.getConfigManager();
      const identityAdapter = await this.getIdentityAdapter();
      const lintModule = await this.getLintModule();

      // Create execCommand function for GitModule — default cwd is repoRoot
      const repoRoot = this.repoRoot || this.projectRoot;
      const execCommand = (command: string, args: string[], options?: Git.ExecOptions) => {
        return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
          const cwd = options?.cwd || repoRoot || process.cwd();
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

      // Create GitModule with execCommand — uses repoRoot for git operations
      const gitModule = new GitModule({
        repoRoot: repoRoot!,
        execCommand
      });

      // [CLIINT-A2] Create FsWorktreeSyncStateModule with repoRoot + worktreePath
      this.syncModule = new FsWorktreeSyncStateModule(
        {
          git: gitModule,
          config: configManager,
          identity: identityAdapter,
          lint: lintModule,
          indexer: projector,
        },
        { repoRoot: repoRoot!, worktreePath: this.projectRoot! },
      );

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
   * Creates and returns GitModule
   */
  async getGitModule(): Promise<Git.IGitModule> {
    // [EARS-C8] Return cached instance
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

      const gm = new GitModule({
        repoRoot: projectRoot,
        execCommand
      });
      this.gitModule = gm;

      return gm;
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

  /**
   * [EARS-C9] Creates and returns ConfigManager instance
   */
  async getConfigManager(): Promise<InstanceType<typeof Config.ConfigManager>> {
    // [EARS-C8] Return cached instance
    if (this.configManager) {
      return this.configManager;
    }

    try {
      // If projectRoot is not set yet, compute worktree path from repo root
      if (!this.projectRoot) {
        const root = findProjectRoot();
        if (!root) {
          throw new Error("Could not find project root");
        }
        this.repoRoot = root;
        this.projectRoot = DependencyInjectionService.getWorktreeBasePath(root);
      }

      // Create ConfigManager instance using factory function
      const cm = createConfigManager(this.projectRoot);
      this.configManager = cm;

      return cm;

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
   * [EARS-C10] Creates and returns SessionManager instance
   */
  async getSessionManager(): Promise<InstanceType<typeof Session.SessionManager>> {
    // [EARS-C8] Return cached instance
    if (this.sessionManager) {
      return this.sessionManager;
    }

    try {
      if (!this.projectRoot) {
        const root = findProjectRoot();
        if (!root) {
          throw new Error("Could not find project root");
        }
        this.repoRoot = root;
        this.projectRoot = DependencyInjectionService.getWorktreeBasePath(root);
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
  getKeyProvider(): IKeyProvider {
    if (!this.keyProvider) {
      throw new Error("KeyProvider not initialized. Call initializeStores first.");
    }
    return this.keyProvider;
  }

  /**
   * [EARS-G1] Expose bootstrap state for consumer commands.
   * Returns true when bootstrap from remote gitgov-state occurred during this process.
   */
  wasBootstrapped(): boolean {
    return this.bootstrapOccurred;
  }

  /**
   * [EARS-A2] Resets the singleton instance (useful for testing)
   */
  static reset(): void {
    DependencyInjectionService.instance = null;
  }

  /**
   * [EARS-F1, F2] Validates that all required dependencies are available
   */
  async validateDependencies(): Promise<boolean> {
    try {
      // [CLIINT-A3] If projectRoot not found, compute worktree path
      if (!this.projectRoot) {
        const root = findProjectRoot();
        if (!root) {
          return false;
        }
        this.repoRoot = root;
        this.projectRoot = DependencyInjectionService.getWorktreeBasePath(root);
      }

      // [CLIINT-A3] Check if worktree .gitgov directory exists
      const { promises: fsPromises } = await import('fs');
      const gitgovPath = path.join(this.projectRoot, '.gitgov');

      try {
        await fsPromises.access(gitgovPath);
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }
}