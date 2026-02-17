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
 *
 * Adapter types use the concrete classes from @gitgov/core.
 * Due to tsup bundling constraints, some adapter types are inferred
 * from the DI implementation rather than declared with named interfaces.
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

  /**
   * Adapter types use concrete class instances from @gitgov/core.
   * Due to tsup bundling constraints, some adapter interfaces aren't
   * accessible via `import type`. We use Record<string, unknown> here
   * and cast at usage sites.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backlogAdapter: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  feedbackAdapter: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executionAdapter: any;
  identityAdapter: IIdentityAdapter;

  lintModule: IFsLintModule;
  syncModule: ISyncStateModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceAuditorModule: any;
  agentRunner: IAgentRunner;
  projector: IRecordProjector;

  configManager: IConfigManager;
  sessionManager: ISessionManager;
}
