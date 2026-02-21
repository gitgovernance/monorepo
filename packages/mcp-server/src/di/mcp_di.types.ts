import type {
  RecordStore,
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovChangelogRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
  IRecordProjector,
  IConfigManager,
  ISessionManager,
  IAgentRunner,
  ISyncStateModule,
  IIdentityAdapter,
  IBacklogAdapter,
  IFeedbackAdapter,
  IExecutionAdapter,
  IAgentAdapter,
  SourceAuditor,
  WorkflowAdapter,
} from '@gitgov/core';
import type { IFsLintModule } from '@gitgov/core/fs';

/**
 * Configuracion de inicializacion del DI container del MCP server.
 */
export interface McpDiConfig {
  /** Ruta raiz del proyecto (donde esta .gitgov/) */
  projectRoot: string;
}

/**
 * Container con todos los servicios instanciados y listos.
 * All fields use typed interfaces from @gitgov/core.
 */
export interface McpDiContainer {
  stores: {
    tasks: RecordStore<GitGovTaskRecord>;
    cycles: RecordStore<GitGovCycleRecord>;
    feedbacks: RecordStore<GitGovFeedbackRecord>;
    executions: RecordStore<GitGovExecutionRecord>;
    changelogs: RecordStore<GitGovChangelogRecord>;
    actors: RecordStore<GitGovActorRecord>;
    agents: RecordStore<GitGovAgentRecord>;
  };

  backlogAdapter: IBacklogAdapter;
  feedbackAdapter: IFeedbackAdapter;
  executionAdapter: IExecutionAdapter;
  identityAdapter: IIdentityAdapter;
  agentAdapter: IAgentAdapter;
  workflowAdapter: WorkflowAdapter.IWorkflow;

  lintModule: IFsLintModule;
  syncModule: ISyncStateModule;
  sourceAuditorModule: SourceAuditor.SourceAuditorModule;
  agentRunner: IAgentRunner;
  projector: IRecordProjector;

  configManager: IConfigManager;
  sessionManager: ISessionManager;
}
