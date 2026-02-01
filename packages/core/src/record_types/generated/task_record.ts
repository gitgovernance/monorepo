/**
 * This file was automatically generated from task_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for task records as defined in task_protocol.md
 */
export interface TaskRecord {
  /**
   * Unique identifier for the task (10 timestamp + 1 dash + 4 'task' + 1 dash + max 50 slug = 66 max)
   */
  id: string;
  /**
   * A brief, human-readable title for the task. Used to generate the ID slug.
   */
  title: string;
  /**
   * Optional. The IDs of the strategic cycles this task belongs to. (10 timestamp + 1 dash + 5 'cycle' + 1 dash + max 50 slug = 67 max)
   */
  cycleIds?: string[];
  /**
   * Current state of the task in the institutional flow
   */
  status: 'draft' | 'review' | 'ready' | 'active' | 'done' | 'archived' | 'paused' | 'discarded';
  /**
   * Strategic or tactical priority level
   */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /**
   * Functional, technical or strategic summary of the objective
   */
  description: string;
  /**
   * Optional. List of key:value tags for categorization and role suggestion (e.g., 'skill:react', 'role:agent:developer').
   */
  tags?: string[];
  /**
   * Valid links or files, when mentioned
   */
  references?: string[];
  /**
   * Additional comments, decisions made or added context
   */
  notes?: string;
}
