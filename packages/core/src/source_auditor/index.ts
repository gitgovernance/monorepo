// Main module
export { SourceAuditorModule } from "./source_auditor";

// Internal components (exported for testing/extension)
export { ScopeSelector } from "./scope_selector";
export { ScoringEngine } from "./scoring_engine";
export { WaiverReader } from "./waiver_reader";
export { WaiverWriter } from "./waiver_writer";

// Types
export type {
  // Target and Scope types
  AuditTarget,
  CodeScope,
  JiraScope,
  GitgovScope,
  AuditScope,
  // Output/Display types
  GroupByOption,
  OutputFormat,
  FailOnSeverity,
  // File content types (direct audit mode)
  FileContent,
  AuditContentsInput,
  // Core interfaces
  SourceAuditorDependencies,
  ScopeConfig,
  AuditOptions,
  AuditResult,
  AuditSummary,
  WaiverStatus,
  WaiverMetadata,
  ActiveWaiver,
  CreateWaiverOptions,
  IWaiverReader,
} from "./types";
