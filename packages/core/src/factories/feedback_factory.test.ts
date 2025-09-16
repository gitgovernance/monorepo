import { createFeedbackRecord } from './feedback_factory';
import { generateFeedbackId } from '../utils/id_generator';
import { DetailedValidationError } from '../validation/common';

// Mock the validator
jest.mock('../validation/feedback_validator', () => ({
  validateFeedbackRecordDetailed: jest.fn()
}));

// Mock ID generator
jest.mock('../utils/id_generator', () => ({
  generateFeedbackId: jest.fn()
}));

describe('FeedbackRecord Factory', () => {
  const mockValidateFeedbackRecordDetailed = require('../validation/feedback_validator').validateFeedbackRecordDetailed;
  const mockGenerateFeedbackId = generateFeedbackId as jest.MockedFunction<typeof generateFeedbackId>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default successful validation
    mockValidateFeedbackRecordDetailed.mockReturnValue({
      isValid: true,
      errors: []
    });

    // Default ID generation
    mockGenerateFeedbackId.mockReturnValue('1752788100-feedback-test-feedback');
  });

  describe('createFeedbackRecord', () => {
    it('[EARS-1] should create a valid FeedbackRecord with all required fields', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        type: 'blocking' as const,
        content: 'This task has a blocking issue that needs resolution',
        assignee: 'human:qa-lead',
        resolvesFeedbackId: '1752788000-feedback-original'
      };

      const result = await createFeedbackRecord(payload);

      expect(result).toEqual({
        id: '1752788100-feedback-test-feedback',
        entityType: 'task',
        entityId: '1752274500-task-test-task',
        type: 'blocking',
        status: 'open',
        content: 'This task has a blocking issue that needs resolution',
        assignee: 'human:qa-lead',
        resolvesFeedbackId: '1752788000-feedback-original'
      });

      expect(mockValidateFeedbackRecordDetailed).toHaveBeenCalledWith(result);
    });

    it('[EARS-2] should apply default values for missing optional fields', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        content: 'Test feedback content'
      };

      const result = await createFeedbackRecord(payload);

      expect(result).toEqual({
        id: '1752788100-feedback-test-feedback',
        entityType: 'task',
        entityId: '1752274500-task-test-task',
        type: 'question',
        status: 'open',
        content: 'Test feedback content',
        assignee: undefined,
        resolvesFeedbackId: undefined
      });

      expect(mockGenerateFeedbackId).toHaveBeenCalledWith('Test feedback content', expect.any(Number));
    });

    it('[EARS-3] should preserve provided ID when specified', async () => {
      const payload = {
        id: '1752788200-feedback-custom-id',
        entityType: 'execution' as const,
        entityId: '1752275500-exec-test-execution',
        type: 'suggestion' as const,
        content: 'Custom feedback with provided ID'
      };

      const result = await createFeedbackRecord(payload);

      expect(result.id).toBe('1752788200-feedback-custom-id');
      expect(mockGenerateFeedbackId).not.toHaveBeenCalled();
    });

    it('[EARS-4] should set status to resolved for assignment type feedback', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        type: 'assignment' as const,
        content: 'Assigning this task to development team',
        assignee: 'human:developer'
      };

      const result = await createFeedbackRecord(payload);

      expect(result.status).toBe('resolved');
      expect(result.type).toBe('assignment');
    });

    it('[EARS-5] should throw DetailedValidationError when validation fails', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        type: 'blocking' as const,
        content: 'Test feedback content'
      };

      const validationErrors = [
        { field: 'entityId', message: 'must match pattern', value: payload.entityId }
      ];

      mockValidateFeedbackRecordDetailed.mockReturnValue({
        isValid: false,
        errors: validationErrors
      });

      await expect(createFeedbackRecord(payload)).rejects.toThrow(DetailedValidationError);
      await expect(createFeedbackRecord(payload)).rejects.toThrow('FeedbackRecord');
    });

    it('[EARS-6] should preserve all provided fields in the output', async () => {
      const payload = {
        id: '1752788200-feedback-preserve-fields',
        entityType: 'feedback' as const,
        entityId: '1752788000-feedback-original',
        type: 'clarification' as const,
        status: 'acknowledged' as const,
        content: 'Providing clarification on the original feedback',
        assignee: 'human:tech-lead',
        resolvesFeedbackId: '1752788000-feedback-original'
      };

      const result = await createFeedbackRecord(payload);

      expect(result).toEqual(payload);
      expect(mockValidateFeedbackRecordDetailed).toHaveBeenCalledWith(payload);
    });

    it('[EARS-7] should generate ID from content when content is provided but ID is not', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        type: 'question' as const,
        content: 'This is a specific question about implementation'
      };

      mockGenerateFeedbackId.mockReturnValue('1752788100-feedback-this-is-a-specific-question-about');

      const result = await createFeedbackRecord(payload);

      expect(result.id).toBe('1752788100-feedback-this-is-a-specific-question-about');
      expect(mockGenerateFeedbackId).toHaveBeenCalledWith('This is a specific question about implementation', expect.any(Number));
    });

    it('[EARS-8] should use current timestamp when none provided', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        type: 'suggestion' as const,
        content: 'Timestamp test feedback'
      };

      const beforeTime = Math.floor(Date.now() / 1000);
      await createFeedbackRecord(payload);
      const afterTime = Math.floor(Date.now() / 1000);

      expect(mockGenerateFeedbackId).toHaveBeenCalledWith(
        'Timestamp test feedback',
        expect.any(Number)
      );

      const calledTimestamp = mockGenerateFeedbackId.mock.calls[0]![1];
      expect(calledTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(calledTimestamp).toBeLessThanOrEqual(afterTime);
    });

    describe('FeedbackRecord Specific Factory Operations (EARS 25-28)', () => {
      it('[EARS-25] should throw DetailedValidationError for invalid entityType', async () => {
        const validationErrors = [
          { field: 'entityType', message: 'must be one of task, execution, changelog, feedback', value: 'invalid-entity' }
        ];

        mockValidateFeedbackRecordDetailed.mockReturnValue({
          isValid: false,
          errors: validationErrors
        });

        const payload = {
          entityType: 'invalid-entity' as any,
          entityId: '1752274500-task-test-task',
          type: 'suggestion' as const,
          content: 'Test feedback'
        };

        await expect(createFeedbackRecord(payload)).rejects.toThrow(DetailedValidationError);
      });

      it('[EARS-26] should throw DetailedValidationError for invalid type', async () => {
        const validationErrors = [
          { field: 'type', message: 'must be one of blocking, suggestion, question, approval, clarification, assignment', value: 'invalid-type' }
        ];

        mockValidateFeedbackRecordDetailed.mockReturnValue({
          isValid: false,
          errors: validationErrors
        });

        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          type: 'invalid-type' as any,
          content: 'Test feedback'
        };

        await expect(createFeedbackRecord(payload)).rejects.toThrow(DetailedValidationError);
      });

      it('[EARS-27] should throw DetailedValidationError for invalid status', async () => {
        const validationErrors = [
          { field: 'status', message: 'must be one of open, acknowledged, resolved, wontfix', value: 'invalid-status' }
        ];

        mockValidateFeedbackRecordDetailed.mockReturnValue({
          isValid: false,
          errors: validationErrors
        });

        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          type: 'suggestion' as const,
          content: 'Test feedback',
          status: 'invalid-status' as any
        };

        await expect(createFeedbackRecord(payload)).rejects.toThrow(DetailedValidationError);
      });

      it('[EARS-28] should apply status resolved for type assignment', async () => {
        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          type: 'assignment' as const,
          content: 'Please assign this task to the backend team',
          assignee: 'human:backend-lead'
        };

        const result = await createFeedbackRecord(payload);

        expect(result.type).toBe('assignment');
        expect(result.status).toBe('resolved'); // Special default for assignment
        expect(result.assignee).toBe('human:backend-lead');
      });

      it('[EARS-25] should accept valid entityType values', async () => {
        const validEntityTypes = ['task', 'execution', 'changelog', 'feedback'];

        for (const entityType of validEntityTypes) {
          const payload = {
            entityType: entityType as any,
            entityId: `1752274500-${entityType}-test-entity`,
            type: 'suggestion' as const,
            content: `Test feedback for ${entityType}`
          };

          const feedback = await createFeedbackRecord(payload);
          expect(feedback.entityType).toBe(entityType);
        }
      });

      it('[EARS-26] should accept valid type values', async () => {
        const validTypes = ['blocking', 'suggestion', 'question', 'approval', 'clarification', 'assignment'];

        for (const type of validTypes) {
          const payload = {
            entityType: 'task' as const,
            entityId: '1752274500-task-test-task',
            type: type as any,
            content: `Test ${type} feedback`
          };

          const feedback = await createFeedbackRecord(payload);
          expect(feedback.type).toBe(type);
        }
      });

      it('[EARS-27] should accept valid status values', async () => {
        const validStatuses = ['open', 'acknowledged', 'resolved', 'wontfix'];

        for (const status of validStatuses) {
          const payload = {
            entityType: 'task' as const,
            entityId: '1752274500-task-test-task',
            type: 'suggestion' as const,
            content: 'Test feedback for status validation',
            status: status as any
          };

          const feedback = await createFeedbackRecord(payload);
          expect(feedback.status).toBe(status);
        }
      });
    });
  });
});

