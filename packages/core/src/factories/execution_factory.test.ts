import { createExecutionRecord } from './execution_factory';
import { generateExecutionId } from '../utils/id_generator';
import { DetailedValidationError } from '../validation/common';
import type { ExecutionRecord } from '../record_types';

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

      const result = createExecutionRecord(payload);

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

      const result = createExecutionRecord(payload);

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

      const result = createExecutionRecord(payload);

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

      const result = createExecutionRecord(payload);

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

      expect(() => createExecutionRecord(payload)).toThrow(DetailedValidationError);
      expect(() => createExecutionRecord(payload)).toThrow('ExecutionRecord');
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

      const result = createExecutionRecord(payload);

      expect(result).toEqual(payload);
      expect(mockValidateExecutionRecordDetailed).toHaveBeenCalledWith(payload);
    });

    it('[EARS-7] should handle empty references array', async () => {
      const payload = {
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature',
        references: []
      };

      const result = createExecutionRecord(payload);

      expect(result.references).toEqual([]);
    });

    it('[EARS-8] should use current timestamp when none provided', async () => {
      const payload = {
        taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature',
        title: 'Timestamp Test'
      };

      const beforeTime = Math.floor(Date.now() / 1000);
      createExecutionRecord(payload);
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

        expect(() => createExecutionRecord(payload)).toThrow(DetailedValidationError);
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

        expect(() => createExecutionRecord(payload)).toThrow(DetailedValidationError);
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

        expect(() => createExecutionRecord(payload)).toThrow(DetailedValidationError);
      });

      it('[EARS-22] should accept valid taskId', async () => {
        const payload = {
          taskId: '1752274500-task-valid-test-task',
          result: 'Successfully completed execution with valid taskId'
        };

        const result = createExecutionRecord(payload);

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

          const execution = createExecutionRecord(payload);
          expect(execution.result).toBe(result);
        }
      });
    });

    describe('Metadata Field Support (EARS 48-51)', () => {
      it('[EARS-48] should preserve metadata field when provided', async () => {
        const payload = {
          taskId: '1752274500-task-test-task',
          result: 'Successfully completed with metadata',
          type: 'analysis' as const,
          title: 'Test with Metadata',
          metadata: {
            scannedFiles: 245,
            duration_ms: 1250
          }
        };

        const result = createExecutionRecord(payload);

        expect(result.metadata).toEqual({
          scannedFiles: 245,
          duration_ms: 1250
        });
      });

      it('[EARS-49] should preserve complex metadata with nested structures', async () => {
        const payload = {
          taskId: '1752274500-task-test-task',
          result: 'GDPR audit completed with findings',
          type: 'analysis' as const,
          title: 'GDPR Audit Scan',
          metadata: {
            scannedFiles: 245,
            findings: [
              { id: 'SEC-001', severity: 'critical', file: 'src/config.ts', line: 5 }
            ],
            summary: { critical: 1, high: 0, medium: 0, low: 0 }
          }
        };

        const result = createExecutionRecord(payload);

        expect(result.metadata).toEqual({
          scannedFiles: 245,
          findings: [
            { id: 'SEC-001', severity: 'critical', file: 'src/config.ts', line: 5 }
          ],
          summary: { critical: 1, high: 0, medium: 0, low: 0 }
        });
      });

      it('[EARS-50] should accept ExecutionRecord without metadata', async () => {
        const payload = {
          taskId: '1752274500-task-test-task',
          result: 'Execution without metadata field'
        };

        const result = createExecutionRecord(payload);

        expect(result.metadata).toBeUndefined();
      });

      it('[EARS-51] should accept empty metadata object', async () => {
        const payload = {
          taskId: '1752274500-task-test-task',
          result: 'Execution with empty metadata',
          metadata: {}
        };

        const result = createExecutionRecord(payload);

        expect(result.metadata).toEqual({});
      });
    });

    describe('Generic Metadata Type Support (EARS 52-56)', () => {
      it('[EARS-52] should allow ExecutionRecord with typed audit metadata', () => {
        // Define metadata type inline - each module can define its own
        type AuditMetadata = {
          scannedFiles: number;
          findings: Array<{ id: string; severity: string; file: string }>;
          summary: { critical: number; high: number };
        };

        const auditMetadata: AuditMetadata = {
          scannedFiles: 245,
          findings: [{ id: 'SEC-001', severity: 'critical', file: 'src/config.ts' }],
          summary: { critical: 1, high: 0 }
        };

        // ExecutionRecord<T> provides compile-time checking for metadata structure
        const typedRecord: ExecutionRecord<AuditMetadata> = {
          id: '1752275500-exec-audit',
          taskId: '1752274500-task-compliance',
          type: 'analysis',
          title: 'Audit Scan',
          result: 'Scanned 245 files with 1 critical finding',
          metadata: auditMetadata
        };

        // Pass directly to factory - no field-by-field copying needed
        const result = createExecutionRecord(typedRecord);

        expect(result.metadata).toEqual(auditMetadata);
        expect(result.metadata?.scannedFiles).toBe(245);
        expect(result.metadata?.findings).toHaveLength(1);
      });

      it('[EARS-53] should allow ExecutionRecord with typed metrics metadata', () => {
        type TestMetrics = {
          durationMs: number;
          testsPassed: number;
          coveragePercent: number;
        };

        const metrics: TestMetrics = {
          durationMs: 5000,
          testsPassed: 42,
          coveragePercent: 95.5
        };

        const typedRecord: ExecutionRecord<TestMetrics> = {
          id: '1752275500-exec-test-run',
          taskId: '1752274500-task-run-tests',
          type: 'progress',
          title: 'Test Suite Execution',
          result: 'All 42 tests passed with 95.5% coverage',
          metadata: metrics
        };

        const result = createExecutionRecord(typedRecord);

        expect(result.metadata).toEqual(metrics);
        expect(result.metadata?.durationMs).toBe(5000);
        expect(result.metadata?.testsPassed).toBe(42);
      });

      it('[EARS-54] should allow Partial<ExecutionRecord<T>> for factory input', () => {
        type PerformanceMetrics = {
          durationMs: number;
          memoryMb?: number;
        };

        // Partial allows omitting non-required fields
        const payload: Partial<ExecutionRecord<PerformanceMetrics>> = {
          taskId: '1752274500-task-performance',
          result: 'Performance test completed successfully',
          metadata: { durationMs: 1500, memoryMb: 128 }
        };

        const result = createExecutionRecord(payload);

        expect(result.metadata?.durationMs).toBe(1500);
        expect(result.metadata?.memoryMb).toBe(128);
      });

      it('[EARS-55] should allow custom metadata types defined by consumers', () => {
        // Consumers can define their own metadata types
        type CustomAuditMetadata = {
          auditor: string;
          auditDate: string;
          passRate: number;
          issues: string[];
        };

        const customMetadata: CustomAuditMetadata = {
          auditor: 'security-team',
          auditDate: '2025-01-15',
          passRate: 98.5,
          issues: ['minor-issue-1', 'minor-issue-2']
        };

        const typedRecord: ExecutionRecord<CustomAuditMetadata> = {
          id: '1752275500-exec-custom-audit',
          taskId: '1752274500-task-security-audit',
          type: 'analysis',
          title: 'Security Audit',
          result: 'Security audit completed with 98.5% pass rate',
          metadata: customMetadata
        };

        const result = createExecutionRecord(typedRecord);

        expect(result.metadata).toEqual(customMetadata);
        expect(result.metadata?.auditor).toBe('security-team');
        expect(result.metadata?.passRate).toBe(98.5);
      });

      it('[EARS-56] should allow ExecutionRecord<T> without metadata (optional)', () => {
        type SomeMetadata = {
          field: string;
        };

        // ExecutionRecord<T> works without metadata since it's optional
        const typedRecord: ExecutionRecord<SomeMetadata> = {
          id: '1752275500-exec-no-metadata',
          taskId: '1752274500-task-simple',
          type: 'progress',
          title: 'Simple Progress',
          result: 'Progress without metadata field'
          // metadata is optional
        };

        const result = createExecutionRecord(typedRecord);

        expect(result.metadata).toBeUndefined();
      });
    });
  });
});

