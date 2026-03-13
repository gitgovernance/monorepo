import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

import type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
} from '@gitgov/core';
import {
  Adapters,
  RecordProjection,
  RecordMetrics,
  Lint,
  EventBus,
  SourceAuditor,
  FindingDetector,
} from '@gitgov/core';
import type { Git } from '@gitgov/core';

import {
  FsRecordStore,
  DEFAULT_ID_ENCODER,
  createConfigManager,
  createSessionManager,
  FsKeyProvider,
  FsFileLister,
  FsLintModule,
  LocalGitModule,
  FsWorktreeSyncStateModule,
  FsRecordProjection,
  FsAgentRunner,
  getWorktreeBasePath,
} from '@gitgov/core/fs';

import type { McpDiConfig, McpDiContainer } from './mcp_di.types.js';

/**
 * McpDependencyInjectionService — Singleton DI container para el MCP server.
 *
 * Inicializa stores, adapters y modules del core de forma lazy.
 * Resuelve .gitgov/ via worktree path (getWorktreeBasePath).
 */
export class McpDependencyInjectionService {
  private config: McpDiConfig;
  private container: McpDiContainer | null = null;
  private initializing: Promise<McpDiContainer> | null = null;

  constructor(config: McpDiConfig) {
    this.config = config;
  }

  /**
   * [MSRV-B4] Retorna la misma instancia en llamadas subsecuentes (singleton).
   */
  async getContainer(): Promise<McpDiContainer> {
    if (this.container) return this.container;

    // Prevent concurrent initializations
    if (!this.initializing) {
      this.initializing = this.initialize();
    }

    this.container = await this.initializing;
    return this.container;
  }

  private async initialize(): Promise<McpDiContainer> {
    const projectRoot = this.config.projectRoot;
    const worktreeBase = getWorktreeBasePath(projectRoot);
    const gitgovPath = path.join(worktreeBase, '.gitgov');

    // [MSRV-B2] Check if .gitgov/ exists in worktree
    const gitgovExists = await this.directoryExists(gitgovPath);

    if (!gitgovExists) {
      // [MSRV-B3] Worktree not initialized — user must run `gitgov init` or `gitgov sync pull`
      throw new Error(
        'GitGovernance not initialized. Run `gitgov init` or `gitgov sync pull` first.',
      );
    }

    // --- Stores ---
    const stores = {
      tasks: new FsRecordStore<GitGovTaskRecord>({
        basePath: path.join(gitgovPath, 'tasks'),
      }),
      cycles: new FsRecordStore<GitGovCycleRecord>({
        basePath: path.join(gitgovPath, 'cycles'),
      }),
      feedbacks: new FsRecordStore<GitGovFeedbackRecord>({
        basePath: path.join(gitgovPath, 'feedback'),
      }),
      executions: new FsRecordStore<GitGovExecutionRecord>({
        basePath: path.join(gitgovPath, 'executions'),
      }),
      actors: new FsRecordStore<GitGovActorRecord>({
        basePath: path.join(gitgovPath, 'actors'),
        idEncoder: DEFAULT_ID_ENCODER,
      }),
      agents: new FsRecordStore<GitGovAgentRecord>({
        basePath: path.join(gitgovPath, 'agents'),
        idEncoder: DEFAULT_ID_ENCODER,
      }),
    };

    // --- Infrastructure ---
    const eventBus = new EventBus.EventBus();
    const configManager = createConfigManager(worktreeBase);
    const sessionManager = createSessionManager(worktreeBase);
    const keyProvider = new FsKeyProvider({
      keysDir: path.join(gitgovPath, 'keys'),
    });

    // --- Identity (base for all adapters) ---
    const identityAdapter = new Adapters.IdentityAdapter({
      stores: { actors: stores.actors },
      keyProvider,
      sessionManager,
      eventBus,
    });

    // --- Adapters ---
    const feedbackAdapter = new Adapters.FeedbackAdapter({
      stores: { feedbacks: stores.feedbacks },
      identity: identityAdapter,
      eventBus,
    });

    const executionAdapter = new Adapters.ExecutionAdapter({
      stores: { tasks: stores.tasks, executions: stores.executions },
      identity: identityAdapter,
      eventBus,
    });

    const recordMetrics = new RecordMetrics.RecordMetrics({
      stores: {
        tasks: stores.tasks,
        cycles: stores.cycles,
        feedbacks: stores.feedbacks,
        executions: stores.executions,
        actors: stores.actors,
      },
    });

    const workflowAdapter = Adapters.WorkflowAdapter.createDefault(feedbackAdapter);

    const backlogAdapter = new Adapters.BacklogAdapter({
      stores: {
        tasks: stores.tasks,
        cycles: stores.cycles,
        feedbacks: stores.feedbacks,
      },
      feedbackAdapter,
      executionAdapter,
      metricsAdapter: recordMetrics,
      workflowAdapter,
      identity: identityAdapter,
      eventBus,
      configManager,
      sessionManager,
    });

    // --- Projector ---
    const sink = new FsRecordProjection({
      basePath: gitgovPath,
    });

    const projector = new RecordProjection.RecordProjector({
      recordMetrics,
      stores: {
        tasks: stores.tasks,
        cycles: stores.cycles,
        feedbacks: stores.feedbacks,
        executions: stores.executions,
        actors: stores.actors,
      },
      sink,
    });

    // --- Lint ---
    const lintStores = {
      tasks: stores.tasks,
      cycles: stores.cycles,
      actors: stores.actors,
      agents: stores.agents,
      executions: stores.executions,
      feedbacks: stores.feedbacks,
    } as unknown as Lint.RecordStores;

    const pureLintModule = new Lint.LintModule({
      stores: lintStores,
      projector,
    });

    const lintModule = new FsLintModule({
      projectRoot,
      lintModule: pureLintModule,
      stores: lintStores,
      projector,
    });

    // --- Git + Sync ---
    const gitModule = this.createGitModule(projectRoot);

    const syncModule = new FsWorktreeSyncStateModule({
      git: gitModule,
      config: configManager,
      identity: identityAdapter,
      lint: pureLintModule,
      indexer: projector,
    }, { repoRoot: projectRoot });

    // --- Source Auditor ---
    const findingDetector = new FindingDetector.FindingDetectorModule();
    const fileLister = new FsFileLister({ cwd: projectRoot });

    const sourceAuditorModule = new SourceAuditor.SourceAuditorModule({
      findingDetector,
      fileLister,
      gitModule,
    });

    // --- Agent Adapter ---
    const agentAdapter = new Adapters.AgentAdapter({
      stores: { agents: stores.agents },
      identity: identityAdapter,
      keyProvider,
      eventBus,
    });

    // --- Agent Runner ---
    const agentRunner = new FsAgentRunner({
      projectRoot,
      executionAdapter,
      identityAdapter,
      eventBus,
    });

    return {
      stores,
      backlogAdapter,
      feedbackAdapter,
      executionAdapter,
      identityAdapter,
      agentAdapter,
      workflowAdapter,
      lintModule,
      syncModule,
      sourceAuditorModule,
      agentRunner,
      projector,
      configManager,
      sessionManager,
    };
  }

  /**
   * Creates a LocalGitModule with a spawn-based execCommand.
   */
  private createGitModule(repoRoot: string): Git.IGitModule {
    const execCommand = (
      command: string,
      args: string[],
      options?: Git.ExecOptions,
    ): Promise<Git.ExecResult> => {
      return new Promise((resolve) => {
        const cwd = options?.cwd || repoRoot;
        const proc = spawn(command, args, {
          cwd,
          env: { ...process.env, ...options?.env },
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('close', (code: number | null) => {
          resolve({ exitCode: code || 0, stdout, stderr });
        });

        proc.on('error', (error: Error) => {
          resolve({ exitCode: 1, stdout, stderr: error.message });
        });
      });
    };

    return new LocalGitModule({ repoRoot, execCommand });
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}
