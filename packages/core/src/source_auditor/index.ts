// Main module
export { SourceAuditorModule } from "./source_auditor";

// Internal component by convention (constructed here, not injected) — exported for
// testing/extension. ScoringEngine, a pass-through with no EARS, was removed on 2026-09-13.
export { ScopeSelector } from "./scope_selector";
export { WaiverReader } from "./waiver_reader";
export { WaiverWriter } from "./waiver_writer";

// Types
export type {
  // File content types (direct audit mode)
  FileContent,
  AuditContentsInput,
  // Core interfaces
  SourceAuditorDependencies,
  ScopeSelectorDependencies,
  ScopeConfig,
  AuditOptions,
  AuditResult,
  SourceAuditSummary,
  WaiverApplicationCounts,
  WaiverMetadata,
  Waiver,
  CreateWaiverOptions,
  IWaiverReader,
} from "./types";
