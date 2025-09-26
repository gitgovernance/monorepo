/**
 * This file was automatically generated from feedback_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for feedback records
 */
export interface FeedbackRecord {
  /**
   * Unique identifier for the feedback entry
   */
  id: string;
  /**
   * The type of entity this feedback refers to
   */
  entityType: 'task' | 'execution' | 'changelog' | 'feedback';
  /**
   * The ID of the entity this feedback refers to
   */
  entityId: string;
  /**
   * The semantic intent of the feedback
   */
  type: 'blocking' | 'suggestion' | 'question' | 'approval' | 'clarification' | 'assignment';
  /**
   * The lifecycle status of the feedback
   */
  status: 'open' | 'acknowledged' | 'resolved' | 'wontfix';
  /**
   * The content of the feedback
   */
  content: string;
  /**
   * The Actor ID of the agent responsible for addressing the feedback
   */
  assignee?: string;
  /**
   * The ID of another feedback record that this one resolves or responds to
   */
  resolvesFeedbackId?: string;
}
