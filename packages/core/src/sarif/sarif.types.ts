import type { Finding, FindingCategory, DetectorName } from '../finding_detector/types';

// ─────────────────────────────────────────────────────────────────────────────
// SARIF 2.1.0 structural types
// Based on https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-level SARIF log object.
 * §3.13 sarifLog object
 */
export type SarifLog = {
  /** JSON Schema URL for validation */
  $schema: string;
  /** SARIF version — always "2.1.0" */
  version: '2.1.0';
  /** One or more runs in this log */
  runs: SarifRun[];
};

/**
 * A single tool execution run.
 * §3.14 run object
 */
export type SarifRun = {
  /** Tool that produced the results */
  tool: SarifTool;
  /** Results detected during the run */
  results: SarifResult[];
  /** Describes the tool invocations */
  invocations?: SarifInvocation[];
  /** Custom GitGov properties for the run */
  properties?: SarifRunProperties;
  /** Version control provenance — §3.14.16 */
  versionControlProvenance?: SarifVersionControlDetails[];
};

/**
 * Version control information for the scanned repository.
 * §3.55 versionControlDetails object
 */
export type SarifVersionControlDetails = {
  /** Repository URI (e.g., "https://github.com/org/repo") */
  repositoryUri: string;
  /** Commit hash at time of scan */
  revisionId?: string;
  /** Branch name (e.g., "main", "feature/xyz") */
  branch?: string;
};

/**
 * Tool descriptor.
 * §3.18 tool object
 */
export type SarifTool = {
  /** Primary tool component */
  driver: SarifToolDriver;
};

/**
 * Tool driver (the analysis tool itself).
 * §3.19 toolComponent object
 */
export type SarifToolDriver = {
  /** Tool name (e.g., "gitgov-audit") */
  name: string;
  /** Semantic version (e.g., "2.8.0") */
  version: string;
  /** URI for tool documentation */
  informationUri: string;
  /** Rules detected by this tool */
  rules?: SarifReportingDescriptor[];
};

/**
 * Rule descriptor.
 * §3.49 reportingDescriptor object
 */
export type SarifReportingDescriptor = {
  /** Rule ID (e.g., "PII-001") */
  id: string;
  /** Human-readable rule name */
  name?: string;
  /** Short description */
  shortDescription?: { text: string };
  /** Full description */
  fullDescription?: { text: string };
  /** Help URI */
  helpUri?: string;
};

/**
 * A single analysis result.
 * §3.27 result object
 */
export type SarifResult = {
  /** Rule that produced the result */
  ruleId: string;
  /** Severity level */
  level: SarifLevel;
  /** Human-readable message */
  message: { text: string };
  /** Locations where the result was detected */
  locations: SarifLocation[];
  /**
   * Stable partial fingerprints for deduplication.
   * §3.27.17 partialFingerprints
   * Key: "primaryLocationLineHash/v1", Value: "hexHash:occurrence"
   */
  partialFingerprints?: Record<string, string>;
  /**
   * Fingerprints for result identity.
   * §3.27.16 fingerprints
   * Note: GitGov uses partialFingerprints (primaryLocationLineHash/v1) as primary identity.
   */
  fingerprints?: Record<string, string>;
  /**
   * Suppressions for this result.
   * §3.27.23 suppressions
   */
  suppressions?: SarifSuppression[];
  /**
   * GitGov governance metadata.
   * §3.8 PropertyBag
   */
  properties?: SarifResultProperties;
};

/**
 * SARIF severity levels.
 * §3.27.10 level property
 */
export type SarifLevel = 'error' | 'warning' | 'note' | 'none';

/**
 * Location of a result in source.
 * §3.28 location object
 */
export type SarifLocation = {
  physicalLocation: SarifPhysicalLocation;
};

/**
 * Physical file location.
 * §3.29 physicalLocation object
 */
export type SarifPhysicalLocation = {
  artifactLocation: { uri: string };
  region: SarifRegion;
};

/**
 * Source region.
 * §3.30 region object
 */
export type SarifRegion = {
  /** 1-based line number */
  startLine: number;
  /** 1-based column number (optional) */
  startColumn?: number;
  /** Source code snippet at this region. §3.30.4 */
  snippet?: { text: string };
};

/**
 * A suppression for a result.
 * §3.27.23 suppressions
 */
export type SarifSuppression = {
  /**
   * "inSource": suppression authored in source (e.g., comment).
   * "external": suppression in an external system.
   * For GitGov waivers: always "inSource".
   */
  kind: 'inSource' | 'external';
  /**
   * Current status of the suppression.
   * "accepted": suppression is in effect.
   * "underReview": under review.
   * "rejected": rejected, result is NOT suppressed.
   */
  status: 'accepted' | 'underReview' | 'rejected';
  /** Human-readable justification (maps from FeedbackRecord.content) */
  justification?: string;
  /** GitGov traceability back to the FeedbackRecord */
  properties?: {
    'gitgov/feedbackId': string;
    'gitgov/expiresAt'?: string;
    'gitgov/approvedBy'?: string;
  };
};

/**
 * Tool invocation descriptor.
 * §3.14.11 invocations property
 */
export type SarifInvocation = {
  /** Whether the tool executed successfully */
  executionSuccessful: boolean;
  /** Command line used to invoke the tool */
  commandLine?: string;
  /** ISO 8601 start timestamp */
  startTimeUtc?: string;
  /** ISO 8601 end timestamp */
  endTimeUtc?: string;
  /** Process exit code */
  exitCode?: number;
  /** GitGov correlation properties */
  properties?: {
    'gitgov/executionId'?: string;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// GitGov property bag types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Custom GitGov properties on each result.
 * All fields optional — only populated when available from context.
 */
export type SarifResultProperties = {
  /**
   * Links the finding to the ExecutionRecord that produced it.
   * Source: ExecutionRecord.id
   */
  'gitgov/executionId'?: string;
  /**
   * Task that originated the audit.
   * Source: ExecutionRecord.taskId
   */
  'gitgov/taskId'?: string;
  /**
   * Actor that signed the ExecutionRecord.
   * Source: header.signatures[0].keyId
   */
  'gitgov/actorId'?: string;
  /**
   * Integrity checksum of the ExecutionRecord payload.
   * Source: header.payloadChecksum (SHA256 hex, 64 chars)
   */
  'gitgov/payloadChecksum'?: string;
  /**
   * Protocol version that produced this record.
   * Source: header.version (e.g., "1.1")
   */
  'gitgov/protocolVersion'?: string;
  /** SHA-256 hash of the original snippet (before redaction) */
  'gitgov/snippetHash'?: string;
  /** Semantic category of the finding */
  'gitgov/category': FindingCategory;
  /** Detector that generated the finding */
  'gitgov/detector': DetectorName;
  /** Confidence level 0-1 */
  'gitgov/confidence': number;
  /** Legal reference (e.g., "GDPR Art. 5(1)(f)") */
  'gitgov/legalReference'?: string;
};

/**
 * Custom GitGov properties on the run.
 */
export type SarifRunProperties = {
  /** Policy decision computed after evaluation */
  'gitgov/policyDecision'?: 'pass' | 'block';
  /** Number of Ed25519 signatures in the ExecutionRecord */
  'gitgov/signatureCount'?: number;
  /** Agent that executed the scan */
  'gitgov/agentId'?: string;
  /** Scope of the scan */
  'gitgov/scanScope'?: 'diff' | 'full' | 'baseline';
  /** Number of files scanned */
  'gitgov/scannedFiles'?: number;
  /** Number of lines scanned */
  'gitgov/scannedLines'?: number;
  /** Redaction level applied to findings before SARIF generation. Tag only — builder does not redact */
  'gitgov/redactionLevel'?: RedactionLevel;
};

// ─────────────────────────────────────────────────────────────────────────────
// SarifBuilder input types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callback to retrieve the content of a specific line in a file.
 * Returns null if the file/line is not accessible.
 * Used to compute primaryLocationLineHash.
 */
export type GetLineContentFn = (file: string, line: number) => Promise<string | null>;

/**
 * Context for occurrence tracking within a single file.
 * Maps normalizedLine → count of occurrences seen so far.
 * Used by buildPartialFingerprints() — must be per-file, not shared across files.
 */
export type OccurrenceContext = Map<string, number>;

/**
 * Controls what snippet content is included in SARIF output.
 * "l1": Git level — snippets redacted for sensitive categories (safe for ExecutionRecord in Git)
 * "l2": Projection level — full snippet content included (for SaaS/PostgreSQL)
 */
export type RedactionLevel = 'l1' | 'l2';

/**
 * An active waiver to be mapped to a SARIF suppression.
 * Derived from FeedbackRecord type: "approval".
 * Note: There is no WaiverRecord type — waivers ARE FeedbackRecords.
 */
export type SarifActiveWaiver = {
  /**
   * Fingerprint to match against result.partialFingerprints["primaryLocationLineHash/v1"].
   * This is the primaryLocationLineHash/v1 value (content-based hash).
   */
  fingerprint: string;
  /** FeedbackRecord ID for traceability */
  feedbackId: string;
  /** Waiver justification (from FeedbackRecord.content) */
  content: string;
  /** Expiration date in ISO 8601 (if set) */
  expiresAt?: string;
  /** Actor who approved the waiver */
  approvedBy?: string;
};

/**
 * All inputs to SarifBuilder.build().
 * Uses type (not interface) — data only, no methods.
 */
export type SarifBuilderOptions = {
  // ── Tool info ──────────────────────────────────────────────
  /** Tool name (e.g., "gitgov-audit") */
  toolName: string;
  /** Tool version (e.g., "2.8.0") */
  toolVersion: string;
  /** Tool documentation URI */
  informationUri: string;

  // ── Findings ───────────────────────────────────────────────
  /** Findings to include in SARIF output */
  findings: Finding[];

  // ── GitGov context for result.properties ──────────────────
  /** ExecutionRecord ID */
  executionId?: string;
  /** Task that originated the audit */
  taskId?: string;
  /** Actor ID (from signatures) */
  actorId?: string;
  /** Payload checksum (SHA256 hex) */
  payloadChecksum?: string;
  /** Protocol version */
  protocolVersion?: string;

  // ── GitGov context for run.properties ─────────────────────
  /** Policy decision post-evaluation. Populated by the orchestrator, not by the agent. */
  policyDecision?: 'pass' | 'block';
  /** Number of signatures in ExecutionRecord */
  signatureCount?: number;
  /** Agent that executed */
  agentId?: string;
  /** Scan scope */
  scanScope?: 'diff' | 'full' | 'baseline';
  /** Files scanned */
  scannedFiles?: number;
  /** Lines scanned */
  scannedLines?: number;

  // ── Invocations ────────────────────────────────────────────
  /** Whether the tool executed successfully (default: true) */
  executionSuccessful?: boolean;
  /** ISO 8601 start time */
  startTimeUtc?: string;
  /** ISO 8601 end time */
  endTimeUtc?: string;
  /** CLI command line (e.g., "gitgov audit --output sarif") */
  commandLine?: string;
  /** Process exit code */
  exitCode?: number;

  // ── Suppressions ───────────────────────────────────────────
  /** Active waivers to map to suppressions */
  activeWaivers?: SarifActiveWaiver[];

  // ── Content access ─────────────────────────────────────────
  /**
   * Callback to get line content for primaryLocationLineHash.
   * If undefined or returns null: partialFingerprints omitted for that result.
   */
  getLineContent?: GetLineContentFn;

  // ── Output control ─────────────────────────────────────────
  /** Controls snippet redaction in SARIF output */
  redactionLevel?: RedactionLevel;

  // ── Version control provenance §3.14.16 ───────────────────
  /** Git commit hash for versionControlProvenance */
  commitHash?: string;
  /** Git branch name for versionControlProvenance */
  branch?: string;
  /** Repository URI for versionControlProvenance */
  repositoryUri?: string;
};

/**
 * Result of SARIF validation.
 */
export type ValidationResult = {
  /** Whether the SARIF is valid against the 2.1.0 schema */
  valid: boolean;
  /** Validation errors (if valid: false) */
  errors?: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// SarifBuilder interface — has methods, so uses interface (not type)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds SARIF 2.1.0 logs from GitGovernance findings.
 * Use createSarifBuilder() to get an instance.
 */
export interface SarifBuilder {
  /**
   * Builds a SARIF 2.1.0 log from findings and GitGov context.
   * Pure function — no side effects, no I/O.
   * @param options - Builder inputs
   * @returns SarifLog ready to be serialized
   */
  build(options: SarifBuilderOptions): Promise<SarifLog>;

  /**
   * Validates a SARIF log against the official JSON Schema.
   * @param sarif - Log to validate
   * @returns { valid: true } or { valid: false, errors: [...] }
   */
  validate(sarif: SarifLog): ValidationResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extensibility types (not implemented in v1, designed for future)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strategy for multi-version SARIF support.
 * v1 only supports 2.1.0. This interface enables future 2.X adapters.
 */
export interface SarifVersionStrategy {
  /** Supported SARIF versions */
  readonly supportedVersions: string[];
  /** Default version to produce */
  readonly defaultVersion: string;
  /**
   * Build a SARIF log in a specific version.
   * @param version - Target version (e.g., "2.1.0")
   * @param options - Builder inputs
   */
  build(version: string, options: SarifBuilderOptions): Promise<SarifLog>;
  /**
   * Detect the version of an unknown SARIF object.
   * @param sarif - Unknown SARIF object
   * @returns Version string or "unknown"
   */
  detectVersion(sarif: unknown): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract: SARIF inside ExecutionRecord.metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata format in ExecutionRecord when it contains SARIF.
 * The AgentRunner or orchestrator wraps the SarifLog in this structure.
 *
 * Example:
 *   ExecutionRecord.metadata = { kind: "sarif", version: "2.1.0", data: sarifLog }
 *
 * Consumers:
 * - Projection (epic projection_schema_v2): reads kind === "sarif", decomposes data.runs[0].results → GitgovFinding
 * - Orchestrator (epic audit_orchestration): reads data from each ExecutionRecord to consolidate findings
 * - Policy (epic policy_evaluation): extracts consolidated findings for evaluation
 */
export type SarifExecutionMetadata = {
  /** Discriminator — always "sarif" for SARIF content */
  kind: 'sarif';
  /** SARIF version of the content */
  version: '2.1.0';
  /** Complete SarifLog produced by SarifBuilder.build() */
  data: SarifLog;
  /** Summary for quick queries without deserializing the full SarifLog */
  summary?: {
    total: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
};
