/**
 * This file was automatically generated from changelog_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for changelog records - aggregates N tasks into 1 release note
 */
export interface ChangelogRecord {
  /**
   * Unique identifier for the changelog entry
   */
  id: string;
  /**
   * Executive title of the deliverable
   */
  title: string;
  /**
   * Detailed description of the value delivered, including key decisions and impact
   */
  description: string;
  /**
   * IDs of tasks that compose this deliverable (minimum 1 required)
   *
   * @minItems 1
   */
  relatedTasks: [string, ...string[]];
  /**
   * Unix timestamp in seconds when the deliverable was completed
   */
  completedAt: number;
  /**
   * Optional IDs of cycles related to this deliverable
   */
  relatedCycles?: string[];
  /**
   * Optional IDs of key execution records related to this work
   */
  relatedExecutions?: string[];
  /**
   * Optional version or release identifier (e.g., 'v1.0.0', 'sprint-24')
   */
  version?: string;
  /**
   * Optional tags for categorization (e.g., 'feature:auth', 'bugfix', 'security')
   */
  tags?: string[];
  /**
   * Optional list of git commit hashes related to this deliverable
   */
  commits?: string[];
  /**
   * Optional list of main files that were created or modified
   */
  files?: string[];
  /**
   * Optional additional context, decisions, or learnings
   */
  notes?: string;
}
