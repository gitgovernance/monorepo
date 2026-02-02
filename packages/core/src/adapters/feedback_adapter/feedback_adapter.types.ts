import type { RecordStores } from '../../record_store/record_store.types';
import type { IdentityAdapter } from '../identity_adapter';
import type { FeedbackRecord } from '../../record_types';
import type { IEventStream } from '../../event_bus';

/**
 * FeedbackAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface FeedbackAdapterDependencies {
  // Data Layer (Protocols)
  stores: Required<Pick<RecordStores, 'feedbacks'>>;

  // Infrastructure Layer
  identity: IdentityAdapter;
  eventBus: IEventStream; // For emitting events
}

/**
 * FeedbackThread structure for conversation trees
 */
export interface FeedbackThread {
  feedback: FeedbackRecord;
  responses: FeedbackThread[];
}

/**
 * FeedbackAdapter Interface - The Communication Facilitator
 */
export interface IFeedbackAdapter {
  /**
   * Creates a new FeedbackRecord.
   */
  create(payload: Partial<FeedbackRecord>, actorId: string): Promise<FeedbackRecord>;

  /**
   * Helper: Creates a new feedback that "resolves" another (immutable pattern).
   */
  resolve(feedbackId: string, actorId: string, content?: string): Promise<FeedbackRecord>;

  /**
   * Gets a specific FeedbackRecord by its ID.
   */
  getFeedback(feedbackId: string): Promise<FeedbackRecord | null>;

  /**
   * Gets all FeedbackRecords for a specific entity.
   */
  getFeedbackByEntity(entityId: string): Promise<FeedbackRecord[]>;

  /**
   * Gets all FeedbackRecords in the system.
   */
  getAllFeedback(): Promise<FeedbackRecord[]>;

  /**
   * Builds the complete conversation tree for a feedback.
   */
  getFeedbackThread(feedbackId: string, maxDepth?: number): Promise<FeedbackThread>;
}
