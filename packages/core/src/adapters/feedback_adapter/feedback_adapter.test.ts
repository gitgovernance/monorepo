import { FeedbackAdapter } from './index';
import { createFeedbackRecord } from '../../factories/feedback_factory';
import { RecordStore } from '../../store';
import { IdentityAdapter } from '../identity_adapter';
import { publishEvent } from '../../modules/event_bus_module';
import type { FeedbackRecord } from '../../types/feedback_record';
import type { IEventStream } from '../../modules/event_bus_module';
import type { GitGovRecord, Signature } from '../../models';
import { DetailedValidationError } from '../../validation/common';

// Mock dependencies
jest.mock('../../factories/feedback_factory');
jest.mock('../../store');
jest.mock('../identity_adapter');
jest.mock('../../modules/event_bus_module', () => ({
  ...jest.requireActual('../../modules/event_bus_module'),
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
        signature: 'mock-sig',
        timestamp: 123,
        timestamp_iso: '2025-01-01T00:00:00Z'
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
    (createFeedbackRecord as jest.Mock).mockResolvedValue(mockCreatedFeedbackPayload);
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
        clearSubscriptions: jest.fn()
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
      (createFeedbackRecord as jest.Mock).mockRejectedValue(validationError);

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

    it('[EARS-11] should throw InvalidEntityTypeError for invalid entityType', async () => {
      const invalidPayload = { entityType: 'invalid', entityId: 'task-123', content: 'test' } as Partial<FeedbackRecord> & { entityType: 'invalid' };

      await expect(feedbackAdapter.create(invalidPayload, mockActorId))
        .rejects.toThrow('InvalidEntityTypeError: entityType must be task, execution, changelog, or feedback');
    });
  });

  describe('resolve', () => {
    it('[EARS-4] should resolve feedback and emit status changed event', async () => {
      const existingFeedback = createMockFeedbackRecord({
        id: 'feedback-123',
        status: 'open'
      });
      const resolvedFeedback = { ...existingFeedback.payload, status: 'resolved' as const };

      mockFeedbackStore.read.mockResolvedValue(existingFeedback);
      mockIdentityAdapter.signRecord.mockResolvedValue({
        ...existingFeedback,
        payload: resolvedFeedback
      });

      const result = await feedbackAdapter.resolve('feedback-123', mockActorId);

      expect(mockFeedbackStore.read).toHaveBeenCalledWith('feedback-123');
      expect(mockIdentityAdapter.signRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: resolvedFeedback
        }),
        mockActorId,
        'resolver'
      );
      expect(mockFeedbackStore.write).toHaveBeenCalled();
      // Note: Now using this.eventBus.publish instead of publishEvent
      // The mock eventBus.publish should have been called
      expect(result).toEqual(resolvedFeedback);
    });

    it('[EARS-5] should throw RecordNotFoundError for non-existent feedback', async () => {
      mockFeedbackStore.read.mockResolvedValue(null);

      await expect(feedbackAdapter.resolve('non-existent', mockActorId))
        .rejects.toThrow('RecordNotFoundError: Feedback not found: non-existent');
    });

    it('[EARS-6] should throw error when resolving already resolved feedback', async () => {
      const resolvedFeedback = createMockFeedbackRecord({
        id: 'feedback-123',
        status: 'resolved'
      });
      mockFeedbackStore.read.mockResolvedValue(resolvedFeedback);

      await expect(feedbackAdapter.resolve('feedback-123', mockActorId))
        .rejects.toThrow('ProtocolViolationError: Feedback feedback-123 is already resolved');
    });
  });

  describe('getFeedback', () => {
    it('[EARS-7] should return existing feedback record', async () => {
      const mockRecord = createMockFeedbackRecord({ id: 'feedback-123' });
      mockFeedbackStore.read.mockResolvedValue(mockRecord);

      const result = await feedbackAdapter.getFeedback('feedback-123');

      expect(mockFeedbackStore.read).toHaveBeenCalledWith('feedback-123');
      expect(result).toEqual(mockRecord.payload);
    });

    it('[EARS-8] should return null for non-existent feedback', async () => {
      mockFeedbackStore.read.mockResolvedValue(null);

      const result = await feedbackAdapter.getFeedback('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getFeedbackByEntity', () => {
    it('[EARS-9] should filter feedbacks by entity ID', async () => {
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
    it('[EARS-10] should return all feedback records in the system', async () => {
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
    it('[EARS-12] should execute in under 50ms for typical datasets', async () => {
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
});
