import { createFeedbackRecord } from './feedback_factory';
import { generateFeedbackId } from '../utils/id_generator';
import { DetailedValidationError } from '../record_validations/common';
import type { FeedbackRecord } from '../record_types';

// Mock the validator
jest.mock('../record_validations/feedback_validator', () => ({
  validateFeedbackRecordDetailed: jest.fn()
}));

// Mock ID generator
jest.mock('../utils/id_generator', () => ({
  generateFeedbackId: jest.fn()
}));

describe('FeedbackRecord Factory', () => {
  const mockValidateFeedbackRecordDetailed = require('../record_validations/feedback_validator').validateFeedbackRecordDetailed;
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
    it('[EARS-14] should create a valid FeedbackRecord with defaults applied', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        type: 'blocking' as const,
        content: 'This task has a blocking issue that needs resolution',
        assignee: 'human:qa-lead',
        resolvesFeedbackId: '1752788000-feedback-original'
      };

      const result = createFeedbackRecord(payload);

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

    it('[EARS-18] should apply default values for missing optional fields', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        content: 'Test feedback content'
      };

      const result = createFeedbackRecord(payload);

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

    it('[EARS-16] should preserve provided ID when specified', async () => {
      const payload = {
        id: '1752788200-feedback-custom-id',
        entityType: 'execution' as const,
        entityId: '1752275500-exec-test-execution',
        type: 'suggestion' as const,
        content: 'Custom feedback with provided ID'
      };

      const result = createFeedbackRecord(payload);

      expect(result.id).toBe('1752788200-feedback-custom-id');
      expect(mockGenerateFeedbackId).not.toHaveBeenCalled();
    });

    it('[EARS-38] should set status to resolved for assignment type feedback', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        type: 'assignment' as const,
        content: 'Assigning this task to development team',
        assignee: 'human:developer'
      };

      const result = createFeedbackRecord(payload);

      expect(result.status).toBe('resolved');
      expect(result.type).toBe('assignment');
    });

    it('[EARS-13] should throw DetailedValidationError when validation fails', async () => {
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

      expect(() => createFeedbackRecord(payload)).toThrow(DetailedValidationError);
      expect(() => createFeedbackRecord(payload)).toThrow('FeedbackRecord');
    });

    it('[EARS-14] should preserve all provided fields in the output', async () => {
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

      const result = createFeedbackRecord(payload);

      expect(result).toEqual(payload);
      expect(mockValidateFeedbackRecordDetailed).toHaveBeenCalledWith(payload);
    });

    it('[EARS-15] should generate ID from content when content is provided but ID is not', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        type: 'question' as const,
        content: 'This is a specific question about implementation'
      };

      mockGenerateFeedbackId.mockReturnValue('1752788100-feedback-this-is-a-specific-question-about');

      const result = createFeedbackRecord(payload);

      expect(result.id).toBe('1752788100-feedback-this-is-a-specific-question-about');
      expect(mockGenerateFeedbackId).toHaveBeenCalledWith('This is a specific question about implementation', expect.any(Number));
    });

    it('[EARS-15] should use current timestamp for ID generation', async () => {
      const payload = {
        entityType: 'task' as const,
        entityId: '1752274500-task-test-task',
        type: 'suggestion' as const,
        content: 'Timestamp test feedback'
      };

      const beforeTime = Math.floor(Date.now() / 1000);
      createFeedbackRecord(payload);
      const afterTime = Math.floor(Date.now() / 1000);

      expect(mockGenerateFeedbackId).toHaveBeenCalledWith(
        'Timestamp test feedback',
        expect.any(Number)
      );

      const calledTimestamp = mockGenerateFeedbackId.mock.calls[0]![1];
      expect(calledTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(calledTimestamp).toBeLessThanOrEqual(afterTime);
    });

    describe('FeedbackRecord Specific Factory Operations (EARS 35-38)', () => {
      it('[EARS-35] should throw DetailedValidationError for invalid entityType', async () => {
        const validationErrors = [
          { field: 'entityType', message: 'must be one of task, execution, feedback', value: 'invalid-entity' }
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

        expect(() => createFeedbackRecord(payload)).toThrow(DetailedValidationError);
      });

      it('[EARS-36] should throw DetailedValidationError for invalid type', async () => {
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

        expect(() => createFeedbackRecord(payload)).toThrow(DetailedValidationError);
      });

      it('[EARS-37] should throw DetailedValidationError for invalid status', async () => {
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

        expect(() => createFeedbackRecord(payload)).toThrow(DetailedValidationError);
      });

      it('[EARS-38] should apply status resolved for type assignment', async () => {
        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          type: 'assignment' as const,
          content: 'Please assign this task to the backend team',
          assignee: 'human:backend-lead'
        };

        const result = createFeedbackRecord(payload);

        expect(result.type).toBe('assignment');
        expect(result.status).toBe('resolved'); // Special default for assignment
        expect(result.assignee).toBe('human:backend-lead');
      });

      it('[EARS-35] should accept valid entityType values', async () => {
        const validEntityTypes = ['task', 'execution', 'feedback'];

        for (const entityType of validEntityTypes) {
          const payload = {
            entityType: entityType as any,
            entityId: `1752274500-${entityType}-test-entity`,
            type: 'suggestion' as const,
            content: `Test feedback for ${entityType}`
          };

          const feedback = createFeedbackRecord(payload);
          expect(feedback.entityType).toBe(entityType);
        }
      });

      it('[EARS-36] should accept valid type values', async () => {
        const validTypes = ['blocking', 'suggestion', 'question', 'approval', 'clarification', 'assignment'];

        for (const type of validTypes) {
          const payload = {
            entityType: 'task' as const,
            entityId: '1752274500-task-test-task',
            type: type as any,
            content: `Test ${type} feedback`
          };

          const feedback = createFeedbackRecord(payload);
          expect(feedback.type).toBe(type);
        }
      });

      it('[EARS-37] should accept valid status values', async () => {
        const validStatuses = ['open', 'acknowledged', 'resolved', 'wontfix'];

        for (const status of validStatuses) {
          const payload = {
            entityType: 'task' as const,
            entityId: '1752274500-task-test-task',
            type: 'suggestion' as const,
            content: 'Test feedback for status validation',
            status: status as any
          };

          const feedback = createFeedbackRecord(payload);
          expect(feedback.status).toBe(status);
        }
      });
    });

    describe('FeedbackRecord Metadata Factory Operations (EARS 57-60)', () => {
      it('[EARS-57] should preserve metadata field when provided', async () => {
        const payload = {
          entityType: 'execution' as const,
          entityId: '1752275500-exec-test-execution',
          type: 'approval' as const,
          content: 'Approved with additional context',
          metadata: {
            reviewerId: 'reviewer-123',
            approvalLevel: 'senior'
          }
        };

        const result = createFeedbackRecord(payload);

        expect(result.metadata).toEqual({
          reviewerId: 'reviewer-123',
          approvalLevel: 'senior'
        });
      });

      it('[EARS-58] should preserve complex metadata with nested structures', async () => {
        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          type: 'blocking' as const,
          content: 'Blocking issue with detailed context',
          metadata: {
            issueId: 'ISSUE-001',
            details: {
              severity: 'high',
              category: 'security'
            },
            affectedFiles: ['src/config.ts', 'src/auth.ts']
          }
        };

        const result = createFeedbackRecord(payload);

        expect(result.metadata).toEqual({
          issueId: 'ISSUE-001',
          details: {
            severity: 'high',
            category: 'security'
          },
          affectedFiles: ['src/config.ts', 'src/auth.ts']
        });
      });

      it('[EARS-59] should accept FeedbackRecord without metadata', async () => {
        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          type: 'question' as const,
          content: 'Feedback without metadata field'
        };

        const result = createFeedbackRecord(payload);

        expect(result.metadata).toBeUndefined();
      });

      it('[EARS-60] should accept empty metadata object', async () => {
        const payload = {
          entityType: 'task' as const,
          entityId: '1752274500-task-test-task',
          type: 'suggestion' as const,
          content: 'Feedback with empty metadata',
          metadata: {}
        };

        const result = createFeedbackRecord(payload);

        expect(result.metadata).toEqual({});
      });
    });

    describe('FeedbackRecord Typed Metadata Helpers (EARS 61-65)', () => {
      it('[EARS-61] should allow FeedbackRecord with typed review metadata', () => {
        type ReviewMetadata = {
          reviewerId: string;
          reviewDate: string;
          score: number;
        };

        const reviewMetadata: ReviewMetadata = {
          reviewerId: 'reviewer-456',
          reviewDate: '2025-01-15',
          score: 95
        };

        const typedRecord: FeedbackRecord<ReviewMetadata> = {
          id: '1752788500-feedback-review',
          entityType: 'execution',
          entityId: '1752275500-exec-test',
          type: 'approval',
          status: 'resolved',
          content: 'Code review completed',
          metadata: reviewMetadata
        };

        const result = createFeedbackRecord(typedRecord);

        expect(result.metadata).toEqual(reviewMetadata);
        expect(result.metadata?.reviewerId).toBe('reviewer-456');
        expect(result.metadata?.score).toBe(95);
      });

      it('[EARS-62] should allow FeedbackRecord with typed issue metadata', () => {
        type IssueMetadata = {
          issueId: string;
          severity: string;
          file: string;
          line: number;
        };

        const issueMetadata: IssueMetadata = {
          issueId: 'SEC-001',
          severity: 'critical',
          file: 'src/config.ts',
          line: 42
        };

        const typedRecord: FeedbackRecord<IssueMetadata> = {
          id: '1752788500-feedback-issue',
          entityType: 'execution',
          entityId: '1752275500-exec-scan',
          type: 'blocking',
          status: 'open',
          content: 'Critical issue found in config',
          metadata: issueMetadata
        };

        const result = createFeedbackRecord(typedRecord);

        expect(result.metadata).toEqual(issueMetadata);
        expect(result.metadata?.issueId).toBe('SEC-001');
        expect(result.metadata?.line).toBe(42);
      });

      it('[EARS-63] should allow Partial<FeedbackRecord<T>> for factory input', () => {
        type ApprovalContext = {
          approvedBy: string;
          expiresAt?: string;
        };

        const payload: Partial<FeedbackRecord<ApprovalContext>> = {
          entityType: 'task',
          entityId: '1752274500-task-test',
          type: 'approval',
          content: 'Approved with context',
          metadata: { approvedBy: 'lead-dev', expiresAt: '2025-12-31' }
        };

        const result = createFeedbackRecord(payload);

        expect(result.metadata?.approvedBy).toBe('lead-dev');
        expect(result.metadata?.expiresAt).toBe('2025-12-31');
      });

      it('[EARS-64] should allow custom metadata types defined by consumers', () => {
        type CustomFeedbackContext = {
          source: string;
          priority: number;
          tags: string[];
        };

        const customMetadata: CustomFeedbackContext = {
          source: 'automated-scan',
          priority: 1,
          tags: ['security', 'urgent']
        };

        const typedRecord: FeedbackRecord<CustomFeedbackContext> = {
          id: '1752788500-feedback-custom',
          entityType: 'task',
          entityId: '1752274500-task-test',
          type: 'blocking',
          status: 'open',
          content: 'Custom context feedback',
          metadata: customMetadata
        };

        const result = createFeedbackRecord(typedRecord);

        expect(result.metadata).toEqual(customMetadata);
        expect(result.metadata?.source).toBe('automated-scan');
        expect(result.metadata?.priority).toBe(1);
        expect(result.metadata?.tags).toEqual(['security', 'urgent']);
      });

      it('[EARS-65] should allow FeedbackRecord<T> without metadata (optional)', () => {
        type SomeMetadata = {
          field: string;
        };

        const typedRecord: FeedbackRecord<SomeMetadata> = {
          id: '1752788500-feedback-no-metadata',
          entityType: 'task',
          entityId: '1752274500-task-simple',
          type: 'question',
          status: 'open',
          content: 'Question without metadata field'
        };

        const result = createFeedbackRecord(typedRecord);

        expect(result.metadata).toBeUndefined();
      });
    });
  });
});

