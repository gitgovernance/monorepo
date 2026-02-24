/**
 * This file was automatically generated from feedback_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for feedback records — the structured conversation about work.
 */
export type FeedbackRecord = {
  [k: string]: unknown | undefined;
} & {
  /**
   * Unique identifier for the feedback entry (10 timestamp + 1 dash + 8 'feedback' + 1 dash + max 50 slug = 70 max)
   */
  id: string;
  /**
   * The type of entity this feedback refers to.
   */
  entityType: 'actor' | 'agent' | 'task' | 'execution' | 'feedback' | 'cycle' | 'workflow';
  /**
   * The ID of the entity this feedback refers to.
   * Must match the ID pattern for its entityType:
   * - actor: ^(human|agent)(:[a-z0-9-]+)+$
   * - agent: ^agent(:[a-z0-9-]+)+$
   * - task: ^\d{10}-task-[a-z0-9-]{1,50}$
   * - execution: ^\d{10}-exec-[a-z0-9-]{1,50}$
   * - feedback: ^\d{10}-feedback-[a-z0-9-]{1,50}$
   * - cycle: ^\d{10}-cycle-[a-z0-9-]{1,50}$
   * - workflow: ^\d{10}-workflow-[a-z0-9-]{1,50}$
   *
   */
  entityId: string;
  /**
   * The semantic intent of the feedback.
   */
  type: 'blocking' | 'suggestion' | 'question' | 'approval' | 'clarification' | 'assignment';
  /**
   * The lifecycle status of the feedback.
   * FeedbackRecords are immutable. To change status, create a new FeedbackRecord
   * that references this one using entityType: "feedback" and resolvesFeedbackId.
   *
   */
  status: 'open' | 'acknowledged' | 'resolved' | 'wontfix';
  /**
   * The content of the feedback.
   */
  content: string;
  /**
   * Optional. The Actor ID responsible for addressing the feedback (e.g., 'human:maria', 'agent:camilo:cursor').
   */
  assignee?: string;
  /**
   * Optional. The ID of another FeedbackRecord that this one resolves or responds to.
   */
  resolvesFeedbackId?: string;
  /**
   * Optional structured data for machine consumption.
   * Use this field for domain-specific data that needs to be programmatically processed.
   * Common use cases: waiver details (fingerprint, ruleId, file, line), approval context, assignment metadata.
   *
   */
  metadata?: TMetadata;
};
