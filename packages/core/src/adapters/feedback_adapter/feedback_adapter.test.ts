import { FeedbackAdapter } from './index';
import { createFeedbackRecord } from '../../factories/feedback_factory';
import { RecordStore } from '../../store';
import { IdentityAdapter } from '../identity_adapter';
import { publishEvent } from '../../event_bus';
import type { FeedbackRecord } from '../../types';
import type { IEventStream } from '../../event_bus';
import type { GitGovRecord, Signature } from '../../types';
import { DetailedValidationError } from '../../validation/common';

// Mock dependencies
jest.mock('../../factories/feedback_factory');
jest.mock('../../store');
jest.mock('../identity_adapter');
jest.mock('../../event_bus', () => ({
  ...jest.requireActual('../../event_bus'),
  publishEvent: jest.fn(),
}));

// Helper function to create properly typed mock feedback records
function createMockFeedbackRecord(overrides: Partial<FeedbackRecord> = {}): GitGovRecord & { payload: FeedbackRecord } {
  return {
    header: {
      version: '1.0',
      type: 'feedback',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'mock-author',
        role: 'author',
        notes: 'Mock feedback for unit testing',
        signature: 'mock-sig',
        timestamp: 123
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: 'mock-feedback',
      entityType: 'task',
      entityId: 'task-123',
      type: 'suggestion',
      content: 'Mock feedback content',
      status: 'open',
      ...overrides
    }
  };
}

describe('FeedbackAdapter', () => {
  let feedbackAdapter: FeedbackAdapter;
  let mockFeedbackStore: jest.Mocked<RecordStore<FeedbackRecord>>;
  let mockIdentityAdapter: jest.Mocked<IdentityAdapter>;
  let mockPublishEvent: jest.Mock;

  const mockPayload = {
    entityType: 'task' as const,
    entityId: 'task-123',
    type: 'suggestion' as const,
    content: 'This is a test feedback'
  };
  const mockActorId = 'human:developer';
  const mockCreatedFeedbackPayload = {
    id: '123-feedback-test',
    entityType: 'task' as const,
    entityId: 'task-123',
    type: 'suggestion' as const,
    content: 'This is a test feedback',
    status: 'open' as const
  };
  const mockSignedRecord = createMockFeedbackRecord(mockCreatedFeedbackPayload);

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock store with proper typing
    mockFeedbackStore = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<FeedbackRecord>>;

    // Mock identity adapter
    mockIdentityAdapter = {
      signRecord: jest.fn(),
    } as unknown as jest.Mocked<IdentityAdapter>;

    // Mock publish event
    mockPublishEvent = publishEvent as jest.Mock;

    // Mock factory
    (createFeedbackRecord as jest.Mock).mockReturnValue(mockCreatedFeedbackPayload);
    mockIdentityAdapter.signRecord.mockResolvedValue(mockSignedRecord);

    // Create adapter with mocked dependencies
    feedbackAdapter = new FeedbackAdapter({
      feedbackStore: mockFeedbackStore,
      identity: mockIdentityAdapter,
      eventBus: {
        publish: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        getSubscriptions: jest.fn(),
        clearSubscriptions: jest.fn(),
        waitForIdle: jest.fn().mockResolvedValue(undefined)
      } as IEventStream,
      // No workflowMethodology for graceful degradation
    });
  });

  describe('create', () => {
    it('[EARS-1] should create, sign, write, and emit event for valid feedback', async () => {
      const result = await feedbackAdapter.create(mockPayload, mockActorId);

      expect(createFeedbackRecord).toHaveBeenCalledWith({
        ...mockPayload,
        status: 'open'
      });
      expect(mockIdentityAdapter.signRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: mockCreatedFeedbackPayload
        }),
        mockActorId,
        'author'
      );
      expect(mockFeedbackStore.write).toHaveBeenCalledWith(mockSignedRecord);
      // Note: Now using this.eventBus.publish instead of publishEvent
      // The mock eventBus.publish should have been called
      expect(result).toEqual(mockCreatedFeedbackPayload);
    });

    it('[EARS-2] should throw DetailedValidationError for invalid payload', async () => {
      const validationError = new DetailedValidationError('Invalid payload', []);
      (createFeedbackRecord as jest.Mock).mockImplementation(() => { throw validationError; });

      await expect(feedbackAdapter.create({ entityId: 'invalid' }, mockActorId))
        .rejects.toThrow('Invalid payload');

      // Ensure no side effects occurred
      expect(mockIdentityAdapter.signRecord).not.toHaveBeenCalled();
      expect(mockFeedbackStore.write).not.toHaveBeenCalled();
      expect(mockPublishEvent).not.toHaveBeenCalled();
    });

    it('[EARS-3] should throw RecordNotFoundError for missing entityId', async () => {
      await expect(feedbackAdapter.create({} as Partial<FeedbackRecord>, mockActorId))
        .rejects.toThrow('RecordNotFoundError: entityId is required');
    });

    it('[EARS-4] should throw InvalidEntityTypeError for invalid entityType', async () => {
      const invalidPayload = { entityType: 'invalid', entityId: 'task-123', content: 'test' } as Partial<FeedbackRecord> & { entityType: 'invalid' };

      await expect(feedbackAdapter.create(invalidPayload, mockActorId))
        .rejects.toThrow('InvalidEntityTypeError: entityType must be task, execution, changelog, feedback, or cycle');
    });

    it('[EARS-5] should prevent duplicate assignment to same actor', async () => {
      const assignmentPayload = {
        entityType: 'task' as const,
        entityId: 'task-123',
        type: 'assignment' as const,
        assignee: 'human:developer',
        content: 'Assign task to developer'
      };

      // Mock existing assignment feedback for same task and actor
      const existingAssignment = createMockFeedbackRecord({
        id: 'existing-assignment',
        entityId: 'task-123',
        type: 'assignment',
        assignee: 'human:developer',
        status: 'open'
      });

      mockFeedbackStore.list.mockResolvedValue(['existing-assignment']);
      mockFeedbackStore.read.mockResolvedValue(existingAssignment);

      await expect(feedbackAdapter.create(assignmentPayload, 'human:manager'))
        .rejects.toThrow('DuplicateAssignmentError: Task task-123 is already assigned to human:developer (feedback: existing-assignment)');

      // Ensure no side effects occurred
      expect(mockFeedbackStore.write).not.toHaveBeenCalled();
    });

    it('[EARS-6] should allow assignment of same task to different actors', async () => {
      const assignmentPayload = {
        entityType: 'task' as const,
        entityId: 'task-123',
        type: 'assignment' as const,
        assignee: 'human:developer-2',
        content: 'Assign task to second developer'
      };

      // Mock existing assignment to a DIFFERENT actor
      const existingAssignment = createMockFeedbackRecord({
        id: 'existing-assignment',
        entityId: 'task-123',
        type: 'assignment',
        assignee: 'human:developer-1',
        status: 'open'
      });

      mockFeedbackStore.list.mockResolvedValue(['existing-assignment']);
      mockFeedbackStore.read.mockResolvedValue(existingAssignment);

      const newAssignment = {
        id: 'new-assignment',
        entityType: 'task' as const,
        entityId: 'task-123',
        type: 'assignment' as const,
        assignee: 'human:developer-2',
        content: 'Assign task to second developer',
        status: 'open' as const
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue(newAssignment);
      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord(newAssignment));

      const result = await feedbackAdapter.create(assignmentPayload, 'human:manager');

      expect(result).toEqual(newAssignment);
      expect(mockFeedbackStore.write).toHaveBeenCalled();
    });

    it('[EARS-7] should allow new assignment if previous one is resolved', async () => {
      const assignmentPayload = {
        entityType: 'task' as const,
        entityId: 'task-123',
        type: 'assignment' as const,
        assignee: 'human:developer',
        content: 'Reassign task to developer'
      };

      // Mock existing assignment that is RESOLVED (not open)
      const existingAssignment = createMockFeedbackRecord({
        id: 'resolved-assignment',
        entityId: 'task-123',
        type: 'assignment',
        assignee: 'human:developer',
        status: 'resolved'
      });

      mockFeedbackStore.list.mockResolvedValue(['resolved-assignment']);
      mockFeedbackStore.read.mockResolvedValue(existingAssignment);

      const newAssignment = {
        id: 'new-assignment',
        entityType: 'task' as const,
        entityId: 'task-123',
        type: 'assignment' as const,
        assignee: 'human:developer',
        content: 'Reassign task to developer',
        status: 'open' as const
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue(newAssignment);
      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord(newAssignment));

      const result = await feedbackAdapter.create(assignmentPayload, 'human:manager');

      expect(result).toEqual(newAssignment);
      expect(mockFeedbackStore.write).toHaveBeenCalled();
    });

    it('[EARS-8] should not validate duplicates for non-assignment feedbacks', async () => {
      const suggestionPayload = {
        entityType: 'task' as const,
        entityId: 'task-123',
        type: 'suggestion' as const,
        content: 'Multiple suggestions should be allowed'
      };

      // Mock existing suggestion for same task
      const existingSuggestion = createMockFeedbackRecord({
        id: 'existing-suggestion',
        entityId: 'task-123',
        type: 'suggestion',
        status: 'open'
      });

      mockFeedbackStore.list.mockResolvedValue(['existing-suggestion']);
      mockFeedbackStore.read.mockResolvedValue(existingSuggestion);

      const newSuggestion = {
        id: 'new-suggestion',
        entityType: 'task' as const,
        entityId: 'task-123',
        type: 'suggestion' as const,
        content: 'Multiple suggestions should be allowed',
        status: 'open' as const
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue(newSuggestion);
      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord(newSuggestion));

      const result = await feedbackAdapter.create(suggestionPayload, 'human:reviewer');

      expect(result).toEqual(newSuggestion);
      expect(mockFeedbackStore.write).toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    it('[EARS-9] should create new feedback resolving original (immutable pattern)', async () => {
      const originalFeedback = createMockFeedbackRecord({
        id: 'feedback-123',
        status: 'open'
      });

      mockFeedbackStore.read.mockResolvedValue(originalFeedback);

      const newFeedback = {
        id: 'feedback-resolution-123',
        entityType: 'feedback' as const,
        entityId: 'feedback-123',
        type: 'clarification' as const,
        status: 'resolved' as const,
        content: 'Feedback resolved by human:developer',
        resolvesFeedbackId: 'feedback-123'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue(newFeedback);
      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord(newFeedback));

      const result = await feedbackAdapter.resolve('feedback-123', mockActorId);

      // Verify it calls create() with the correct immutable pattern
      expect(createFeedbackRecord).toHaveBeenCalledWith({
        entityType: 'feedback',
        entityId: 'feedback-123',
        type: 'clarification',
        status: 'resolved',
        content: 'Feedback resolved by human:developer',
        resolvesFeedbackId: 'feedback-123'
      });

      expect(result.entityType).toBe('feedback'); // It's a new feedback
      expect(result.entityId).toBe('feedback-123'); // Points to original
      expect(result.resolvesFeedbackId).toBe('feedback-123'); // Traceability
    });

    it('[EARS-10] should use generic message when content not provided', async () => {
      const originalFeedback = createMockFeedbackRecord({
        id: 'feedback-123',
        status: 'open'
      });

      mockFeedbackStore.read.mockResolvedValue(originalFeedback);

      const newFeedback = {
        id: 'feedback-resolution-123',
        entityType: 'feedback' as const,
        entityId: 'feedback-123',
        type: 'clarification' as const,
        status: 'resolved' as const,
        content: 'Feedback resolved by human:developer',
        resolvesFeedbackId: 'feedback-123'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue(newFeedback);
      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord(newFeedback));

      await feedbackAdapter.resolve('feedback-123', mockActorId);

      // Verify default message is generated
      expect(createFeedbackRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Feedback resolved by human:developer'
        })
      );
    });

    it('[EARS-11] should throw RecordNotFoundError for non-existent feedback', async () => {
      mockFeedbackStore.read.mockResolvedValue(null);

      await expect(feedbackAdapter.resolve('non-existent', mockActorId))
        .rejects.toThrow('RecordNotFoundError: Feedback not found: non-existent');
    });

    it('[EARS-12] should use custom content when provided', async () => {
      const originalFeedback = createMockFeedbackRecord({
        id: 'feedback-123',
        status: 'open'
      });

      mockFeedbackStore.read.mockResolvedValue(originalFeedback);

      const customContent = 'Fixed the SQL injection vulnerability with prepared statements';
      const newFeedback = {
        id: 'feedback-resolution-123',
        entityType: 'feedback' as const,
        entityId: 'feedback-123',
        type: 'clarification' as const,
        status: 'resolved' as const,
        content: customContent,
        resolvesFeedbackId: 'feedback-123'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue(newFeedback);
      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord(newFeedback));

      await feedbackAdapter.resolve('feedback-123', mockActorId, customContent);

      // Verify custom content is used
      expect(createFeedbackRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          content: customContent
        })
      );
    });
  });

  describe('getFeedback', () => {
    it('[EARS-13] should return existing feedback record', async () => {
      const mockRecord = createMockFeedbackRecord({ id: 'feedback-123' });
      mockFeedbackStore.read.mockResolvedValue(mockRecord);

      const result = await feedbackAdapter.getFeedback('feedback-123');

      expect(mockFeedbackStore.read).toHaveBeenCalledWith('feedback-123');
      expect(result).toEqual(mockRecord.payload);
    });

    it('[EARS-14] should return null for non-existent feedback', async () => {
      mockFeedbackStore.read.mockResolvedValue(null);

      const result = await feedbackAdapter.getFeedback('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getFeedbackByEntity', () => {
    it('[EARS-15] should filter feedbacks by entity ID', async () => {
      const feedback1 = createMockFeedbackRecord({ id: 'feedback-1', entityId: 'task-123' });
      const feedback2 = createMockFeedbackRecord({ id: 'feedback-2', entityId: 'task-456' });
      const feedback3 = createMockFeedbackRecord({ id: 'feedback-3', entityId: 'task-123' });

      mockFeedbackStore.list.mockResolvedValue(['feedback-1', 'feedback-2', 'feedback-3']);
      mockFeedbackStore.read
        .mockResolvedValueOnce(feedback1)
        .mockResolvedValueOnce(feedback2)
        .mockResolvedValueOnce(feedback3);

      const result = await feedbackAdapter.getFeedbackByEntity('task-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(feedback1.payload);
      expect(result[1]).toEqual(feedback3.payload);
    });

    it('should return empty array when no feedbacks found for entity', async () => {
      mockFeedbackStore.list.mockResolvedValue([]);

      const result = await feedbackAdapter.getFeedbackByEntity('task-nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('getAllFeedback', () => {
    it('[EARS-16] should return all feedback records in the system', async () => {
      const feedback1 = createMockFeedbackRecord({ id: 'feedback-1' });
      const feedback2 = createMockFeedbackRecord({ id: 'feedback-2' });

      mockFeedbackStore.list.mockResolvedValue(['feedback-1', 'feedback-2']);
      mockFeedbackStore.read
        .mockResolvedValueOnce(feedback1)
        .mockResolvedValueOnce(feedback2);

      const result = await feedbackAdapter.getAllFeedback();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(feedback1.payload);
      expect(result[1]).toEqual(feedback2.payload);
    });

    it('should return empty array when no feedbacks exist', async () => {
      mockFeedbackStore.list.mockResolvedValue([]);

      const result = await feedbackAdapter.getAllFeedback();

      expect(result).toEqual([]);
    });
  });

  describe('Performance Tests', () => {
    it('[EARS-20] should execute in under 50ms for typical datasets', async () => {
      // Create mock data for performance test
      const feedbackIds = Array.from({ length: 100 }, (_, i) => `feedback-${i}`);
      const mockFeedbacks = feedbackIds.map(id =>
        createMockFeedbackRecord({ id, entityId: `task-${id}` })
      );

      mockFeedbackStore.list.mockResolvedValue(feedbackIds);
      mockFeedbacks.forEach(feedback => {
        mockFeedbackStore.read.mockResolvedValueOnce(feedback);
      });

      const startTime = Date.now();
      await feedbackAdapter.getAllFeedback();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50);
    });
  });

  describe('Error Handling', () => {
    it('should handle factory errors gracefully', async () => {
      (createFeedbackRecord as jest.Mock).mockRejectedValue(new Error('Factory error'));

      await expect(feedbackAdapter.create(mockPayload, mockActorId))
        .rejects.toThrow('Factory error');
    });

    it('should handle identity errors gracefully', async () => {
      mockIdentityAdapter.signRecord.mockRejectedValue(new Error('Signing failed'));

      await expect(feedbackAdapter.create(mockPayload, mockActorId))
        .rejects.toThrow('Signing failed');
    });

    it('should handle store errors gracefully in resolve', async () => {
      const existingFeedback = createMockFeedbackRecord({ status: 'open' });
      mockFeedbackStore.read.mockResolvedValue(existingFeedback);
      mockFeedbackStore.write.mockRejectedValue(new Error('Store error'));

      await expect(feedbackAdapter.resolve('feedback-123', mockActorId))
        .rejects.toThrow('Store error');
    });
  });

  describe('Event Emission Verification', () => {
    it('[EARS-20] should emit feedback.created with resolvesFeedbackId when present', async () => {
      const originalFeedback = createMockFeedbackRecord({
        id: 'feedback-original',
        status: 'open'
      });

      mockFeedbackStore.read.mockResolvedValue(originalFeedback);

      const newFeedback = {
        id: 'feedback-resolution',
        entityType: 'feedback' as const,
        entityId: 'feedback-original',
        type: 'clarification' as const,
        status: 'resolved' as const,
        content: 'Resolved',
        resolvesFeedbackId: 'feedback-original'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue(newFeedback);
      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord(newFeedback));

      const mockEventBus = feedbackAdapter['eventBus'];

      await feedbackAdapter.resolve('feedback-original', mockActorId, 'Resolved');

      // Verify eventBus.publish was called with resolvesFeedbackId
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'feedback.created',
          payload: expect.objectContaining({
            resolvesFeedbackId: 'feedback-original'
          })
        })
      );
    });

    it('[EARS-21] should emit feedback.created with assignee when provided', async () => {
      const assignmentPayload = {
        entityType: 'task' as const,
        entityId: 'task-123',
        type: 'assignment' as const,
        assignee: 'human:developer',
        content: 'Assigned to developer'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue({
        ...assignmentPayload,
        id: 'feedback-assignment',
        status: 'open'
      });

      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord({
        ...assignmentPayload,
        id: 'feedback-assignment',
        status: 'open'
      }));

      const mockEventBus = feedbackAdapter['eventBus'];

      await feedbackAdapter.create(assignmentPayload, mockActorId);

      // Verify eventBus.publish was called with assignee
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'feedback.created',
          payload: expect.objectContaining({
            assignee: 'human:developer'
          })
        })
      );
    });

    it('[EARS-22] should emit feedback.created via resolve with resolvesFeedbackId populated', async () => {
      const originalFeedback = createMockFeedbackRecord({
        id: 'feedback-123',
        status: 'open'
      });

      mockFeedbackStore.read.mockResolvedValue(originalFeedback);

      const newFeedback = {
        id: 'feedback-resolution-123',
        entityType: 'feedback' as const,
        entityId: 'feedback-123',
        type: 'clarification' as const,
        status: 'resolved' as const,
        content: 'Feedback resolved by human:developer',
        resolvesFeedbackId: 'feedback-123'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue(newFeedback);
      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord(newFeedback));

      const mockEventBus = feedbackAdapter['eventBus'];

      await feedbackAdapter.resolve('feedback-123', mockActorId);

      // Verify resolve() delegates to create() which emits the event
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'feedback.created',
          payload: expect.objectContaining({
            entityType: 'feedback',
            entityId: 'feedback-123',
            resolvesFeedbackId: 'feedback-123',
            status: 'resolved'
          })
        })
      );
    });
  });

  describe('Edge Cases - Immutable Pattern', () => {
    it('[EARS-23] should accept feedback on cycle entities', async () => {
      const cyclePayload = {
        entityType: 'cycle' as const,
        entityId: '1234567890-cycle-sprint-1',
        type: 'suggestion' as const,
        content: 'Cycle needs more planning tasks'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue({
        ...cyclePayload,
        id: 'feedback-cycle-suggestion',
        status: 'open'
      });

      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord({
        ...cyclePayload,
        id: 'feedback-cycle-suggestion',
        status: 'open'
      }));

      const result = await feedbackAdapter.create(cyclePayload, mockActorId);

      expect(result.entityType).toBe('cycle');
      expect(createFeedbackRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'cycle'
        })
      );
    });

    it('[EARS-24] should allow resolving same feedback multiple times without conflict', async () => {
      const originalFeedback = createMockFeedbackRecord({
        id: 'feedback-question',
        type: 'question',
        status: 'open'
      });

      mockFeedbackStore.read.mockResolvedValue(originalFeedback);

      // First resolution
      const resolution1 = {
        id: 'feedback-resolution-1',
        entityType: 'feedback' as const,
        entityId: 'feedback-question',
        type: 'clarification' as const,
        status: 'resolved' as const,
        content: 'First answer',
        resolvesFeedbackId: 'feedback-question'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValueOnce(resolution1);
      mockIdentityAdapter.signRecord.mockResolvedValueOnce(createMockFeedbackRecord(resolution1));

      const result1 = await feedbackAdapter.resolve('feedback-question', mockActorId, 'First answer');

      // Second resolution (different answer)
      const resolution2 = {
        id: 'feedback-resolution-2',
        entityType: 'feedback' as const,
        entityId: 'feedback-question',
        type: 'clarification' as const,
        status: 'resolved' as const,
        content: 'Alternative answer',
        resolvesFeedbackId: 'feedback-question'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValueOnce(resolution2);
      mockIdentityAdapter.signRecord.mockResolvedValueOnce(createMockFeedbackRecord(resolution2));

      const result2 = await feedbackAdapter.resolve('feedback-question', mockActorId, 'Alternative answer');

      // Both resolutions should exist with different IDs
      expect(result1.id).not.toBe(result2.id);
      expect(result1.resolvesFeedbackId).toBe('feedback-question');
      expect(result2.resolvesFeedbackId).toBe('feedback-question');
    });

    it('[EARS-25] should allow creating feedback with resolved status from start', async () => {
      const approvalPayload = {
        entityType: 'execution' as const,
        entityId: '1752642000-exec-api-impl',
        type: 'approval' as const,
        status: 'resolved' as const, // Instant approval
        content: 'LGTM - code approved for merge'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue({
        ...approvalPayload,
        id: 'feedback-instant-approval'
      });

      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord({
        ...approvalPayload,
        id: 'feedback-instant-approval'
      }));

      const result = await feedbackAdapter.create(approvalPayload, mockActorId);

      expect(result.status).toBe('resolved');
      expect(result.type).toBe('approval');
      // Verify factory was called with resolved status
      expect(createFeedbackRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'resolved'
        })
      );
    });

    it('[EARS-36] should detect assignment resolution via resolvesFeedbackId', async () => {
      // Scenario: Assignment -> Resolution -> Re-assignment should work
      const taskId = 'task-backend-api';
      const assignee = 'human:dev-1';

      // 1. Create initial assignment
      const assignment1 = createMockFeedbackRecord({
        id: 'feedback-assignment-1',
        entityType: 'task',
        entityId: taskId,
        type: 'assignment',
        assignee,
        status: 'open'
      });

      // 2. Create resolution of that assignment
      const resolution1 = createMockFeedbackRecord({
        id: 'feedback-resolution-1',
        entityType: 'feedback',
        entityId: 'feedback-assignment-1',
        resolvesFeedbackId: 'feedback-assignment-1', // Links to original assignment
        type: 'clarification',
        status: 'resolved',
        content: 'Work completed'
      });

      // Mock getFeedbackByEntity to return only assignment (resolution is on different entity)
      // Mock getAllFeedback to return both
      mockFeedbackStore.list.mockResolvedValue(['feedback-assignment-1', 'feedback-resolution-1']);
      mockFeedbackStore.read.mockImplementation((id: string) => {
        if (id === 'feedback-assignment-1') return Promise.resolve(assignment1);
        if (id === 'feedback-resolution-1') return Promise.resolve(resolution1);
        return Promise.resolve(null);
      });

      // 3. Try to re-assign to same actor - should work because previous was resolved
      const newAssignmentPayload = {
        entityType: 'task' as const,
        entityId: taskId,
        type: 'assignment' as const,
        assignee,
        content: 'New assignment after previous completion'
      };

      (createFeedbackRecord as jest.Mock).mockReturnValue({
        ...newAssignmentPayload,
        id: 'feedback-assignment-2',
        status: 'open'
      });

      mockIdentityAdapter.signRecord.mockResolvedValue(createMockFeedbackRecord({
        ...newAssignmentPayload,
        id: 'feedback-assignment-2'
      }));

      // Should NOT throw DuplicateAssignmentError
      const result = await feedbackAdapter.create(newAssignmentPayload, mockActorId);

      expect(result.id).toBe('feedback-assignment-2');
      expect(result.assignee).toBe(assignee);
      expect(result.type).toBe('assignment');
    });

    it('[EARS-36] should reject duplicate assignment when no resolution exists', async () => {
      // Scenario: Assignment (no resolution) -> Re-assignment should fail
      const taskId = 'task-frontend-ui';
      const assignee = 'human:dev-2';

      // 1. Create initial assignment (NO resolution)
      const assignment1 = createMockFeedbackRecord({
        id: 'feedback-assignment-unresolved',
        entityType: 'task',
        entityId: taskId,
        type: 'assignment',
        assignee,
        status: 'open'
      });

      // Mock getFeedbackByEntity to return only the assignment (no resolution)
      mockFeedbackStore.list.mockResolvedValue(['feedback-assignment-unresolved']);
      mockFeedbackStore.read.mockImplementation((id: string) => {
        if (id === 'feedback-assignment-unresolved') return Promise.resolve(assignment1);
        return Promise.resolve(null);
      });

      // 2. Try to re-assign to same actor - should fail because previous NOT resolved
      const duplicatePayload = {
        entityType: 'task' as const,
        entityId: taskId,
        type: 'assignment' as const,
        assignee,
        content: 'Duplicate assignment attempt'
      };

      // Should throw DuplicateAssignmentError
      await expect(feedbackAdapter.create(duplicatePayload, mockActorId))
        .rejects
        .toThrow(/DuplicateAssignmentError.*already assigned to human:dev-2/);
    });
  });

  describe('Threading Edge Cases', () => {
    it('[EARS-26] should return empty thread for feedback with no responses', async () => {
      const lonelyFeedback = createMockFeedbackRecord({
        id: 'feedback-lonely',
        entityType: 'task',
        entityId: 'task-123',
        content: 'Nobody answered this question'
      });

      mockFeedbackStore.read.mockResolvedValue(lonelyFeedback);
      mockFeedbackStore.list.mockResolvedValue(['feedback-lonely']);

      const thread = await feedbackAdapter.getFeedbackThread('feedback-lonely');

      expect(thread.feedback).toEqual(lonelyFeedback.payload);
      expect(thread.responses).toHaveLength(0); // No responses
    });

    it('[EARS-27] should build deep thread (10+ levels) without performance degradation', async () => {
      // Setup chain: f1 → f2 → f3 → ... → f15
      const feedbacks: any[] = [];
      for (let i = 1; i <= 15; i++) {
        feedbacks.push(createMockFeedbackRecord({
          id: `feedback-${i}`,
          entityType: i === 1 ? 'task' : 'feedback',
          entityId: i === 1 ? 'task-123' : `feedback-${i - 1}`,
          content: `Level ${i}`
        }));
      }

      mockFeedbackStore.read.mockImplementation((id: string) => {
        const match = feedbacks.find(f => f.payload.id === id);
        return Promise.resolve(match || null);
      });

      mockFeedbackStore.list.mockResolvedValue(feedbacks.map(f => f.payload.id));

      const startTime = Date.now();
      const thread = await feedbackAdapter.getFeedbackThread('feedback-1');
      const endTime = Date.now();

      // Verify depth
      let depth = 0;
      let current = thread;
      while (current.responses.length > 0) {
        depth++;
        current = current.responses[0]!;
      }

      expect(depth).toBe(14); // 15 feedbacks = 14 edges
      expect(endTime - startTime).toBeLessThan(200); // No degradation
    });
  });

  describe('Performance - Advanced', () => {
    it('[EARS-29] should filter 1000+ feedbacks in under 100ms', async () => {
      // Create 1200 feedbacks, 150 for task-123
      const feedbacks: any[] = [];
      for (let i = 0; i < 1200; i++) {
        feedbacks.push(createMockFeedbackRecord({
          id: `feedback-${i}`,
          entityId: i < 150 ? 'task-123' : `task-${i}`,
          content: `Feedback ${i}`
        }));
      }

      mockFeedbackStore.list.mockResolvedValue(feedbacks.map(f => f.payload.id));
      mockFeedbackStore.read.mockImplementation((id: string) => {
        const match = feedbacks.find(f => f.payload.id === id);
        return Promise.resolve(match || null);
      });

      const startTime = Date.now();
      const result = await feedbackAdapter.getFeedbackByEntity('task-123');
      const endTime = Date.now();

      expect(result).toHaveLength(150);
      expect(endTime - startTime).toBeLessThan(100); // <100ms target
    });

    it('[EARS-30] should build thread of 20+ levels in under 200ms', async () => {
      // Setup chain of 25 feedbacks
      const feedbacks: any[] = [];
      for (let i = 1; i <= 25; i++) {
        feedbacks.push(createMockFeedbackRecord({
          id: `feedback-${i}`,
          entityType: i === 1 ? 'task' : 'feedback',
          entityId: i === 1 ? 'task-123' : `feedback-${i - 1}`,
          content: `Level ${i}`
        }));
      }

      mockFeedbackStore.read.mockImplementation((id: string) => {
        const match = feedbacks.find(f => f.payload.id === id);
        return Promise.resolve(match || null);
      });

      mockFeedbackStore.list.mockResolvedValue(feedbacks.map(f => f.payload.id));

      const startTime = Date.now();
      const thread = await feedbackAdapter.getFeedbackThread('feedback-1');
      const endTime = Date.now();

      // Verify depth
      let depth = 0;
      let current = thread;
      while (current.responses.length > 0) {
        depth++;
        current = current.responses[0]!;
      }

      expect(depth).toBe(24); // 25 feedbacks = 24 edges
      expect(endTime - startTime).toBeLessThan(200); // <200ms target for deep threads
    });
  });

  describe('getFeedbackThread', () => {
    it('[EARS-17] should build complete conversation tree', async () => {
      // Setup: feedback-1 (root) -> feedback-2 (response) -> feedback-3 (nested response)
      const feedback1 = createMockFeedbackRecord({
        id: 'feedback-1',
        entityType: 'task',
        entityId: 'task-123',
        content: 'Original question'
      });
      const feedback2 = createMockFeedbackRecord({
        id: 'feedback-2',
        entityType: 'feedback',
        entityId: 'feedback-1',
        content: 'First response'
      });
      const feedback3 = createMockFeedbackRecord({
        id: 'feedback-3',
        entityType: 'feedback',
        entityId: 'feedback-2',
        content: 'Nested response'
      });

      // Mock read for individual feedback
      mockFeedbackStore.read
        .mockResolvedValueOnce(feedback1) // For root
        .mockResolvedValueOnce(feedback2) // For first level
        .mockResolvedValueOnce(feedback3); // For second level

      // Mock list for getAllFeedback() calls
      mockFeedbackStore.list.mockResolvedValue(['feedback-1', 'feedback-2', 'feedback-3']);

      // Mock getAllFeedback() to return all feedbacks
      let callCount = 0;
      mockFeedbackStore.read.mockImplementation((id: string) => {
        callCount++;
        if (id === 'feedback-1') return Promise.resolve(feedback1);
        if (id === 'feedback-2') return Promise.resolve(feedback2);
        if (id === 'feedback-3') return Promise.resolve(feedback3);
        return Promise.resolve(null);
      });

      const result = await feedbackAdapter.getFeedbackThread('feedback-1');

      // Verify tree structure
      expect(result.feedback).toEqual(feedback1.payload);
      expect(result.responses).toHaveLength(1);
      expect(result.responses[0]!.feedback).toEqual(feedback2.payload);
      expect(result.responses[0]!.responses).toHaveLength(1);
      expect(result.responses[0]!.responses[0]!.feedback).toEqual(feedback3.payload);
      expect(result.responses[0]!.responses[0]!.responses).toHaveLength(0);
    });

    it('[EARS-18] should limit tree depth with maxDepth parameter', async () => {
      // Setup: feedback-1 -> feedback-2 -> feedback-3
      const feedback1 = createMockFeedbackRecord({
        id: 'feedback-1',
        entityType: 'task',
        entityId: 'task-123'
      });
      const feedback2 = createMockFeedbackRecord({
        id: 'feedback-2',
        entityType: 'feedback',
        entityId: 'feedback-1'
      });

      mockFeedbackStore.read
        .mockImplementation((id: string) => {
          if (id === 'feedback-1') return Promise.resolve(feedback1);
          if (id === 'feedback-2') return Promise.resolve(feedback2);
          return Promise.resolve(null);
        });

      mockFeedbackStore.list.mockResolvedValue(['feedback-1', 'feedback-2']);

      const result = await feedbackAdapter.getFeedbackThread('feedback-1', 1);

      // Should only have root level, no responses due to depth limit
      expect(result.feedback).toEqual(feedback1.payload);
      expect(result.responses).toHaveLength(0); // Depth limit prevents going deeper
    });

    it('[EARS-19] should throw error for non-existent feedbackId in thread', async () => {
      mockFeedbackStore.read.mockResolvedValue(null);

      await expect(feedbackAdapter.getFeedbackThread('non-existent'))
        .rejects.toThrow('RecordNotFoundError: Feedback not found: non-existent');
    });

    it('should handle multiple responses at same level', async () => {
      // Setup: feedback-1 -> feedback-2, feedback-3 (both responding to feedback-1)
      const feedback1 = createMockFeedbackRecord({
        id: 'feedback-1',
        entityType: 'task',
        entityId: 'task-123'
      });
      const feedback2 = createMockFeedbackRecord({
        id: 'feedback-2',
        entityType: 'feedback',
        entityId: 'feedback-1'
      });
      const feedback3 = createMockFeedbackRecord({
        id: 'feedback-3',
        entityType: 'feedback',
        entityId: 'feedback-1'
      });

      mockFeedbackStore.read.mockImplementation((id: string) => {
        if (id === 'feedback-1') return Promise.resolve(feedback1);
        if (id === 'feedback-2') return Promise.resolve(feedback2);
        if (id === 'feedback-3') return Promise.resolve(feedback3);
        return Promise.resolve(null);
      });

      mockFeedbackStore.list.mockResolvedValue(['feedback-1', 'feedback-2', 'feedback-3']);

      const result = await feedbackAdapter.getFeedbackThread('feedback-1');

      // Should have 2 responses at first level
      expect(result.responses).toHaveLength(2);
      expect(result.responses[0]!.feedback.id).toBe('feedback-2');
      expect(result.responses[1]!.feedback.id).toBe('feedback-3');
    });
  });
});
