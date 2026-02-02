/**
 * FeedbackAdapter - The Communication Facilitator
 *
 * Public exports for the feedback_adapter module.
 */

// Types
export type {
  IFeedbackAdapter,
  FeedbackAdapterDependencies,
  FeedbackThread,
} from './feedback_adapter.types';

// Implementation
export { FeedbackAdapter } from './feedback_adapter';
