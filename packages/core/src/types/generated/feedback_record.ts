/**
 * This file was automatically generated from feedback_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for feedback records - structured conversation about work
 */
export interface FeedbackRecord {
  /**
   * Unique identifier for the feedback entry
   */
  id: string;
  /**
   * The type of entity this feedback refers to
   */
  entityType: 'task' | 'execution' | 'changelog' | 'feedback' | 'cycle';
  /**
   * The ID of the entity this feedback refers to.
   * Must match the pattern for its entityType:
   * - task: ^\d{10}-task-[a-z0-9-]{1,50}$
   * - execution: ^\d{10}-exec-[a-z0-9-]{1,50}$
   * - changelog: ^\d{10}-changelog-[a-z0-9-]{1,50}$
   * - feedback: ^\d{10}-feedback-[a-z0-9-]{1,50}$
   * - cycle: ^\d{10}-cycle-[a-z0-9-]{1,50}$
   *
   */
  entityId: string;
  /**
   * The semantic intent of the feedback
   */
  type: 'blocking' | 'suggestion' | 'question' | 'approval' | 'clarification' | 'assignment';
  /**
   * The lifecycle status of the feedback.
   * Note: FeedbackRecords are immutable. To change status, create a new feedback
   * that references this one using entityType: "feedback" and resolvesFeedbackId.
   *
   */
  status: 'open' | 'acknowledged' | 'resolved' | 'wontfix';
  /**
   * The content of the feedback. Reduced from 10000 to 5000 chars for practical use.
   */
  content: string;
  /**
   * Optional. The Actor ID responsible for addressing the feedback (e.g., 'human:maria', 'agent:camilo:cursor')
   */
  assignee?: string;
  /**
   * Optional. The ID of another feedback record that this one resolves or responds to
   */
  resolvesFeedbackId?: string;
}
