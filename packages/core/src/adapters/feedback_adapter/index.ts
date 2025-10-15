import { createFeedbackRecord } from '../../factories/feedback_factory';
import { RecordStore } from '../../store';
import { IdentityAdapter } from '../identity_adapter';
import type { FeedbackRecord } from '../../types';
import type { IEventStream, FeedbackCreatedEvent, FeedbackStatusChangedEvent } from '../../event_bus';
import type { GitGovRecord } from '../../types';

/**
 * FeedbackAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface FeedbackAdapterDependencies {
  // Data Layer (Protocols)
  feedbackStore: RecordStore<FeedbackRecord>;

  // Infrastructure Layer
  identity: IdentityAdapter;
  eventBus: IEventStream; // For emitting events
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
   * Resolves an existing FeedbackRecord.
   */
  resolve(feedbackId: string, actorId: string): Promise<FeedbackRecord>;

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
}

/**
 * FeedbackAdapter - The Communication Facilitator
 * 
 * Implements Facade + Dependency Injection Pattern for testeable and configurable orchestration.
 * Acts as Mediator between structured communication and data stores.
 */
export class FeedbackAdapter implements IFeedbackAdapter {
  private feedbackStore: RecordStore<FeedbackRecord>;
  private identity: IdentityAdapter;
  private eventBus: IEventStream;

  constructor(dependencies: FeedbackAdapterDependencies) {
    this.feedbackStore = dependencies.feedbackStore;
    this.identity = dependencies.identity;
    this.eventBus = dependencies.eventBus;
  }

  /**
   * [EARS-1] Creates a new FeedbackRecord for structured communication between actors.
   * 
   * Description: Creates a new FeedbackRecord for structured communication between actors.
   * Implementation: Builds record with status: "open", signs with actorId, persists and emits event.
   * Usage: Invoked by `gitgov feedback add` to create feedback, assignments, blocks.
   * Returns: Complete and signed FeedbackRecord.
   */
  async create(payload: Partial<FeedbackRecord>, actorId: string): Promise<FeedbackRecord> {
    // Input validation - Type-safe approach
    const payloadWithEntityId = payload as Partial<FeedbackRecord> & { entityId?: string; entityType?: string };
    if (!payloadWithEntityId.entityId) {
      throw new Error('RecordNotFoundError: entityId is required');
    }

    if (payloadWithEntityId.entityType && !['task', 'execution', 'changelog', 'feedback'].includes(payloadWithEntityId.entityType)) {
      throw new Error('InvalidEntityTypeError: entityType must be task, execution, changelog, or feedback');
    }

    // Validate no duplicate assignments: a task can be assigned to multiple actors,
    // but the same task cannot have multiple open assignments to the same actor
    if (payload.type === 'assignment' && payload.assignee) {
      const existingFeedbacks = await this.getFeedbackByEntity(payloadWithEntityId.entityId);
      const duplicateAssignment = existingFeedbacks.find(feedback =>
        feedback.type === 'assignment' &&
        feedback.assignee === payload.assignee &&
        feedback.status === 'open'
      );

      if (duplicateAssignment) {
        throw new Error(`DuplicateAssignmentError: Task ${payloadWithEntityId.entityId} is already assigned to ${payload.assignee} (feedback: ${duplicateAssignment.id})`);
      }
    }

    // Set default status to "open"
    const enrichedPayload = {
      ...payload,
      status: 'open' as const
    };

    try {
      // 1. Build the record with factory
      const validatedPayload = await createFeedbackRecord(enrichedPayload);

      // 2. Create unsigned record structure
      const unsignedRecord: GitGovRecord & { payload: FeedbackRecord } = {
        header: {
          version: '1.0',
          type: 'feedback',
          payloadChecksum: 'will-be-calculated-by-signRecord',
          signatures: [{
            keyId: actorId,
            role: 'author',
            signature: 'placeholder',
            timestamp: Date.now(),
            timestamp_iso: new Date().toISOString()
          }]
        },
        payload: validatedPayload,
      };

      // 3. Sign the record
      const signedRecord = await this.identity.signRecord(unsignedRecord, actorId, 'author');

      // 4. Persist the record
      await this.feedbackStore.write(signedRecord as GitGovRecord & { payload: FeedbackRecord });

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
          assignee: validatedPayload.assignee
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
   * [EARS-4] Resolves an existing feedback changing its status to resolved.
   * 
   * Description: Resolves an existing feedback changing its status to resolved.
   * Implementation: Reads feedback, validates permissions (future), transitions state, signs and emits event.
   * Usage: Invoked by `gitgov feedback resolve` to close conversations and blocks.
   * Returns: Updated FeedbackRecord with new signature.
   */
  async resolve(feedbackId: string, actorId: string): Promise<FeedbackRecord> {
    // 1. Read the existing feedback
    const existingRecord = await this.feedbackStore.read(feedbackId);
    if (!existingRecord) {
      throw new Error(`RecordNotFoundError: Feedback not found: ${feedbackId}`);
    }

    // 2. Check if already resolved
    if (existingRecord.payload.status === 'resolved') {
      throw new Error(`ProtocolViolationError: Feedback ${feedbackId} is already resolved`);
    }

    // 3. Update status to resolved
    const updatedPayload = {
      ...existingRecord.payload,
      status: 'resolved' as const
    };

    try {
      // 4. Create updated record structure
      const updatedRecord: GitGovRecord & { payload: FeedbackRecord } = {
        ...existingRecord,
        payload: updatedPayload,
      };

      // 5. Sign the updated record
      const signedRecord = await this.identity.signRecord(updatedRecord, actorId, 'resolver');

      // 6. Persist the updated record
      await this.feedbackStore.write(signedRecord as GitGovRecord & { payload: FeedbackRecord });

      // 7. Emit status changed event
      this.eventBus.publish({
        type: 'feedback.status.changed',
        timestamp: Date.now(),
        source: 'feedback_adapter',
        payload: {
          feedbackId: updatedPayload.id,
          oldStatus: existingRecord.payload.status,
          newStatus: updatedPayload.status,
          triggeredBy: actorId,
          assignee: updatedPayload.assignee
        },
      } as FeedbackStatusChangedEvent);

      return updatedPayload;
    } catch (error) {
      throw error;
    }
  }

  /**
   * [EARS-7] Gets a specific FeedbackRecord by its ID for query.
   * 
   * Description: Gets a specific FeedbackRecord by its ID for query.
   * Implementation: Direct read from record store without modifications.
   * Usage: Invoked by `gitgov feedback show` to display feedback details.
   * Returns: FeedbackRecord found or null if it doesn't exist.
   */
  async getFeedback(feedbackId: string): Promise<FeedbackRecord | null> {
    const record = await this.feedbackStore.read(feedbackId);
    return record ? record.payload : null;
  }

  /**
   * [EARS-9] Gets all FeedbackRecords associated with a specific entity.
   * 
   * Description: Gets all FeedbackRecords associated with a specific entity.
   * Implementation: Reads all records and filters by matching entityId.
   * Usage: Invoked by `gitgov feedback list` to display feedback for a task/cycle.
   * Returns: Array of FeedbackRecords filtered for the entity.
   */
  async getFeedbackByEntity(entityId: string): Promise<FeedbackRecord[]> {
    const ids = await this.feedbackStore.list();
    const feedbacks: FeedbackRecord[] = [];

    for (const id of ids) {
      const record = await this.feedbackStore.read(id);
      if (record && record.payload.entityId === entityId) {
        feedbacks.push(record.payload);
      }
    }

    return feedbacks;
  }

  /**
   * [EARS-10] Gets all FeedbackRecords in the system for indexation.
   * 
   * Description: Gets all FeedbackRecords in the system for complete indexation.
   * Implementation: Complete read from record store without filters.
   * Usage: Invoked by `gitgov feedback list --all` and by MetricsAdapter for calculations.
   * Returns: Complete array of all FeedbackRecords.
   */
  async getAllFeedback(): Promise<FeedbackRecord[]> {
    const ids = await this.feedbackStore.list();
    const feedbacks: FeedbackRecord[] = [];

    for (const id of ids) {
      const record = await this.feedbackStore.read(id);
      if (record) {
        feedbacks.push(record.payload);
      }
    }

    return feedbacks;
  }
}
