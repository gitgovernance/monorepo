import { createExecutionRecord } from './execution_factory';
import { generateExecutionId } from '../utils/id_generator';
import { DetailedValidationError } from '../validation/common';

// Mock the validator
jest.mock('../validation/execution_validator', () => ({
  validateExecutionRecordDetailed: jest.fn()
}));

// Mock ID generator
jest.mock('../utils/id_generator', () => ({
  generateExecutionId: jest.fn()
}));

describe('ExecutionRecord Factory', () => {
  const mockValidateExecutionRecordDetailed = require('../validation/execution_validator').validateExecutionRecordDetailed;
  const mockGenerateExecutionId = generateExecutionId as jest.MockedFunction<typeof generateExecutionId>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default successful validation
    mockValidateExecutionRecordDetailed.mockReturnValue({
      isValid: true,
      errors: []
    });

    // Default ID generation
    mockGenerateExecutionId.mockReturnValue('1752275500-exec-test-execution');
  });

  describe('createExecutionRecord', () => {
    it('[EARS-1] should create a valid ExecutionRecord with all required fields', async () => {
      const payload = {
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature',
        type: 'progress' as const,
        title: 'Test Execution',
        notes: 'Additional context about the execution',
        references: ['commit:abc123']
      };

      const result = await createExecutionRecord(payload);

      expect(result).toEqual({
        id: '1752275500-exec-test-execution',
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature',
        type: 'progress' as const,
        title: 'Test Execution',
        notes: 'Additional context about the execution',
        references: ['commit:abc123']
      });

      expect(mockValidateExecutionRecordDetailed).toHaveBeenCalledWith(result);
    });

    it('[EARS-2] should apply default values for missing optional fields', async () => {
      const payload = {
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature'
      };

      const result = await createExecutionRecord(payload);

      expect(result).toEqual({
        id: '1752275500-exec-test-execution',
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature',
        type: undefined,
        title: undefined,
        notes: undefined,
        references: undefined
      });

      expect(mockGenerateExecutionId).toHaveBeenCalledWith('execution', expect.any(Number));
    });

    it('[EARS-3] should preserve provided ID when specified', async () => {
      const payload = {
        id: '1752275600-exec-custom-id',
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature'
      };

      const result = await createExecutionRecord(payload);

      expect(result.id).toBe('1752275600-exec-custom-id');
      expect(mockGenerateExecutionId).not.toHaveBeenCalled();
    });

    it('[EARS-4] should generate ID from title when title is provided but ID is not', async () => {
      const payload = {
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature',
        title: 'Custom Title Execution'
      };

      mockGenerateExecutionId.mockReturnValue('1752275500-exec-custom-title-execution');

      const result = await createExecutionRecord(payload);

      expect(result.id).toBe('1752275500-exec-custom-title-execution');
      expect(mockGenerateExecutionId).toHaveBeenCalledWith('Custom Title Execution', expect.any(Number));
    });

    it('[EARS-5] should throw DetailedValidationError when validation fails', async () => {
      const payload = {
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature'
      };

      const validationErrors = [
        { field: 'taskId', message: 'must match pattern', value: payload.taskId }
      ];

      mockValidateExecutionRecordDetailed.mockReturnValue({
        isValid: false,
        errors: validationErrors
      });

      await expect(createExecutionRecord(payload)).rejects.toThrow(DetailedValidationError);
      await expect(createExecutionRecord(payload)).rejects.toThrow('ExecutionRecord');
    });

    it('[EARS-6] should preserve all provided fields in the output', async () => {
      const payload = {
        id: '1752275600-exec-preserve-fields',
        taskId: '1752274500-task-test-task',
        result: 'All fields preserved',
        type: 'completion' as const,
        title: 'Preserve Fields Test',
        notes: 'Testing field preservation',
        references: ['commit:def456', 'file:test.ts']
      };

      const result = await createExecutionRecord(payload);

      expect(result).toEqual(payload);
      expect(mockValidateExecutionRecordDetailed).toHaveBeenCalledWith(payload);
    });

    it('[EARS-7] should handle empty references array', async () => {
      const payload = {
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature',
        references: []
      };

      const result = await createExecutionRecord(payload);

      expect(result.references).toEqual([]);
    });

    it('[EARS-8] should use current timestamp when none provided', async () => {
      const payload = {
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature',
        title: 'Timestamp Test'
      };

      const beforeTime = Math.floor(Date.now() / 1000);
      await createExecutionRecord(payload);
      const afterTime = Math.floor(Date.now() / 1000);

      expect(mockGenerateExecutionId).toHaveBeenCalledWith(
        'Timestamp Test',
        expect.any(Number)
      );

      const calledTimestamp = mockGenerateExecutionId.mock.calls[0]![1];
      expect(calledTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(calledTimestamp).toBeLessThanOrEqual(afterTime);
    });

    describe('ExecutionRecord Specific Factory Operations (EARS 22-24)', () => {
      it('[EARS-22] should throw DetailedValidationError when taskId is missing', async () => {
        const validationErrors = [
          { field: 'taskId', message: 'must have required property taskId', value: undefined }
        ];

        mockValidateExecutionRecordDetailed.mockReturnValue({
          isValid: false,
          errors: validationErrors
        });

        const payload = {
          result: 'Test execution result'
          // taskId missing - should trigger validation error
        };

        await expect(createExecutionRecord(payload)).rejects.toThrow(DetailedValidationError);
      });

      it('[EARS-23] should throw DetailedValidationError for invalid taskId pattern', async () => {
        const validationErrors = [
          { field: 'taskId', message: 'must match task ID pattern', value: 'invalid-task-id' }
        ];

        mockValidateExecutionRecordDetailed.mockReturnValue({
          isValid: false,
          errors: validationErrors
        });

        const payload = {
          taskId: 'invalid-task-id',
          result: 'Test execution result'
        };

        await expect(createExecutionRecord(payload)).rejects.toThrow(DetailedValidationError);
      });

      it('[EARS-24] should throw DetailedValidationError for result shorter than 10 characters', async () => {
        const validationErrors = [
          { field: 'result', message: 'must be at least 10 characters', value: 'short' }
        ];

        mockValidateExecutionRecordDetailed.mockReturnValue({
          isValid: false,
          errors: validationErrors
        });

        const payload = {
          taskId: '1752274500-task-test-task',
          result: 'short' // Too short
        };

        await expect(createExecutionRecord(payload)).rejects.toThrow(DetailedValidationError);
      });

      it('[EARS-22] should accept valid taskId', async () => {
        const payload = {
          taskId: '1752274500-task-valid-test-task',
          result: 'Successfully completed execution with valid taskId'
        };

        const result = await createExecutionRecord(payload);

        expect(result.taskId).toBe('1752274500-task-valid-test-task');
        expect(result.result).toBe('Successfully completed execution with valid taskId');
      });

      it('[EARS-24] should accept result with 10 or more characters', async () => {
        const validResults = [
          'Exactly 10', // Exactly 10 characters
          'This is a longer result description', // Much longer
          'Minimum length result for validation testing' // Even longer
        ];

        for (const result of validResults) {
          const payload = {
            taskId: '1752274500-task-test-task',
            result: result
          };

          const execution = await createExecutionRecord(payload);
          expect(execution.result).toBe(result);
        }
      });
    });
  });
});

