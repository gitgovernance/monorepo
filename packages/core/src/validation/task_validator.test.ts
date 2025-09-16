import {
  isTaskRecord,
  validateTaskRecordDetailed,
  validateFullTaskRecord
} from './task_validator';
import type { TaskRecord } from '../types/task_record';
import type { GitGovRecord } from '../models';

describe('TaskValidator Module', () => {
  const validTaskPayload: TaskRecord = {
    id: '1752274500-task-implement-auth',
    title: 'Implement user authentication',
    status: 'draft',
    priority: 'high',
    description: 'Create a complete user authentication system with JWT tokens and secure session management',
    tags: ['skill:typescript', 'area:backend', 'category:feature']
  };

  const invalidTaskPayloadWithoutId = {
    title: 'Task without ID',
    status: 'draft',
    priority: 'high',
    description: 'This task is missing a required ID field',
    tags: ['test']
  };

  const invalidTaskPayloadWithShortDescription = {
    id: '1752274500-task-short-desc',
    title: 'Task with short description',
    status: 'draft',
    priority: 'high',
    description: 'Short', // Too short according to schema (min 10 chars)
    tags: ['test']
  };

  describe('validateFullTaskRecord', () => {
    const mockGetActorPublicKey = jest.fn().mockResolvedValue('mock-public-key');

    const validRecord: GitGovRecord & { payload: TaskRecord } = {
      header: {
        version: '1.0',
        type: 'task',
        payloadChecksum: 'mock-checksum',
        signatures: [{
          keyId: 'human:test-user',
          role: 'author',
          signature: 'mock-signature',
          timestamp: 1752274500,
          timestamp_iso: '2025-07-25T14:30:00Z'
        }]
      },
      payload: validTaskPayload
    };

    beforeEach(() => {
      mockGetActorPublicKey.mockClear();
    });

    it('[EARS-1] should throw SchemaValidationError for invalid payload', async () => {
      const invalidRecord = {
        ...validRecord,
        payload: invalidTaskPayloadWithoutId as TaskRecord
      };

      await expect(validateFullTaskRecord(invalidRecord, mockGetActorPublicKey))
        .rejects.toThrow('TaskRecord payload failed schema validation');
    });

    it('[EARS-2] should throw ChecksumMismatchError for invalid checksum', async () => {
      // Mock signature verification to return true to isolate checksum test
      const { verifySignatures } = require('../crypto/signatures');
      jest.spyOn(require('../crypto/signatures'), 'verifySignatures')
        .mockResolvedValue(true);

      const recordWithWrongChecksum = {
        ...validRecord,
        header: {
          ...validRecord.header,
          payloadChecksum: 'wrong-checksum'
        }
      };

      await expect(validateFullTaskRecord(recordWithWrongChecksum, mockGetActorPublicKey))
        .rejects.toThrow('Payload checksum does not match the header');
    });

    it('[EARS-3] should throw SignatureVerificationError for invalid signatures', async () => {
      // Calculate correct checksum to isolate signature test
      const { calculatePayloadChecksum } = require('../crypto/checksum');
      const actualChecksum = calculatePayloadChecksum(validRecord.payload);

      const recordWithCorrectChecksum = {
        ...validRecord,
        header: {
          ...validRecord.header,
          payloadChecksum: actualChecksum
        }
      };

      // Mock signature verification to return false
      const { verifySignatures } = require('../crypto/signatures');
      jest.spyOn(require('../crypto/signatures'), 'verifySignatures')
        .mockResolvedValue(false);

      await expect(validateFullTaskRecord(recordWithCorrectChecksum, mockGetActorPublicKey))
        .rejects.toThrow('Signature verification failed');
    });

    it('[EARS-4] should complete without errors for a fully valid record', async () => {
      // Calculate correct checksum and mock valid signature
      const { calculatePayloadChecksum } = require('../crypto/checksum');
      const actualChecksum = calculatePayloadChecksum(validRecord.payload);

      const recordWithCorrectChecksum = {
        ...validRecord,
        header: {
          ...validRecord.header,
          payloadChecksum: actualChecksum
        }
      };

      // Mock signature verification to return true
      const { verifySignatures } = require('../crypto/signatures');
      jest.spyOn(require('../crypto/signatures'), 'verifySignatures')
        .mockResolvedValue(true);

      await expect(validateFullTaskRecord(recordWithCorrectChecksum, mockGetActorPublicKey))
        .resolves.not.toThrow();
    });
  });

  describe('isTaskRecord', () => {
    it('[EARS-5 & EARS-6] should correctly identify valid and invalid records', () => {
      expect(isTaskRecord(validTaskPayload)).toBe(true);
      expect(isTaskRecord(invalidTaskPayloadWithoutId)).toBe(false);
    });

    it('[EARS-7] should return false for non-object input', () => {
      expect(isTaskRecord(null)).toBe(false);
      expect(isTaskRecord(undefined)).toBe(false);
      expect(isTaskRecord('string')).toBe(false);
      expect(isTaskRecord(123)).toBe(false);
    });

    it('[EARS-8] should validate ID format (timestamp-task-slug)', () => {
      const taskWithInvalidId = {
        ...validTaskPayload,
        id: 'invalid-id-format'
      };
      expect(isTaskRecord(taskWithInvalidId)).toBe(false);
    });

    it('[EARS-9] should validate tag format (key:value pattern)', () => {
      const taskWithInvalidTags = {
        ...validTaskPayload,
        tags: ['valid-tag', 'skill:typescript', 'INVALID TAG WITH SPACES']
      };
      expect(isTaskRecord(taskWithInvalidTags)).toBe(false);
    });

    it('[EARS-10] should validate cycleIds format when provided', () => {
      const taskWithInvalidCycleIds = {
        ...validTaskPayload,
        cycleIds: ['invalid-cycle-id', '1752274500-cycle-valid']
      };
      expect(isTaskRecord(taskWithInvalidCycleIds)).toBe(false);
    });

    it('[EARS-11] should return false for object with wrong field types', () => {
      const invalidPayload = {
        ...validTaskPayload,
        status: 'invalid-status', // Not in enum
        priority: 123 // Should be string
      };
      expect(isTaskRecord(invalidPayload)).toBe(false);
    });
  });

  describe('validateTaskRecordDetailed', () => {
    it('[EARS-12] should return success for valid TaskRecord', () => {
      const result = validateTaskRecordDetailed(validTaskPayload);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-13] should return detailed errors for invalid TaskRecord', () => {
      const result = validateTaskRecordDetailed(invalidTaskPayloadWithoutId);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-14] should provide specific error details for each invalid field', () => {
      const invalidTask = {
        id: 'invalid-format', // Wrong ID pattern
        title: '', // Empty string (too short)
        status: 'invalid-status', // Invalid status
        priority: 'invalid-priority', // Invalid priority
        description: 'short', // Too short
        tags: 'not-an-array' // Should be array
      };

      const result = validateTaskRecordDetailed(invalidTask);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1); // Multiple errors
    });

    it('[EARS-15] should validate optional fields when provided', () => {
      const taskWithOptionalFields: TaskRecord = {
        ...validTaskPayload,
        cycleIds: ['1752274500-cycle-sprint-1'],
        references: ['file:src/auth.ts', 'url:https://jwt.io'],
        notes: 'Important security considerations for this task'
      };

      const result = validateTaskRecordDetailed(taskWithOptionalFields);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-16] should return multiple errors for multiple invalid fields', () => {
      const taskWithMultipleInvalidFields = {
        ...validTaskPayload,
        id: 'invalid-id-format',
        tags: ['valid-tag', 'skill:typescript', 'INVALID TAG WITH SPACES'],
        cycleIds: ['invalid-cycle-id', '1752274500-cycle-valid']
      };

      const result = validateTaskRecordDetailed(taskWithMultipleInvalidFields);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1); // Multiple errors
      expect(result.errors.some(err => err.field.includes('id'))).toBe(true);
      expect(result.errors.some(err => err.field.includes('tags') || err.field.includes('cycleIds'))).toBe(true);
    });
  });
});
