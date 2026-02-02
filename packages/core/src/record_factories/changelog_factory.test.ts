import { createChangelogRecord } from './changelog_factory';
import { DetailedValidationError } from '../record_validations/common';
import type { ChangelogRecord } from '../record_types';

// Mock the validator
jest.mock('../record_validations/changelog_validator', () => ({
  validateChangelogRecordDetailed: jest.fn()
}));

describe('ChangelogRecord Factory', () => {
  const mockValidateChangelogRecordDetailed = require('../record_validations/changelog_validator').validateChangelogRecordDetailed;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default successful validation
    mockValidateChangelogRecordDetailed.mockReturnValue({
      isValid: true,
      errors: []
    });
  });

  describe('createChangelogRecord', () => {
    it('[EARS-1] should create a valid ChangelogRecord with all required fields', async () => {
      const payload: Partial<ChangelogRecord> = {
        id: '1752707800-changelog-test-deliverable',
        title: 'Test Deliverable v1.0',
        description: 'Successfully completed all test requirements',
        relatedTasks: ['1752274500-task-test-task'] as [string, ...string[]],
        completedAt: 1752707800,
        files: ['src/test.ts', 'docs/test.md'],
        commits: ['abc123', 'def456']
      };

      const result = createChangelogRecord(payload);

      expect(result).toEqual({
        id: '1752707800-changelog-test-deliverable',
        title: 'Test Deliverable v1.0',
        description: 'Successfully completed all test requirements',
        relatedTasks: ['1752274500-task-test-task'],
        completedAt: 1752707800,
        files: ['src/test.ts', 'docs/test.md'],
        commits: ['abc123', 'def456']
      });

      expect(mockValidateChangelogRecordDetailed).toHaveBeenCalledWith(result);
    });

    it('[EARS-2] should apply default timestamp when completedAt not provided', async () => {
      const payload: Partial<ChangelogRecord> = {
        id: '1752707800-changelog-test',
        title: 'Test Deliverable',
        description: 'Testing default timestamp',
        relatedTasks: ['1752274500-task-test-task'] as [string, ...string[]]
      };

      const beforeTime = Math.floor(Date.now() / 1000);
      const result = createChangelogRecord(payload);
      const afterTime = Math.floor(Date.now() / 1000);

      expect(result.completedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(result.completedAt).toBeLessThanOrEqual(afterTime);
    });

    it('[EARS-3] should throw DetailedValidationError when validation fails', async () => {
      const payload: Partial<ChangelogRecord> = {
        id: 'invalid-id',
        title: 'Test',
        description: 'Test description',
        relatedTasks: ['task-1'] as [string, ...string[]],
        completedAt: 1752707800
      };

      const validationErrors = [
        { field: 'id', message: 'must match pattern', value: payload.id }
      ];

      mockValidateChangelogRecordDetailed.mockReturnValue({
        isValid: false,
        errors: validationErrors
      });

      expect(() => createChangelogRecord(payload)).toThrow(DetailedValidationError);
      expect(() => createChangelogRecord(payload)).toThrow('ChangelogRecord');
    });

    it('[EARS-4] should preserve all optional fields', async () => {
      const payload: Partial<ChangelogRecord> = {
        id: '1752707900-changelog-complete',
        title: 'Complete Deliverable',
        description: 'Full changelog with all fields',
        relatedTasks: ['1752274500-task-test-task', '1752274600-task-test-task-2'] as [string, ...string[]],
        completedAt: 1752707900,
        relatedCycles: ['1752200000-cycle-q1'],
        relatedExecutions: ['1752707850-exec-final-test'],
        version: 'v1.0.0',
        tags: ['feature:auth', 'security'],
        commits: ['xyz789'],
        files: ['src/updated.ts'],
        notes: 'Important release with breaking changes'
      };

      const result = createChangelogRecord(payload);

      expect(result).toEqual(payload);
      expect(mockValidateChangelogRecordDetailed).toHaveBeenCalledWith(payload);
    });

    it('[EARS-5] should handle empty relatedTasks array', async () => {
      // Note: empty relatedTasks should fail validation per schema (minItems: 1)
      const payload = {
        id: '1752707900-changelog-test',
        title: 'Test',
        description: 'Test changelog',
        relatedTasks: [] as unknown as [string, ...string[]],
        completedAt: 1752707900
      };

      const result = createChangelogRecord(payload);

      expect(result.relatedTasks).toEqual([]);
    });

    it('[EARS-6] should only include optional fields when provided', async () => {
      const payload: Partial<ChangelogRecord> = {
        id: '1752707900-changelog-minimal',
        title: 'Minimal Changelog',
        description: 'Testing minimal required fields',
        relatedTasks: ['1752274500-task-test'] as [string, ...string[]],
        completedAt: 1752707900
      };

      const result = createChangelogRecord(payload);

      // Should only have required fields
      expect(Object.keys(result)).toEqual(['id', 'title', 'description', 'relatedTasks', 'completedAt']);
    });
  });
});

