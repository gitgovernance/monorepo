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
   * Classifies what happened in this execution event. Primitive types cover the fundamental kinds of events that occur during any collaborative work. Extend with 'custom:' for your domain.
   * Primitive types:
   *   - analysis: Investigation, research, or evaluation before acting.
   *   - decision: A choice that changes the direction of work.
   *   - progress: Incremental advancement of work.
   *   - blocker: An impediment preventing further progress.
   *   - completion: Work on the task is finished.
   *   - correction: A fix to something previously done incorrectly.
   *   - info: Informational note or status update.
   *
   * Custom types use the 'custom:' prefix for industry-specific extensions. Software development examples:
   *   - custom:review (code review, design review, QA)
   *   - custom:deployment (deploy to staging/production)
   *   - custom:rollback (revert a deployment or change)
   *   - custom:release (version release, PR merge to main)
   *   - custom:hotfix (emergency fix in production)
   * Implementations that encounter an unrecognized custom type MUST treat it as 'info' for display purposes.
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
