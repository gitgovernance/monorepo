export * as Adapters from "./adapters";
export * as Config from "./config_manager";
export * as Session from "./session_manager";
export * as Crypto from "./crypto";
export * as Factories from "./factories";
export * as Git from "./git";
export * as KeyProvider from "./key_provider";
export * as FileLister from "./file_lister";
export * as Lint from "./lint";
export * as Logger from "./logger";
export * as ProjectInitializer from "./project_initializer";
export * as Schemas from "./schemas";
export * as Store from "./record_store";
export * as SyncState from "./sync_state";
// Type system exports
export * as Validation from "./validation";
export * as Records from "./types";
export * as EventBus from "./event_bus";

// Direct type exports for verbatimModuleSyntax compatibility
export type {
  TaskRecord,
  CycleRecord,
  ActorRecord,
  AgentRecord,
  FeedbackRecord,
  ExecutionRecord,
  ChangelogRecord,
  WorkflowRecord,
} from "./types";

// Adapter type exports (for CLI usage without namespace confusion)
export type {
  IIndexerAdapter,
  IndexerAdapterDependencies,
  IndexData,
  IndexGenerationReport,
  IntegrityReport,
  EnrichedTaskRecord,
  AllRecords,
  DerivedStates,
} from "./adapters/indexer_adapter";
export type { IMetricsAdapter, SystemStatus, ProductivityMetrics, CollaborationMetrics, TaskHealthReport } from "./adapters/metrics_adapter";
export type { IIdentityAdapter } from "./adapters/identity_adapter";

// SyncState type exports
export type { ISyncStateModule, SyncStatePushResult, SyncStatePullResult, SyncStateResolveResult, AuditStateReport } from "./sync_state";

// AgentRunner type exports
export type { IAgentRunner, RunOptions, AgentResponse } from "./agent_runner";

// KeyProvider type exports
export type { KeyProvider as IKeyProvider } from "./key_provider";

// Lint type exports (pure types only - Fs types are in @gitgov/core/fs)
export type { RecordStores, LintOptions, FixReport, LintResult, ValidatorType, LintReport, ILintModule } from "./lint";

// Config type exports
export type { IConfigManager, GitGovConfig, AuditState } from "./config_manager";

// Session type exports
export type { SyncStatus, ActorState, ISessionManager } from "./session_manager";

// EventBus type exports
export type { ActivityEvent } from "./event_bus";

// ProjectInitializer type exports
export type { EnvironmentValidation } from "./project_initializer";
export type { ProjectInitResult } from "./adapters/project_adapter";

// Store type exports
export type { RecordStore } from "./record_store";
export type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovChangelogRecord,
  GitGovRecord,
  GitGovRecordPayload,
  GitGovRecordType,
  Signature,
  EmbeddedMetadataRecord,
  CustomRecord,
} from "./types";
export * as DiagramGenerator from "./diagram_generator";

// Audit modules
export * as FindingDetector from "./finding_detector";
export * as SourceAuditor from "./source_auditor";

// Agent runner
export * as Runner from "./agent_runner";

// adapters
export * as BacklogAdapter from "./adapters/backlog_adapter";
export * as ChangelogAdapter from "./adapters/changelog_adapter";
export * as ExecutionAdapter from "./adapters/execution_adapter";
export * as FeedbackAdapter from "./adapters/feedback_adapter";
export * as IdentityAdapter from "./adapters/identity_adapter";
export * as IndexerAdapter from "./adapters/indexer_adapter";
export * as MetricsAdapter from "./adapters/metrics_adapter";
export * as ProjectAdapter from "./adapters/project_adapter";
export * as WorkflowAdapter from "./adapters/workflow_adapter";
