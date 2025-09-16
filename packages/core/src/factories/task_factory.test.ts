import { createTaskRecord } from './task_factory';
import type { TaskRecord } from '../types/task_record';
import { DetailedValidationError } from '../validation/common';

// Manual mock for validateTaskRecordDetailed
jest.mock('../validation/task_validator', () => ({
  validateTaskRecordDetailed: jest.fn()
    .mockReturnValue({ isValid: true, errors: [] }),
}));

describe('createTaskRecord', () => {
  beforeEach(() => {
    // Reset mock to default success state before each test
    const { validateTaskRecordDetailed } = require('../validation/task_validator');
    (validateTaskRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-2 & EARS-3] should create a valid task record with defaults and a generated ID', async () => {
    const payload: Partial<TaskRecord> = {
      title: 'Implement user authentication',
      description: 'Create a complete user authentication system with JWT tokens',
      priority: 'high',
      tags: ['skill:typescript', 'area:backend'],
    };

    const task = await createTaskRecord(payload);

    expect(task.id).toMatch(/^\d{10}-task-implement-user-authentication$/); // ID is generated
    expect(task.status).toBe('draft'); // Default status
    expect(task.priority).toBe('high');
    expect(task.title).toBe('Implement user authentication');
    expect(task.description).toBe('Create a complete user authentication system with JWT tokens');
    expect(task.tags).toEqual(['skill:typescript', 'area:backend']);
  });

  it('[EARS-1] should throw DetailedValidationError for missing/invalid fields', async () => {
    const { validateTaskRecordDetailed } = require('../validation/task_validator');
    (validateTaskRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'title', message: 'must be a non-empty string', value: '' },
        { field: 'description', message: 'must be at least 10 characters', value: 'short' }
      ]
    });

    const payload: Partial<TaskRecord> = {
      title: '',
      description: 'short',
    };

    await expect(createTaskRecord(payload)).rejects.toThrow(DetailedValidationError);
  });

  it('[EARS-4] should use a provided ID instead of generating one', async () => {
    const payload: Partial<TaskRecord> = {
      id: '1752274500-task-custom-task-id',
      title: 'Custom Task',
      description: 'A task with a custom ID',
      priority: 'medium',
      tags: ['custom'],
    };

    const task = await createTaskRecord(payload);
    expect(task.id).toBe('1752274500-task-custom-task-id');
  });

  it('[EARS-5] should throw DetailedValidationError if the created record fails validation', async () => {
    const { validateTaskRecordDetailed } = require('../validation/task_validator');
    (validateTaskRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'status', message: 'must be one of: draft, review, ready, active, done, archived, paused, discarded', value: 'invalid-status' }
      ]
    });

    const payload: Partial<TaskRecord> = {
      title: 'Valid Title',
      description: 'Valid description that is long enough',
      status: 'invalid-status' as any,
    };

    await expect(createTaskRecord(payload)).rejects.toThrow(DetailedValidationError);
  });

  it('[EARS-6] should set default values for optional fields', async () => {
    const payload: Partial<TaskRecord> = {
      title: 'Minimal Task',
      description: 'A task with minimal required fields',
    };

    const task = await createTaskRecord(payload);

    expect(task.status).toBe('draft');
    expect(task.priority).toBe('medium');
    expect(task.tags).toEqual([]);
    expect(task.cycleIds).toBeUndefined();
    expect(task.references).toBeUndefined();
    expect(task.notes).toBeUndefined();
  });

  it('[EARS-7] should preserve provided optional fields', async () => {
    const payload: Partial<TaskRecord> = {
      title: 'Complex Task',
      description: 'A task with all optional fields provided',
      cycleIds: ['1752274500-cycle-sprint-1'],
      references: ['file:packages/core/src/auth.ts', 'url:https://jwt.io'],
      notes: 'This task requires careful attention to security',
    };

    const task = await createTaskRecord(payload);

    expect(task.cycleIds).toEqual(['1752274500-cycle-sprint-1']);
    expect(task.references).toEqual(['file:packages/core/src/auth.ts', 'url:https://jwt.io']);
    expect(task.notes).toBe('This task requires careful attention to security');
  });

  it('[EARS-8] should generate ID with current timestamp when title is provided', async () => {
    const beforeTimestamp = Math.floor(Date.now() / 1000);

    const payload: Partial<TaskRecord> = {
      title: 'Test Task for ID Generation',
      description: 'Testing timestamp-based ID generation',
    };

    const task = await createTaskRecord(payload);
    const afterTimestamp = Math.floor(Date.now() / 1000);

    // Extract timestamp from generated ID
    const idParts = task.id.split('-');
    const extractedTimestamp = parseInt(idParts[0] || '0');

    expect(extractedTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(extractedTimestamp).toBeLessThanOrEqual(afterTimestamp);
    expect(task.id).toMatch(/^\d{10}-task-test-task-for-id-generation$/);
  });

  describe('TaskRecord Specific Factory Operations (EARS 15-18)', () => {
    it('[EARS-15] should throw DetailedValidationError for invalid status', async () => {
      const { validateTaskRecordDetailed } = require('../validation/task_validator');
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'status', message: 'must be one of draft, review, ready, active, done, archived', value: 'invalid-status' }
        ]
      });

      const payload: Partial<TaskRecord> = {
        title: 'Test Task',
        description: 'Test description for validation',
        status: 'invalid-status' as any
      };

      await expect(createTaskRecord(payload)).rejects.toThrow(DetailedValidationError);

      // Restore mock
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });

    it('[EARS-16] should throw DetailedValidationError for invalid priority', async () => {
      const { validateTaskRecordDetailed } = require('../validation/task_validator');
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'priority', message: 'must be one of low, medium, high, urgent', value: 'invalid-priority' }
        ]
      });

      const payload: Partial<TaskRecord> = {
        title: 'Test Task',
        description: 'Test description for validation',
        priority: 'invalid-priority' as any
      };

      await expect(createTaskRecord(payload)).rejects.toThrow(DetailedValidationError);

      // Restore mock
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });

    it('[EARS-17] should apply default empty array for tags when not provided', async () => {
      const payload: Partial<TaskRecord> = {
        title: 'Task Without Tags',
        description: 'Testing default tags behavior'
        // tags not provided - should default to []
      };

      const task = await createTaskRecord(payload);

      expect(task.tags).toEqual([]); // Default empty array
    });

    it('[EARS-18] should throw DetailedValidationError for title shorter than 3 characters', async () => {
      const { validateTaskRecordDetailed } = require('../validation/task_validator');
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'title', message: 'must be at least 3 characters', value: 'hi' }
        ]
      });

      const payload: Partial<TaskRecord> = {
        title: 'hi', // Too short
        description: 'Test description for validation'
      };

      await expect(createTaskRecord(payload)).rejects.toThrow(DetailedValidationError);

      // Restore mock
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });

    it('[EARS-15] should accept valid status values', async () => {
      const validStatuses = ['draft', 'review', 'ready', 'active', 'done', 'archived'];

      for (const status of validStatuses) {
        const payload: Partial<TaskRecord> = {
          title: `Test Task ${status}`,
          description: 'Test description for status validation',
          status: status as any
        };

        const task = await createTaskRecord(payload);
        expect(task.status).toBe(status);
      }
    });

    it('[EARS-16] should accept valid priority values', async () => {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];

      for (const priority of validPriorities) {
        const payload: Partial<TaskRecord> = {
          title: `Test Task ${priority}`,
          description: 'Test description for priority validation',
          priority: priority as any
        };

        const task = await createTaskRecord(payload);
        expect(task.priority).toBe(priority);
      }
    });
  });
});
