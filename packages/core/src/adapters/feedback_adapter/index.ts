import { createFeedbackRecord } from '../../factories/feedback_factory';
import type { RecordStores } from '../../record_store/record_store.types';
import { IdentityAdapter } from '../identity_adapter';
import type { FeedbackRecord, GitGovFeedbackRecord } from '../../types';
import type { IEventStream, FeedbackCreatedEvent } from '../../event_bus';

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
 * FeedbackAdapter Interface - The Communication Facilitator
 */
/**
 * FeedbackThread structure for conversation trees
 */
export interface FeedbackThread {
  feedback: FeedbackRecord;
  responses: FeedbackThread[];
}

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

/**
 * FeedbackAdapter - The Communication Facilitator
 * 
 * Implements Facade + Dependency Injection Pattern for testeable and configurable orchestration.
 * Acts as Mediator between structured communication and data stores.
 */
export class FeedbackAdapter implements IFeedbackAdapter {
  private stores: Required<Pick<RecordStores, 'feedbacks'>>;
  private identity: IdentityAdapter;
  private eventBus: IEventStream;

  constructor(dependencies: FeedbackAdapterDependencies) {
    this.stores = dependencies.stores;
    this.identity = dependencies.identity;
    this.eventBus = dependencies.eventBus;
  }

  /**
   * [EARS-A1] Creates a new FeedbackRecord for structured communication between actors.
   *
   * Description: Creates a new FeedbackRecord for structured communication between actors.
   * Implementation: Builds record with status: "open", signs with actorId, persists and emits event.
   * Usage: Invoked by `gitgov feedback create` to create feedback, assignments, blocks, responses.
   * Returns: Complete and signed FeedbackRecord.
   */
  async create(payload: Partial<FeedbackRecord>, actorId: string): Promise<FeedbackRecord> {
    // Input validation - Type-safe approach
    const payloadWithEntityId = payload as Partial<FeedbackRecord> & { entityId?: string; entityType?: string };
    if (!payloadWithEntityId.entityId) {
      throw new Error('RecordNotFoundError: entityId is required');
    }

    if (payloadWithEntityId.entityType && !['task', 'execution', 'changelog', 'feedback', 'cycle'].includes(payloadWithEntityId.entityType)) {
      throw new Error('InvalidEntityTypeError: entityType must be task, execution, changelog, feedback, or cycle');
    }

    // Validate no duplicate assignments: a task can be assigned to multiple actors,
    // but the same task cannot have multiple open assignments to the same actor
    // EARS-36: In immutable pattern, assignments stay 'open' forever. Check for resolution via resolvesFeedbackId
    if (payload.type === 'assignment' && payload.assignee) {
      const existingFeedbacks = await this.getFeedbackByEntity(payloadWithEntityId.entityId);

      // Find all open assignments for this actor
      const openAssignments = existingFeedbacks.filter(feedback =>
        feedback.type === 'assignment' &&
        feedback.assignee === payload.assignee &&
        feedback.status === 'open'
      );

      if (openAssignments.length > 0) {
        // For each open assignment, check if it has been resolved
        // Resolution feedbacks have entityType='feedback' and resolvesFeedbackId pointing to the assignment
        // They are NOT in the same entity list, so we need to search all feedbacks
        const allFeedbacks = await this.getAllFeedback();

        for (const assignment of openAssignments) {
          const hasResolution = allFeedbacks.some(feedback =>
            feedback.entityType === 'feedback' &&
            feedback.resolvesFeedbackId === assignment.id &&
            feedback.status === 'resolved'
          );

          if (!hasResolution) {
            // Open assignment WITHOUT resolution = duplicate
            throw new Error(`DuplicateAssignmentError: Task ${payloadWithEntityId.entityId} is already assigned to ${payload.assignee} (feedback: ${assignment.id})`);
          }
        }
      }
    }

    // Set default status to "open" (can be overridden by payload.status)
    const enrichedPayload = {
      status: 'open' as const,
      ...payload  // Allows payload.status to override default
    };

    try {
      // 1. Build the record with factory
      const validatedPayload = createFeedbackRecord(enrichedPayload);

      // 2. Create unsigned record structure
      const unsignedRecord: GitGovFeedbackRecord = {
        header: {
          version: '1.0',
          type: 'feedback',
          payloadChecksum: 'will-be-calculated-by-signRecord',
          signatures: [{
            keyId: actorId,
            role: 'author',
            notes: 'Feedback created',
            signature: 'placeholder',
            timestamp: Date.now()
          }]
        },
        payload: validatedPayload,
      };

      // 3. Sign the record
      const signedRecord = await this.identity.signRecord(unsignedRecord, actorId, 'author', 'Feedback record created');

      // 4. Persist the record
      await this.stores.feedbacks.put(signedRecord.payload.id, signedRecord);

      // 5. Emit event - responsibility ends here
      this.eventBus.publish({
        type: 'feedback.created',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: validatedPayload.id,
          entityType: validatedPayload.entityType,
          entityId: validatedPayload.entityId,
          type: validatedPayload.type,
          status: validatedPayload.status,
          content: validatedPayload.content,
          triggeredBy: actorId,
          assignee: validatedPayload.assignee,
          resolvesFeedbackId: validatedPayload.resolvesFeedbackId
        },
      } as FeedbackCreatedEvent);

      return validatedPayload;
    } catch (error) {
      if (error instanceof Error && error.message.includes('DetailedValidationError')) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * [EARS-B1] Helper: Creates a new feedback that "resolves" another (immutable).
   *
   * Description: Helper method that creates a new feedback documenting resolution of another feedback.
   * Implementation: Verifies original exists, then delegates to create() with immutable pattern.
   * Usage: Ergonomic helper for common case. For advanced cases (wontfix, approval), use create() directly.
   * Returns: New FeedbackRecord that points to the original with resolvesFeedbackId.
   */
  async resolve(feedbackId: string, actorId: string, content?: string): Promise<FeedbackRecord> {
    // 1. Verify the original feedback exists
    const originalFeedback = await this.getFeedback(feedbackId);
    if (!originalFeedback) {
      throw new Error(`RecordNotFoundError: Feedback not found: ${feedbackId}`);
    }

    // 2. Generate default content if not provided
    const resolveContent = content || `Feedback resolved by ${actorId}`;

    // 3. Create NEW feedback that points to the original (immutable pattern)
    // This maintains full immutability - original feedback is never modified
    return await this.create({
      entityType: 'feedback',
      entityId: feedbackId,
      type: 'clarification',
      status: 'resolved',
      content: resolveContent,
      resolvesFeedbackId: feedbackId
    }, actorId);
  }

  /**
   * [EARS-C1] Gets a specific FeedbackRecord by its ID for query.
   *
   * Description: Gets a specific FeedbackRecord by its ID for query.
   * Implementation: Direct read from record store without modifications.
   * Usage: Invoked by `gitgov feedback show` to display feedback details.
   * Returns: FeedbackRecord found or null if it doesn't exist.
   */
  async getFeedback(feedbackId: string): Promise<FeedbackRecord | null> {
    const record = await this.stores.feedbacks.get(feedbackId);
    return record ? record.payload : null;
  }

  /**
   * [EARS-D1] Gets all FeedbackRecords associated with a specific entity.
   *
   * Description: Gets all FeedbackRecords associated with a specific entity.
   * Implementation: Reads all records and filters by matching entityId.
   * Usage: Invoked by `gitgov feedback list` to display feedback for a task/cycle/execution.
   * Returns: Array of FeedbackRecords filtered for the entity.
   */
  async getFeedbackByEntity(entityId: string): Promise<FeedbackRecord[]> {
    const ids = await this.stores.feedbacks.list();
    const feedbacks: FeedbackRecord[] = [];

    for (const id of ids) {
      const record = await this.stores.feedbacks.get(id);
      if (record && record.payload.entityId === entityId) {
        feedbacks.push(record.payload);
      }
    }

    return feedbacks;
  }

  /**
   * [EARS-E1] Gets all FeedbackRecords in the system for indexation.
   *
   * Description: Gets all FeedbackRecords in the system for complete indexation.
   * Implementation: Complete read from record store without filters.
   * Usage: Invoked by `gitgov feedback list` and by MetricsAdapter for calculations.
   * Returns: Complete array of all FeedbackRecords.
   */
  async getAllFeedback(): Promise<FeedbackRecord[]> {
    const ids = await this.stores.feedbacks.list();
    const feedbacks: FeedbackRecord[] = [];

    for (const id of ids) {
      const record = await this.stores.feedbacks.get(id);
      if (record) {
        feedbacks.push(record.payload);
      }
    }

    return feedbacks;
  }

  /**
   * [EARS-F1] Builds the complete conversation tree for a feedback.
   *
   * Description: Recursively constructs the conversation tree for a feedback.
   * Implementation: Reads root feedback, finds all responses, builds tree recursively until maxDepth.
   * Usage: Invoked by `gitgov feedback thread` and `gitgov feedback show --thread`.
   * Returns: FeedbackThread object with tree structure.
   */
  async getFeedbackThread(feedbackId: string, maxDepth: number = Infinity): Promise<FeedbackThread> {
    return await this.buildThread(feedbackId, maxDepth, 0);
  }

  /**
   * Private helper: Recursively builds conversation thread.
   */
  private async buildThread(
    feedbackId: string,
    maxDepth: number,
    currentDepth: number
  ): Promise<FeedbackThread> {
    // 1. Depth limit reached
    if (currentDepth >= maxDepth) {
      throw new Error(`Max depth ${maxDepth} reached for feedback thread`);
    }

    // 2. Get root feedback
    const feedback = await this.getFeedback(feedbackId);
    if (!feedback) {
      throw new Error(`RecordNotFoundError: Feedback not found: ${feedbackId}`);
    }

    // 3. Find all responses (feedbacks pointing to this one)
    const allFeedbacks = await this.getAllFeedback();
    const responses = allFeedbacks.filter(
      f => f.entityType === 'feedback' && f.entityId === feedbackId
    );

    // 4. Build tree recursively
    const responseThreads: FeedbackThread[] = [];
    for (const response of responses) {
      try {
        const thread = await this.buildThread(response.id, maxDepth, currentDepth + 1);
        responseThreads.push(thread);
      } catch (error) {
        // If depth limit reached, just skip this branch
        if (error instanceof Error && error.message.includes('Max depth')) {
          continue;
        }
        throw error;
      }
    }

    return {
      feedback,
      responses: responseThreads
    };
  }
}
