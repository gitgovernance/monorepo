import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

import type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovChangelogRecord,
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
  FsSyncStateModule,
  FsRecordProjection,
  FsAgentRunner,
} from '@gitgov/core/fs';

import type { McpDiConfig, McpDiContainer } from './mcp_di.types.js';

/**
 * McpDependencyInjectionService — Singleton DI container para el MCP server.
 *
 * Inicializa stores, adapters y modules del core de forma lazy.
 * Si .gitgov/ no existe, intenta bootstrap desde gitgov-state branch.
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
    const gitgovPath = path.join(projectRoot, '.gitgov');

    // [MSRV-B2] Check if .gitgov/ exists
    const gitgovExists = await this.directoryExists(gitgovPath);

    if (!gitgovExists) {
      // [MSRV-B2] Try bootstrap from gitgov-state branch
      const gitModule = this.createGitModule(projectRoot);
      const bootstrapResult = await FsSyncStateModule.bootstrapFromStateBranch(gitModule);

      if (!bootstrapResult.success) {
        // [MSRV-B3] Neither .gitgov/ nor gitgov-state exist
        throw new Error(
          'GitGovernance not initialized. .gitgov/ directory not found and bootstrap from gitgov-state branch failed.',
        );
      }
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
      changelogs: new FsRecordStore<GitGovChangelogRecord>({
        basePath: path.join(gitgovPath, 'changelogs'),
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
    const configManager = createConfigManager(projectRoot);
    const sessionManager = createSessionManager(projectRoot);
    const keyProvider = new FsKeyProvider({
      actorsDir: path.join(gitgovPath, 'actors'),
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

    const changelogAdapter = new Adapters.ChangelogAdapter({
      stores: {
        changelogs: stores.changelogs,
        tasks: stores.tasks,
        cycles: stores.cycles,
      },
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
        changelogs: stores.changelogs,
      },
      feedbackAdapter,
      executionAdapter,
      changelogAdapter,
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
        changelogs: stores.changelogs,
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
      changelogs: stores.changelogs,
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

    const syncModule = new FsSyncStateModule({
      git: gitModule,
      config: configManager,
      identity: identityAdapter,
      lint: pureLintModule,
      indexer: projector,
    });

    // --- Source Auditor ---
    const findingDetector = new FindingDetector.FindingDetectorModule();
    const fileLister = new FsFileLister({ cwd: projectRoot });

    const sourceAuditorModule = new SourceAuditor.SourceAuditorModule({
      findingDetector,
      fileLister,
      gitModule,
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
