/**
 * Types for the feedback command.
 * Based on feedback_command.md §3.3.
 */

import type { BaseCommandOptions } from '../../interfaces/command';

/** Options for `gitgov feedback` (create — default action) */
export interface FeedbackCreateOptions extends BaseCommandOptions {
  /** Type of entity this feedback targets */
  entityType: FeedbackEntityType;
  /** ID of the entity this feedback is about */
  entityId: string;
  /** Semantic type of feedback */
  type: FeedbackType;
  /** Content/message of the feedback */
  content: string;
}

/** Entity type enum for validation */
export type FeedbackEntityType = 'task' | 'execution' | 'changelog' | 'feedback' | 'cycle';

/** Feedback type enum for validation */
export type FeedbackType = 'blocking' | 'suggestion' | 'question' | 'approval' | 'clarification' | 'assignment';

/** Valid entity types for validation */
export const VALID_ENTITY_TYPES: FeedbackEntityType[] = [
  'task', 'execution', 'changelog', 'feedback', 'cycle'
];

/** Valid feedback types for validation */
export const VALID_FEEDBACK_TYPES: FeedbackType[] = [
  'blocking', 'suggestion', 'question', 'approval', 'clarification', 'assignment'
];
