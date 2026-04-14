export * as Adapters from "./adapters/index";
export * as Config from "./config_manager/index";
export * as Session from "./session_manager/index";
export * as Crypto from "./crypto/index";
export * as Factories from "./record_factories/index";
export * as Git from "./git/index";
export * as KeyProvider from "./key_provider/index";
export * as FileLister from "./file_lister/index";
export * as Lint from "./lint/index";
export * as Logger from "./logger/index";
export * as ProjectInitializer from "./project_initializer/index";
export * as Schemas from "./record_schemas/index";
export * as Store from "./record_store/index";
export * as SyncState from "./sync_state/index";
export * as HookHandler from "./hook_handler/index";
// Type system exports
export * as Validation from "./record_validations/index";
export * as Records from "./record_types/index";
export * as EventBus from "./event_bus/index";

// Direct type exports for verbatimModuleSyntax compatibility
export type {
  TaskRecord,
  CycleRecord,
  ActorRecord,
  AgentRecord,
  FeedbackRecord,
  ExecutionRecord,
  WorkflowRecord,
} from "./record_types/index";

// RecordProjection type exports (projection engine)
export type {
  IRecordProjector,
  RecordProjectorDependencies,
  IRecordProjection,
  ProjectionContext,
  IndexData,
  IndexGenerationReport,
  IntegrityReport,
  EnrichedTaskRecord,
  AllRecords,
  DerivedStates,
} from "./record_projection/index";
// RecordMetrics type exports (calculation engine)
export type { IRecordMetrics, RecordMetricsDependencies, SystemStatus, ProductivityMetrics, CollaborationMetrics, TaskHealthReport } from "./record_metrics/index";
export type { IIdentityAdapter } from "./adapters/identity_adapter/index";
export type { IBacklogAdapter } from "./adapters/backlog_adapter/index";
export type { IFeedbackAdapter } from "./adapters/feedback_adapter/index";
export type { IExecutionAdapter } from "./adapters/execution_adapter/index";
export type { IAgentAdapter } from "./adapters/agent_adapter/index";

// SyncState type exports
export type { ISyncStateModule, SyncStatePushResult, SyncStatePullResult, SyncStateResolveResult, AuditStateReport } from "./sync_state/index";

// AgentRunner type exports
export type { IAgentRunner, RunOptions, AgentResponse } from "./agent_runner/index";

// KeyProvider type exports
export type { KeyProvider as IKeyProvider } from "./key_provider/index";
export type { KeyProviderErrorCode, KeyProviderErrorContext } from "./key_provider/index";
export { KeyProviderError } from "./key_provider/index";
// KeyPair type — used by storeKey() in PrismaKeyProvider + createActor() in IdentityAdapter
export type { KeyPair } from "./key_provider/index";

// ECDH transport types — used by identity endpoints (CLI + SaaS)
export type { EcdhKeypair, EcdhEnvelope, EcdhClientHello } from "./crypto/ecdh_transport.types";

// Lint type exports (pure types only - Fs types are in @gitgov/core/fs)
export type { RecordStores, LintOptions, FixReport, LintResult, ValidatorType, LintReport, ILintModule } from "./lint/index";

// Config type exports
export type { IConfigManager, GitGovConfig, AuditState } from "./config_manager/index";

// Session type exports
export type { SyncStatus, ActorState, ISessionManager } from "./session_manager/index";

// HookHandler type exports
export type { HookEvent, HookResult, HookHandlerDependencies, HookEventType, CommandClassification } from "./hook_handler/index";

// EventBus type exports
export type { ActivityEvent } from "./event_bus/index";

// ProjectInitializer type exports
export type { EnvironmentValidation } from "./project_initializer/index";
export type { ProjectInitResult } from "./adapters/project_adapter/index";

// Store type exports
export type { RecordStore, IdEncoder } from "./record_store/index";

// ConfigStore type export (interface only — implementations in @gitgov/core/github and @gitgov/core/fs)
export type { ConfigStore } from "./config_store/index";

// FileLister direct exports (interface + types + errors)
export type { FileLister as IFileLister, FileListOptions, FileStats } from "./file_lister/index";
export { FileListerError } from "./file_lister/index";

// ─── Audit product types (canonical, from @gitgov/core/audit) ────────────────
export type {
  Finding,
  FindingCategory,
  FindingSeverity,
  DetectorName,
  WaiverStatus,
  FindingStatus,
  ScanDisplayStatus,
  PolicyStatus,
  ScanScope,
  FindingHistoryEvent,
  WaiverLifecycleEvent,
  SarifExecutionMetadata,
  PolicyExecutionMetadata,
  GitHubActorMetadata,
  Waiver,
  WaiverMetadata,
  PolicyDecision,
  PolicyRuleResult,
  AuditOrchestrationResult,
  AuditSummary,
  AgentAuditResult,
  ReviewAgentResult,
  Scan,
} from "./audit/index";

// ─── Non-audit type exports (module-specific) ───────────────────────────────
export type { AuditOrchestrationOptions, AuditOrchestratorDeps } from "./audit_orchestrator/index";
export type { RegexRule } from "./finding_detector/index";
export type { IWaiverReader } from "./source_auditor/index";

// Sarif direct type exports
export type {
  GetLineContentFn,
  SarifLog,
  SarifResult,
  SarifResultProperties,
  SarifRunProperties,
} from "./sarif/index";

// ID generator utilities (protocol-valid ID creation)
export { generateTaskId, generateExecutionId, generateFeedbackId, generateCycleId, generateActorId, generateAgentId } from "./utils/id_generator";

// Git direct exports (interface + types + errors)
export type { IGitModule, ExecOptions, ExecResult, GetCommitHistoryOptions, CommitInfo, ChangedFile, CommitAuthor, GitRemoteRef } from "./git/index";
export { GitError, GitCommandError, FileNotFoundError, BranchNotFoundError, BranchAlreadyExistsError, MergeConflictError, parseRemoteUrl } from "./git/index";
export type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovActorRecord,
  GitGovAgentRecord,
  GitGovFeedbackRecord,
  GitGovExecutionRecord,
  GitGovRecord,
  GitGovRecordPayload,
  GitGovRecordType,
  Signature,
  EmbeddedMetadataRecord,
} from "./record_types/index";
export * as DiagramGenerator from "./diagram_generator/index";

// Audit modules
export * as FindingDetector from "./finding_detector/index";
export * as SourceAuditor from "./source_auditor/index";
export * as Sarif from "./sarif/index";

// Agent runner
export * as Runner from "./agent_runner/index";

// Audit orchestrator
export * as AuditOrchestrator from "./audit_orchestrator/index";

// Policy evaluator (stub -- formal implementation in Epic 5)
export * as PolicyEvaluator from "./policy_evaluator/index";

// Redaction module (Epic 6 — L1/L2 finding redaction)
export * as Redaction from "./redaction/index";

// Renamed modules (promoted from adapters/)
export * as RecordProjection from "./record_projection/index";
export * as RecordMetrics from "./record_metrics/index";

// adapters
export * as BacklogAdapter from "./adapters/backlog_adapter/index";
export * as ExecutionAdapter from "./adapters/execution_adapter/index";
export * as FeedbackAdapter from "./adapters/feedback_adapter/index";
export * as IdentityAdapter from "./adapters/identity_adapter/index";
export * as ProjectAdapter from "./adapters/project_adapter/index";
export * as WorkflowAdapter from "./adapters/workflow_adapter/index";
