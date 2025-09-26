/**
 * This file was automatically generated from cycle_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for cycle records (sprints, milestones)
 */
export interface CycleRecord {
  /**
   * Unique identifier for the cycle
   */
  id: string;
  /**
   * Human-readable title for the cycle (e.g., 'Sprint 24.08')
   */
  title: string;
  /**
   * The lifecycle status of the cycle
   */
  status: 'planning' | 'active' | 'completed' | 'archived';
  taskIds?: string[];
  /**
   * An optional array of Cycle IDs that are children of this cycle, allowing for hierarchies.
   */
  childCycleIds?: string[];
  /**
   * Optional list of key:value tags for categorization (e.g., 'roadmap:q4', 'team:alpha').
   */
  tags?: string[];
  /**
   * An optional description of the cycle's goals and objectives
   */
  notes?: string;
}
