/**
 * This file was automatically generated from cycle_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for cycle records — strategic grouping of work into sprints, milestones, or roadmaps.
 */
export interface CycleRecord<TMetadata = object> {
  /**
   * Unique identifier for the cycle (10 timestamp + 1 dash + 5 'cycle' + 1 dash + max 50 slug = 67 max).
   */
  id: string;
  /**
   * Human-readable title for the cycle (e.g., 'Sprint 24', 'Auth v2.0', 'Q4 2025').
   */
  title: string;
  /**
   * The lifecycle status of the cycle.
   */
  status: 'planning' | 'active' | 'completed' | 'archived';
  /**
   * Optional array of Task IDs that belong to this cycle. Bidirectional with TaskRecord.cycleIds. Can be empty for container cycles.
   */
  taskIds?: string[];
  /**
   * Optional array of child Cycle IDs for hierarchical composition (e.g., Q1 containing Sprint 1, Sprint 2, Sprint 3).
   */
  childCycleIds?: string[];
  /**
   * Optional list of key:value tags for categorization (e.g., 'roadmap:q4', 'team:alpha', 'okr:growth').
   */
  tags?: string[];
  /**
   * Optional description of the cycle's goals, objectives, and context.
   */
  notes?: string;
  /**
   * Optional structured data for machine consumption.
   * Use this field for domain-specific data that needs to be programmatically processed.
   * Extends the strategic grouping with structured, queryable attributes.
   * Common use cases: epic lifecycle, sprint configuration, OKR tracking, budget allocation.
   *
   */
  metadata?: TMetadata;
}
