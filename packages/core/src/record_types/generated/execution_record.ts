/**
 * This file was automatically generated from execution_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for execution log records - the universal event stream.
 */
export interface ExecutionRecord<TMetadata = object> {
  /**
   * Unique identifier for the execution log entry.
   */
  id: string;
  /**
   * ID of the parent task this execution belongs to.
   */
  taskId: string;
  /**
   * Semantic classification of the execution event. Standard types: analysis, progress, blocker, completion, info, correction. Custom types use the 'custom:' prefix (e.g. custom:deployment, custom:rollback). Implementations that encounter an unrecognized custom type must treat it as 'info'.
   *
   */
  type: string;
  /**
   * Human-readable title for the execution (used to generate ID slug).
   */
  title: string;
  /**
   * The tangible, verifiable output or result of the execution. This is the "WHAT" - evidence of work or event summary.
   *
   */
  result: string;
  /**
   * Optional narrative, context and decisions behind the execution. This is the "HOW" and "WHY" - the story behind the result.
   *
   */
  notes?: string;
  /**
   * Optional list of typed references to relevant commits, files, PRs, or external documents. Standard prefixes: commit:, pr:, issue:, file:, url:, task:, exec:.
   *
   */
  references?: string[];
  /**
   * Optional structured data for machine consumption. Use this field for data that needs to be programmatically processed (e.g., audit findings, performance metrics, scan results). Complements result (WHAT) and notes (HOW/WHY) with structured, queryable data.
   *
   */
  metadata?: TMetadata;
}
