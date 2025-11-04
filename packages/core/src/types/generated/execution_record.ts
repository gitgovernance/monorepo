/**
 * This file was automatically generated from execution_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for execution log records - the universal event stream
 */
export interface ExecutionRecord {
  /**
   * Unique identifier for the execution log entry (10 timestamp + 1 dash + 4 'exec' + 1 dash + max 50 slug = 66 max)
   */
  id: string;
  /**
   * ID of the parent task this execution belongs to (10 timestamp + 1 dash + 4 'task' + 1 dash + max 50 slug = 66 max)
   */
  taskId: string;
  /**
   * Semantic classification of the execution event
   */
  type: 'analysis' | 'progress' | 'blocker' | 'completion' | 'info' | 'correction';
  /**
   * Human-readable title for the execution (used to generate ID)
   */
  title: string;
  /**
   * The tangible, verifiable output or result of the execution.
   * This is the "WHAT" - evidence of work or event summary.
   *
   */
  result: string;
  /**
   * Optional narrative, context and decisions behind the execution.
   * This is the "HOW" and "WHY" - the story behind the result.
   *
   */
  notes?: string;
  /**
   * Optional list of typed references to relevant commits, files, PRs, or external documents.
   * Should use typed prefixes for clarity and trazabilidad (see execution_protocol_appendix.md):
   * - commit:     Git commit SHA
   * - pr:         Pull Request number
   * - file:       File path (relative to repo root)
   * - url:        External URL
   * - issue:      GitHub Issue number
   * - task:       TaskRecord ID
   * - exec:       ExecutionRecord ID (for corrections or dependencies)
   * - changelog:  ChangelogRecord ID
   *
   */
  references?: string[];
}
