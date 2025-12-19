import type {
  GdprFinding,
  FindingCategory,
  FindingSeverity,
  DetectorName,
} from "../pii_detector/types";
import type { FeedbackRecord } from "../types";
import type { PiiDetectorModule } from "../pii_detector";

/**
 * Metadata stored in FeedbackRecord for waivers.
 * Uses the generic metadata<T> field of FeedbackRecord.
 */
export interface WaiverMetadata {
  /** SHA256 fingerprint for matching */
  fingerprint: string;
  /** Rule ID (e.g., "PII-001", "SEC-002") */
  ruleId: string;
  /** File path of the original finding */
  file: string;
  /** Line number of the original finding */
  line: number;
  /** Optional expiration date (ISO string) */
  expiresAt?: string;
  /** Optional related TaskRecord ID */
  relatedTaskId?: string;
}

/**
 * Active waiver loaded from FeedbackRecord.
 */
export interface ActiveWaiver {
  /** Fingerprint for matching with findings */
  fingerprint: string;
  /** Original rule ID */
  ruleId: string;
  /** Expiration date (undefined = permanent) */
  expiresAt?: Date;
  /** Original FeedbackRecord with metadata */
  feedback: FeedbackRecord<WaiverMetadata>;
}

/**
 * Interface for loading active waivers.
 */
export interface IWaiverReader {
  /** Loads all active (non-expired) waivers */
  loadActiveWaivers(): Promise<ActiveWaiver[]>;
  /** Checks if a specific fingerprint has an active waiver */
  hasActiveWaiver(fingerprint: string): Promise<boolean>;
}

/**
 * Scope configuration for file selection.
 */
export interface ScopeConfig {
  /** Glob patterns to include */
  include: string[];
  /** Glob patterns to exclude */
  exclude: string[];
}

/**
 * Options for running an audit.
 */
export interface AuditOptions {
  /** File include/exclude configuration */
  scope: ScopeConfig;
  /** Base directory for file scanning (defaults to cwd) */
  baseDir?: string;
}

/**
 * Aggregated summary of findings.
 */
export interface AuditSummary {
  /** Total findings (post-waiver) */
  total: number;
  /** Count by severity */
  bySeverity: Record<FindingSeverity, number>;
  /** Count by category */
  byCategory: Partial<Record<FindingCategory, number>>;
  /** Count by detector */
  byDetector: Record<DetectorName, number>;
}

/**
 * Waiver application status.
 */
export interface WaiverStatus {
  /** Findings with active waiver (excluded from result) */
  acknowledged: number;
  /** New findings without waiver */
  new: number;
}

/**
 * Complete audit result.
 */
export interface AuditResult {
  /** Detected findings (post-waiver) */
  findings: GdprFinding[];
  /** Aggregated summary */
  summary: AuditSummary;
  /** Number of files scanned */
  scannedFiles: number;
  /** Number of lines scanned */
  scannedLines: number;
  /** Duration in milliseconds */
  duration: number;
  /** Detectors used in this scan */
  detectors: DetectorName[];
  /** Waiver status */
  waivers: WaiverStatus;
}

/**
 * Injectable dependencies for SourceAuditorModule.
 * ScopeSelector and ScoringEngine are internal.
 */
export interface SourceAuditorDependencies {
  /** PII/secrets detection module */
  piiDetector: PiiDetectorModule;
  /** Waiver reader for loading active waivers */
  waiverReader: IWaiverReader;
}

/**
 * File reader interface for dependency injection.
 */
export interface IFileReader {
  /** Reads file content as string */
  readFile(path: string): Promise<string>;
  /** Checks if file exists */
  exists(path: string): Promise<boolean>;
}

/**
 * Options for creating a waiver.
 */
export interface CreateWaiverOptions {
  /** Finding to waive */
  finding: GdprFinding;
  /** ExecutionRecord where it was detected */
  executionId: string;
  /** Human-readable justification */
  justification: string;
  /** Optional expiration date (ISO string) */
  expiresAt?: string;
  /** Optional related TaskRecord ID */
  relatedTaskId?: string;
}
